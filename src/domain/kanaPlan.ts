import { nearMisses, shuffle, type Rng } from './distractors';
import { KANA, KANA_ROWS, isKanaId, kanaOf, type KanaChar, type KanaRow, type Script } from './kanaCourse';
import { isDue, reasonFor, startOfDay } from './scheduler';
import type { Attempt, Skill, SkillState } from './types';

/** Kana use two skills: see it and pick the sound (recognition), hear it and pick the kana (listening). */
export const KANA_SKILLS: Skill[] = ['recognition', 'listening'];
export const DEFAULT_KANA_LIMIT = 15;
/** When this many answered kana are back at box 0, reviewing first is recommended. */
export const STRUGGLE_LIMIT = 5;

export interface KanaItem { kanaId: string; skill: Skill; reason: string; promote: boolean }

/** One lesson is one row of the chart (at most 5 kana): short enough to finish in a few minutes. */
export interface KanaLesson { row: KanaRow; index: number; total: number; done: number; started: boolean }
export interface KanaPlan {
  reviews: KanaItem[];
  /** The next lesson to do (an unfinished one is always continued first), or null when the course is complete. */
  lesson: KanaLesson | null;
  lessonsToday: number;
  goal: number;
  goalReached: boolean;
  /** Several kana were missed recently: reviewing first is recommended. */
  held: boolean;
}

export const LESSON_SIZE = 5;
export const REVIEW_SESSION = 10;

const recState = (states: SkillState[]) => {
  const m = new Map<string, SkillState>();
  for (const s of states) if (s.skill === 'recognition' && isKanaId(s.wordId)) m.set(s.wordId, s);
  return m;
};
/** A kana is answered once its sight question has been answered at least once (a lesson card alone does not count). */
const answered = (s: SkillState | undefined) => !!s && s.lastAt !== null;

/**
 * How well each kana is known, from the answers given (never from a single box number, so one miss cannot undo it):
 * - new: never answered
 * - learning: answered, but never right yet
 * - learned: answered right at least once (a later miss does not take this away)
 * - mastered: the last 3 first-try answers were all right, on at least 2 different days ("consistent")
 */
export type KanaLevel = 'new' | 'learning' | 'learned' | 'mastered';
export const MASTERY_STREAK = 3;

export interface KanaSummary {
  levels: Map<string, KanaLevel>;
  learned: Record<Script, number>;   // learned or mastered
  mastered: Record<Script, number>;
  total: Record<Script, number>;
}

export function kanaSummary(states: SkillState[], attempts: Attempt[]): KanaSummary {
  const byKana = new Map<string, Attempt[]>();
  for (const a of attempts) if (isKanaId(a.wordId)) (byKana.get(a.wordId) ?? byKana.set(a.wordId, []).get(a.wordId)!).push(a);
  const rec = recState(states);
  const levels = new Map<string, KanaLevel>();
  const learned = { hiragana: 0, katakana: 0 }, mastered = { hiragana: 0, katakana: 0 }, total = { hiragana: 0, katakana: 0 };
  for (const k of KANA) {
    total[k.script]++;
    const list = (byKana.get(k.id) ?? []).sort((x, y) => x.ts - y.ts);
    const s = rec.get(k.id);
    // older versions: a state that reached box 1 was answered right even if its answers are not all here
    const everRight = list.some((a) => a.correct) || (s?.correct ?? 0) > 0 || (s?.box ?? 0) >= 1;
    const firsts = list.filter((a) => a.firstTry).slice(-MASTERY_STREAK);
    const consistent = firsts.length === MASTERY_STREAK && firsts.every((a) => a.correct) && new Set(firsts.map((a) => startOfDay(a.ts))).size >= 2;
    const level: KanaLevel = consistent ? 'mastered' : everRight ? 'learned' : list.length || answered(s) ? 'learning' : 'new';
    levels.set(k.id, level);
    if (level === 'learned' || level === 'mastered') learned[k.script]++;
    if (level === 'mastered') mastered[k.script]++;
  }
  return { levels, learned, mastered, total };
}

export type LessonStatus = 'done' | 'current' | 'locked';
/**
 * Each lesson's status and strength (0-3 blossoms). Done = every kana in it answered. Strength: 3 when all its kana
 * are mastered, 2 when at least half are, 1 otherwise. The first unfinished lesson is the current one.
 */
export function lessonStatuses(states: SkillState[], levels?: Map<string, KanaLevel>): { row: KanaRow; status: LessonStatus; strength: number; done: number }[] {
  const rec = recState(states);
  let currentFound = false;
  return KANA_ROWS.map((row) => {
    const done = row.chars.filter((c) => answered(rec.get(c.id))).length;
    const complete = done === row.chars.length;
    const m = levels ? row.chars.filter((c) => levels.get(c.id) === 'mastered').length : 0;
    const strength = !complete ? 0 : m === row.chars.length ? 3 : m * 2 >= row.chars.length ? 2 : 1;
    let status: LessonStatus = 'locked';
    if (complete) status = 'done';
    else if (!currentFound) { status = 'current'; currentFound = true; }
    return { row, status, strength, done };
  });
}

/** Kana introduced today, for the daily goal. */
export const kanaIntroducedToday = (states: SkillState[], now: number) =>
  states.filter((s) => s.skill === 'recognition' && isKanaId(s.wordId) && s.introducedAt >= startOfDay(now)).length;

/**
 * Today's kana: due reviews (never kana that were only shown on a lesson card and not yet answered),
 * and the next lesson. The daily goal is a recommendation (kanaLimit / 5 lessons): it is never a lock.
 */
export function planKana(states: SkillState[], opts: { now: number; newLimit?: number }): KanaPlan {
  const { now } = opts;
  const rec = recState(states);
  const reviews: KanaItem[] = [];
  for (const s of states) {
    if (!isKanaId(s.wordId) || !KANA_SKILLS.includes(s.skill) || !isDue(s, now)) continue;
    // never review a kana that was only shown on a card; its listening skill starts once its sight question was answered
    if (s.lastAt === null && (s.skill === 'recognition' || !answered(rec.get(s.wordId)))) continue;
    reviews.push({ kanaId: s.wordId, skill: s.skill, reason: s.lastAt === null ? 'First time by ear' : reasonFor(s, now), promote: true });
  }
  const order = new Map(KANA.map((k, i) => [k.id, i]));
  reviews.sort((a, b) => order.get(a.kanaId)! - order.get(b.kanaId)! || a.skill.localeCompare(b.skill));
  const held = [...rec.values()].filter((s) => answered(s) && s.box === 0).length >= STRUGGLE_LIMIT;
  const statuses = lessonStatuses(states);
  const idx = statuses.findIndex((x) => x.status === 'current');
  const day = startOfDay(now);
  const lessonsToday = statuses.filter((x) => x.status === 'done' && x.row.chars.some((c) => (rec.get(c.id)?.introducedAt ?? 0) >= day)).length;
  const goal = Math.max(1, Math.round((opts.newLimit ?? DEFAULT_KANA_LIMIT) / LESSON_SIZE));
  const lesson = idx < 0 ? null : { row: statuses[idx]!.row, index: idx, total: KANA_ROWS.length, done: statuses[idx]!.done, started: statuses[idx]!.row.chars.some((c) => rec.has(c.id)) };
  return { reviews, lesson, lessonsToday, goal, goalReached: lessonsToday >= goal, held };
}

export interface KanaQuestion { kana: KanaChar; skill: Skill; options: string[]; answer: string }

/**
 * A kana question. Wrong options come from kana already met (the same script), never a character with the same sound,
 * so じ and ぢ never appear together. Look-alikes and same-row kana are preferred because they teach the most.
 */
export function kanaQuestion(kana: KanaChar, skill: Skill, metIds: Set<string>, rng: Rng): KanaQuestion {
  const same = kanaOf(kana.script).filter((k) => k.id !== kana.id && k.romaji !== kana.romaji);
  const met = same.filter((k) => metIds.has(k.id));
  const pool = met.length >= 3 ? met : [...met, ...shuffle(same.filter((k) => !metIds.has(k.id) && k.stage === kana.stage), rng)];
  if (skill === 'listening') {
    // look-alikes (か/が, つ/っ) only when that kana is in the pool, so nothing unseen sneaks in
    const chars = pool.map((k) => k.char);
    const near = shuffle(nearMisses(kana.char).filter((c) => chars.includes(c)), rng);
    const picks: string[] = [];
    for (const c of [...near, ...shuffle(pool.filter((k) => k.row === kana.row), rng).map((k) => k.char), ...shuffle(chars, rng)]) if (!picks.includes(c) && picks.length < 3) picks.push(c);
    return { kana, skill, options: shuffle([kana.char, ...picks], rng), answer: kana.char };
  }
  const row = pool.filter((k) => k.row === kana.row);
  const rest = pool.filter((k) => k.row !== kana.row);
  const picks: string[] = [];
  for (const k of [...shuffle(row, rng), ...shuffle(rest, rng)]) if (!picks.includes(k.romaji) && picks.length < 3) picks.push(k.romaji);
  return { kana, skill, options: shuffle([kana.romaji, ...picks], rng), answer: kana.romaji };
}

export type LessonStep =
  | { kind: 'learn'; kana: KanaChar }
  | { kind: 'quiz'; kana: KanaChar; skill: Skill; lesson: boolean; promote: boolean; reason: string }
  | { kind: 'match'; kanas: KanaChar[] };

/**
 * The steps of one lesson. Each new kana is taught and checked straight away (learn → check, learn → check …),
 * then a quick matching game: 11 steps, about 2 minutes. Listening starts the next day, in reviews. Kana already answered in an interrupted lesson are
 * skipped, so leaving halfway never repeats work. A finished row becomes a practice round.
 */
export function lessonSteps(row: KanaRow, states: SkillState[], opts: { canHear: boolean; now: number; rng: Rng }): LessonStep[] {
  const rec = recState(states);
  const todo = row.chars.filter((c) => !answered(rec.get(c.id)));
  const steps: LessonStep[] = [];
  for (const k of todo) {
    steps.push({ kind: 'learn', kana: k });
    steps.push({ kind: 'quiz', kana: k, skill: 'recognition', lesson: true, promote: true, reason: 'Just learned' });
  }
  // an unfinished lesson also retries the kana of this row that were missed before it was left
  if (todo.length) {
    for (const k of row.chars) {
      const s = rec.get(k.id);
      if (answered(s) && s!.lastCorrect === false) steps.push({ kind: 'quiz', kana: k, skill: 'recognition', lesson: false, promote: true, reason: 'Missed earlier' });
    }
  }
  if (!steps.length) { // a finished lesson: practise it (it only moves the schedule for kana that are due)
    const byId = (id: string, skill: Skill) => states.find((s) => s.wordId === id && s.skill === skill);
    for (const k of shuffle(row.chars, opts.rng)) {
      for (const skill of (opts.canHear ? KANA_SKILLS : ['recognition']) as Skill[]) {
        const s = byId(k.id, skill);
        const due = !!s && isDue(s, opts.now);
        steps.push({ kind: 'quiz', kana: k, skill, lesson: false, promote: due, reason: due ? 'Due today' : 'Practice' });
      }
    }
  }
  if (row.chars.length >= 3) steps.push({ kind: 'match', kanas: row.chars });
  return steps;
}
