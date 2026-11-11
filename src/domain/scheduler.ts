import type { Skill, SkillState } from './types';

export const DAY = 86_400_000;
export const INTERVAL_DAYS = [0, 1, 2, 4, 8, 16, 32] as const;
export const MAX_BOX = INTERVAL_DAYS.length - 1;

export const startOfDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const endOfDay = (t: number) => { const d = new Date(t); d.setHours(23, 59, 59, 999); return d.getTime(); };

export function newState(wordId: string, skill: Skill, now: number): SkillState {
  return { wordId, skill, box: 0, dueAt: now, correct: 0, lapses: 0, introducedAt: now, lastAt: null, lastCorrect: null };
}

/**
 * The whole scheduling rule:
 * a wrong answer sends the skill back to box 0, due immediately;
 * a right answer moves it up one box, due after that box's interval.
 * Only first-try right answers count towards "correct": getting it right on a retry
 * in the same session moves the box but is not evidence that you knew it.
 */
export function applyAnswer(prev: SkillState, correct: boolean, firstTry: boolean, now: number): SkillState {
  if (!correct) return { ...prev, box: 0, dueAt: now, lapses: prev.lapses + 1, lastAt: now, lastCorrect: false };
  const box = Math.min(prev.box + 1, MAX_BOX);
  return { ...prev, box, dueAt: now + INTERVAL_DAYS[box]! * DAY, correct: prev.correct + (firstTry ? 1 : 0), lastAt: now, lastCorrect: true };
}

/** Due means due by the end of today, so a card due this evening shows up this morning. */
export const isDue = (s: SkillState, now: number) => s.dueAt <= endOfDay(now);

export const overdueDays = (s: SkillState, now: number) =>
  Math.max(0, Math.round((startOfDay(now) - startOfDay(s.dueAt)) / DAY));

/** A plain-language reason this item is showing up. */
export function reasonFor(s: SkillState, now: number): string {
  if (s.lastCorrect === false) return 'You missed it last time';
  const late = overdueDays(s, now);
  if (late > 0) return late === 1 ? 'Overdue by 1 day' : `Overdue by ${late} days`;
  if (s.lapses >= 2 && s.box < 3) return `Keeps slipping (${s.lapses} misses)`;
  return 'Due today';
}

export type Mastery = 'new' | 'learning' | 'known';

/** Known = recognised reliably and every started skill is at least box 3. */
export function masteryOf(states: SkillState[]): Mastery {
  const rec = states.find((s) => s.skill === 'recognition');
  if (!rec) return 'new';
  return rec.box >= 4 && states.every((s) => s.box >= 3) ? 'known' : 'learning';
}
