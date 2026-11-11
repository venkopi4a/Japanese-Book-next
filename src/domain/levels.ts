/** Levels grow with everything learned (words and kana), named after a cherry tree growing. */
export const LEVELS: [number, string][] = [
  [0, 'Seed'], [10, 'Sprout'], [30, 'Seedling'], [60, 'Bud'], [100, 'First blossom'], [150, 'Blossom'],
  [220, 'Full bloom'], [300, 'Sakura tree'], [400, 'Sakura grove'], [550, 'Mount Fuji'],
];

export interface Level { n: number; name: string; from: number; to: number | null; nextName: string | null }

export function levelFor(learned: number): Level {
  let i = 0;
  while (i + 1 < LEVELS.length && learned >= LEVELS[i + 1]![0]) i++;
  const next = LEVELS[i + 1];
  return { n: i + 1, name: LEVELS[i]![1], from: LEVELS[i]![0], to: next ? next[0] : null, nextName: next ? next[1] : null };
}

export interface Milestone { id: string; label: string; done: boolean; progress: string }

export function milestones(m: { words: number; hiragana: number; hiraganaTotal: number; katakana: number; katakanaTotal: number; bestStreak: number; anyStudy: boolean }): Milestone[] {
  const count = (n: number, goal: number) => `${Math.min(n, goal)}/${goal}`;
  return [
    { id: 'first', label: 'First lesson', done: m.anyStudy, progress: m.anyStudy ? 'done' : 'not yet' },
    { id: 'hira', label: 'Hiragana', done: m.hiragana >= m.hiraganaTotal, progress: count(m.hiragana, m.hiraganaTotal) },
    { id: 'streak7', label: '7-day streak', done: m.bestStreak >= 7, progress: count(m.bestStreak, 7) },
    { id: 'w25', label: '25 words', done: m.words >= 25, progress: count(m.words, 25) },
    { id: 'kata', label: 'Katakana', done: m.katakana >= m.katakanaTotal, progress: count(m.katakana, m.katakanaTotal) },
    { id: 'w100', label: '100 words', done: m.words >= 100, progress: count(m.words, 100) },
    { id: 'streak30', label: '30-day streak', done: m.bestStreak >= 30, progress: count(m.bestStreak, 30) },
  ];
}
