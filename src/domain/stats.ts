import { DAY, startOfDay } from './scheduler';
import type { Attempt, Skill } from './types';

export interface ConfusionPair { expected: string; got: string; count: number; words: number; lastAt: number }

const MEANINGFUL = new Set(['dakuten', 'handakuten', 'small-kana', 'confusable', 'substitution']);

/**
 * Character pairs you mix up. A pair is only reported when the recorded answers give real evidence:
 * at least minCount occurrences, across at least minWords different words.
 */
export function confusionPairs(attempts: Attempt[], opts: { minCount?: number; minWords?: number; since?: number } = {}): ConfusionPair[] {
  const { minCount = 3, minWords = 2, since = 0 } = opts;
  const map = new Map<string, { expected: string; got: string; count: number; words: Set<string>; lastAt: number }>();
  for (const a of attempts) {
    if (a.ts < since) continue;
    for (const m of a.mistakes) {
      if (!MEANINGFUL.has(m.kind) || !m.expected || !m.got) continue;
      const k = `${m.expected}→${m.got}`;
      const e = map.get(k) ?? { expected: m.expected, got: m.got, count: 0, words: new Set<string>(), lastAt: 0 };
      e.count++; e.words.add(a.wordId); e.lastAt = Math.max(e.lastAt, a.ts);
      map.set(k, e);
    }
  }
  return [...map.values()].filter((e) => e.count >= minCount && e.words.size >= minWords)
    .map((e) => ({ expected: e.expected, got: e.got, count: e.count, words: e.words.size, lastAt: e.lastAt }))
    .sort((a, b) => b.count - a.count);
}

/** Share of first-try answers that were correct on reviews of well-learned items (box 3 or higher). Null until there is enough data. */
export function retention(attempts: Attempt[], minSample = 10): number | null {
  const r = attempts.filter((a) => a.firstTry && a.boxBefore !== null && a.boxBefore >= 3);
  return r.length < minSample ? null : r.filter((a) => a.correct).length / r.length;
}

export function skillAccuracy(attempts: Attempt[], now: number, days = 14, minSample = 5): Partial<Record<Skill, number>> {
  const since = now - days * DAY;
  const out: Partial<Record<Skill, number>> = {};
  const groups = new Map<Skill, Attempt[]>();
  for (const a of attempts) if (a.ts >= since && a.firstTry) groups.set(a.skill, [...(groups.get(a.skill) ?? []), a]);
  for (const [skill, list] of groups) if (list.length >= minSample) out[skill] = list.filter((a) => a.correct).length / list.length;
  return out;
}

/**
 * Consecutive days with at least one answer or lesson, counted back from today (or from yesterday if today has none yet).
 * extra: other study moments, such as the times new words were taught.
 */
export function streak(attempts: Attempt[], now: number, extra: number[] = []): number {
  const days = new Set([...attempts.map((a) => a.ts), ...extra].map(startOfDay));
  let day = startOfDay(now);
  if (!days.has(day)) day = startOfDay(day - 1);
  let n = 0;
  while (days.has(day)) { n++; day = startOfDay(day - 1); }
  return n;
}

/** The longest run of consecutive study days ever. */
export function bestStreak(attempts: Attempt[], extra: number[] = []): number {
  const days = [...new Set([...attempts.map((a) => a.ts), ...extra].map(startOfDay))].sort((a, b) => a - b);
  let best = 0, run = 0, prev = NaN;
  for (const d of days) {
    run = startOfDay(prev + DAY + 3_600_000) === d ? run + 1 : 1; // +1h keeps daylight-saving days in line
    best = Math.max(best, run); prev = d;
  }
  return best;
}
