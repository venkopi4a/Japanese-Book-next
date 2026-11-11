import type { Word } from '../domain/types';

/** Topics (or units) with how many words each has, in alphabetical order. */
export function countBy(words: Word[], pick: (w: Word) => string | null): [string, number][] {
  const m = new Map<string, number>();
  for (const w of words) { if (w.deletedAt) continue; const k = pick(w); if (k) m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}
export const topicCounts = (words: Word[]) => countBy(words, (w) => w.topic);
export const unitCounts = (words: Word[]) => countBy(words, (w) => w.unit);

/** An empty selection means everything. */
export function inSelection(w: Word, topics: string[], units: string[]): boolean {
  return (topics.length === 0 || (w.topic !== null && topics.includes(w.topic))) && (units.length === 0 || (w.unit !== null && units.includes(w.unit)));
}
