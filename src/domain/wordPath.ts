import { isKanaId } from './kanaCourse';
import { startOfDay } from './scheduler';
import type { Attempt, SkillState, Word } from './types';

/**
 * The word course: every word belongs to a unit (its topic) and each unit is split into short lessons of 3-5 words.
 * Units run in a beginner order (greetings and people first, grammar last); topics added later follow alphabetically.
 * Lessons are worked out from the current words every time, so new words simply join their topic's lessons.
 */
export const UNIT_ORDER = ['Greetings', 'People', 'Numbers', 'Time', 'Colors', 'Food', 'Clothing', 'Places', 'Travel', 'Adjectives', 'Verbs', 'Hobbies', 'Music', 'Reading', 'Frequency', 'Technology', 'Grammar'];
export const MAX_LESSON = 5;
export const MY_WORDS = 'My words';

export interface WordLesson { id: string; unit: string; n: number; of: number; words: Word[] }
export interface WordUnit { name: string; lessons: WordLesson[] }

/** Splits n words into the fewest lessons of at most 5, as evenly as possible (11 → 4, 4, 3). */
export function lessonSizes(n: number, max = MAX_LESSON): number[] {
  if (n <= 0) return [];
  const count = Math.ceil(n / max);
  return Array.from({ length: count }, (_, i) => Math.floor(n / count) + (i < n % count ? 1 : 0));
}

export function wordUnits(words: Word[]): WordUnit[] {
  const byTopic = new Map<string, Word[]>();
  for (const w of words) {
    if (w.deletedAt) continue;
    const t = w.topic?.trim() || MY_WORDS;
    (byTopic.get(t) ?? byTopic.set(t, []).get(t)!).push(w);
  }
  const rank = (t: string) => { const i = UNIT_ORDER.indexOf(t); return i < 0 ? UNIT_ORDER.length + (t === MY_WORDS ? 1 : 0) : i; };
  return [...byTopic.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)).map((name) => {
    const list = byTopic.get(name)!.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    const sizes = lessonSizes(list.length);
    let at = 0;
    const lessons = sizes.map((size, i) => { const ws = list.slice(at, at + size); at += size; return { id: `${name}#${i + 1}`, unit: name, n: i + 1, of: sizes.length, words: ws }; });
    return { name, lessons };
  });
}

/**
 * How well each word is known, from the answers (the same rule as kana):
 * new · learning (answered, never right) · learned (right at least once; a later miss never undoes it)
 * · mastered (last 3 first-try answers right, on at least 2 different days).
 */
export type WordLevel = 'new' | 'learning' | 'learned' | 'mastered';
export interface WordSummary { levels: Map<string, WordLevel>; learned: number; mastered: number; total: number }

export function wordSummary(words: Word[], states: SkillState[], attempts: Attempt[]): WordSummary {
  const byWord = new Map<string, Attempt[]>();
  for (const a of attempts) if (!isKanaId(a.wordId)) (byWord.get(a.wordId) ?? byWord.set(a.wordId, []).get(a.wordId)!).push(a);
  const rec = new Map(states.filter((s) => s.skill === 'recognition' && !isKanaId(s.wordId)).map((s) => [s.wordId, s]));
  const levels = new Map<string, WordLevel>();
  let learned = 0, mastered = 0, total = 0;
  for (const w of words) {
    if (w.deletedAt) continue;
    total++;
    const list = (byWord.get(w.id) ?? []).sort((x, y) => x.ts - y.ts);
    const s = rec.get(w.id);
    const everRight = list.some((a) => a.correct) || (s?.correct ?? 0) > 0 || (s?.box ?? 0) >= 1;
    const firsts = list.filter((a) => a.firstTry).slice(-3);
    const consistent = firsts.length === 3 && firsts.every((a) => a.correct) && new Set(firsts.map((a) => startOfDay(a.ts))).size >= 2;
    const level: WordLevel = consistent ? 'mastered' : everRight ? 'learned' : list.length ? 'learning' : 'new';
    levels.set(w.id, level);
    if (level === 'learned' || level === 'mastered') learned++;
    if (level === 'mastered') mastered++;
  }
  return { levels, learned, mastered, total };
}

export type WordLessonStatus = 'done' | 'current' | 'open';
export interface LessonInfo { lesson: WordLesson; status: WordLessonStatus; done: number; strength: number }

/**
 * Status of every lesson. Done = every word in it answered at least once. Nothing is locked: the first unfinished
 * lesson is "current" (the suggested next one), the others are "open" and can be started any time.
 * Strength: 3 blossoms when every word is mastered, 2 when at least half are, 1 otherwise.
 */
export function wordLessonInfo(units: WordUnit[], levels: Map<string, WordLevel>): LessonInfo[] {
  let current = false;
  return units.flatMap((u) => u.lessons).map((lesson) => {
    const done = lesson.words.filter((w) => (levels.get(w.id) ?? 'new') !== 'new').length;
    const complete = done === lesson.words.length;
    const m = lesson.words.filter((w) => levels.get(w.id) === 'mastered').length;
    const strength = !complete ? 0 : m === lesson.words.length ? 3 : m * 2 >= lesson.words.length ? 2 : 1;
    let status: WordLessonStatus = complete ? 'done' : 'open';
    if (!complete && !current) { status = 'current'; current = true; }
    return { lesson, status, done, strength };
  });
}

export type WordStep =
  | { kind: 'learn'; word: Word }
  | { kind: 'quiz'; word: Word; reason: string }
  | { kind: 'match'; words: Word[] };

/**
 * One lesson: each new word is taught and checked straight away (learn → check …), then a matching game.
 * Words already answered in an interrupted lesson are skipped, so nothing is repeated. A finished lesson becomes a
 * short practice round of all its words (it only moves the schedule for words that are due).
 */
export function wordLessonSteps(lesson: WordLesson, levels: Map<string, WordLevel>): WordStep[] {
  const todo = lesson.words.filter((w) => (levels.get(w.id) ?? 'new') === 'new');
  const steps: WordStep[] = [];
  for (const w of todo) { steps.push({ kind: 'learn', word: w }); steps.push({ kind: 'quiz', word: w, reason: 'Just learned' }); }
  if (!todo.length) for (const w of lesson.words) steps.push({ kind: 'quiz', word: w, reason: 'Practice' });
  if (lesson.words.length >= 3) steps.push({ kind: 'match', words: lesson.words });
  return steps;
}
