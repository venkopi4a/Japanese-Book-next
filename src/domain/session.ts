import { hasKanji } from './kana';
import { isDue, overdueDays, reasonFor } from './scheduler';
import type { Attempt, ExerciseType, Skill, SkillState, Word } from './types';

export interface PlanItem { wordId: string; skill: Skill; kind: 'new' | 'review'; reason: string }
export interface PlanOptions { now: number; newLimit?: number; reviewLimit?: number; introducedToday?: number; romaji?: boolean }
export interface Plan { reviews: PlanItem[]; news: PlanItem[]; overdue: number; deferred: number }

export const DEFAULT_NEW_LIMIT = 10;
export const DEFAULT_REVIEW_LIMIT = 100;

export const EXERCISE_FOR: Record<Skill, ExerciseType> = {
  recognition: 'meaning-mc', recall: 'recall-mc', reading: 'reading-mc', listening: 'listening-mc', spelling: 'spelling-type',
};

const key = (wordId: string, skill: Skill) => `${wordId}|${skill}`;

/** Skills a word offers once its earlier skills are in place. */
export function unlockedSkills(word: Word, states: Map<Skill, SkillState>, romaji = false): Skill[] {
  const out: Skill[] = ['recognition'];
  const rec = states.get('recognition');
  if (rec && rec.box >= 2) {
    out.push('recall', 'listening');
    if (hasKanji(word.text) || romaji) out.push('reading'); // kana-only words only get a reading skill in beginner romaji mode
    if ((states.get('recall')?.box ?? 0) >= 2) out.push('spelling');
  }
  return out;
}

function indexStates(states: SkillState[]) {
  const byWord = new Map<string, Map<Skill, SkillState>>();
  for (const s of states) {
    if (!byWord.has(s.wordId)) byWord.set(s.wordId, new Map());
    byWord.get(s.wordId)!.set(s.skill, s);
  }
  return byWord;
}

/** Today's plan: overdue and due reviews first, then a limited number of new words. */
export function planToday(words: Word[], states: SkillState[], opts: PlanOptions): Plan {
  const { now } = opts;
  const byWord = indexStates(states);
  const reviews: (PlanItem & { late: number; box: number; lapses: number })[] = [];
  const newWords: Word[] = [];
  for (const w of words) {
    if (w.deletedAt) continue;
    const ws = byWord.get(w.id) ?? new Map<Skill, SkillState>();
    if (!ws.has('recognition')) { newWords.push(w); continue; }
    for (const skill of unlockedSkills(w, ws, opts.romaji)) {
      const s = ws.get(skill);
      if (!s) reviews.push({ wordId: w.id, skill, kind: 'review', reason: 'New skill unlocked', late: 0, box: -1, lapses: 0 });
      else if (isDue(s, now)) reviews.push({ wordId: w.id, skill, kind: 'review', reason: reasonFor(s, now), late: overdueDays(s, now), box: s.box, lapses: s.lapses });
    }
  }
  reviews.sort((a, b) => b.late - a.late || a.box - b.box || b.lapses - a.lapses);
  const limit = opts.reviewLimit ?? DEFAULT_REVIEW_LIMIT;
  const room = Math.max(0, (opts.newLimit ?? DEFAULT_NEW_LIMIT) - (opts.introducedToday ?? 0));
  newWords.sort((a, b) => a.createdAt - b.createdAt);
  return {
    reviews: reviews.slice(0, limit).map(({ wordId, skill, kind, reason }) => ({ wordId, skill, kind, reason })),
    news: newWords.slice(0, room).map((w) => ({ wordId: w.id, skill: 'recognition' as Skill, kind: 'new' as const, reason: 'New word' })),
    overdue: reviews.filter((r) => r.late > 0).length,
    deferred: Math.max(0, reviews.length - limit),
  };
}

/** Weak words: repeated lapses at a low box, or a poor recent record with enough evidence. */
export function planWeak(states: SkillState[], attempts: Attempt[], recent = 5): PlanItem[] {
  const last = new Map<string, Attempt[]>();
  for (const a of [...attempts].sort((x, y) => y.ts - x.ts)) {
    const k = key(a.wordId, a.skill);
    const list = last.get(k) ?? [];
    if (list.length < recent) list.push(a);
    last.set(k, list);
  }
  const out: { item: PlanItem; score: number }[] = [];
  for (const s of states) {
    const r = last.get(key(s.wordId, s.skill)) ?? [];
    const poor = r.length >= 3 && r.filter((a) => a.correct && a.firstTry).length / r.length < 0.6;
    if ((s.lapses >= 2 && s.box < 3) || poor) {
      out.push({ item: { wordId: s.wordId, skill: s.skill, kind: 'review', reason: poor ? 'Wrong more than a third of recent tries' : `Keeps slipping (${s.lapses} misses)` }, score: s.lapses });
    }
  }
  return out.sort((a, b) => b.score - a.score).map((o) => o.item);
}

/** Mistakes since a time: skills whose latest attempt in that window was not a clean first-try answer. */
export function planMistakes(attempts: Attempt[], since: number): PlanItem[] {
  const latest = new Map<string, Attempt>();
  for (const a of attempts.filter((x) => x.ts >= since).sort((x, y) => x.ts - y.ts)) latest.set(key(a.wordId, a.skill), a);
  return [...latest.values()].filter((a) => !(a.correct && a.firstTry))
    .map((a) => ({ wordId: a.wordId, skill: a.skill, kind: 'review' as const, reason: 'You missed it in an earlier session' }));
}
