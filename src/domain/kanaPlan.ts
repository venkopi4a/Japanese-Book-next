import { nearMisses, shuffle, type Rng } from './distractors';
import { KANA, KANA_ROWS, isKanaId, kanaOf, type KanaChar, type KanaRow, type Script } from './kanaCourse';
import { isDue, reasonFor, startOfDay } from './scheduler';
import type { Skill, SkillState } from './types';

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

export type LessonStatus = 'done' | 'current' | 'locked';
/** Each lesson's status and strength (0-3 blossoms, from how well its kana are known). */
export function lessonStatuses(states: SkillState[]): { row: KanaRow; status: LessonStatus; strength: number; done: number }[] {
  const rec = recState(states);
  let currentFound = false;
  return KANA_ROWS.map((row) => {
    const done = row.chars.filter((c) => answered(rec.get(c.id))).length;
    const complete = done === row.chars.length;
    const avg = row.chars.reduce((sum, c) => sum + (rec.get(c.id)?.box ?? 0), 0) / row.chars.length;
    const strength = !complete ? 0 : avg >= 4 ? 3 : avg >= 2 ? 2 : 1;
    let status: LessonStatus = 'locked';
    if (complete) status = 'done';
    else if (!currentFound) { status = 'current'; currentFound = true; }
    return { row, status, strength, done };
  });
}

/** A kana counts as learned once it is answered right after its lesson (recognition box 1 or higher). */
export const learnedKana = (states: SkillState[], script?: Script) => {
  const rec = recState(states);
  return (script ? kanaOf(script) : KANA).filter((k) => (rec.get(k.id)?.box ?? 0) >= 1).length;
};
export const scriptDone = (states: SkillState[], script: Script) => learnedKana(states, script) === kanaOf(script).length;

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
    if (!isKanaId(s.wordId) || !KANA_SKILLS.includes(s.skill) || !isDue(s, now) || s.lastAt === null) continue;
    reviews.push({ kanaId: s.wordId, skill: s.skill, reason: reasonFor(s, now), promote: true });
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
 * then the row is heard once each, then a quick matching game. Kana already answered in an interrupted lesson are
 * skipped, so leaving halfway never repeats work. A finished row becomes a practice round.
 */
export function lessonSteps(row: KanaRow, states: SkillState[], opts: { canHear: boolean; now: number; rng: Rng }): LessonStep[] {
  const rec = recState(states);
  const heard = new Set(states.filter((s) => s.skill === 'listening' && isKanaId(s.wordId)).map((s) => s.wordId));
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
  if (opts.canHear) {
    for (const k of shuffle(row.chars.filter((c) => !heard.has(c.id)), opts.rng)) steps.push({ kind: 'quiz', kana: k, skill: 'listening', lesson: true, promote: true, reason: 'Listen' });
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
