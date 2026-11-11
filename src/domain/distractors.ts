export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!]; }
  return a;
}

const SMALL: Record<string, string> = { つ: 'っ', っ: 'つ', や: 'ゃ', ゃ: 'や', ゆ: 'ゅ', ゅ: 'ゆ', よ: 'ょ', ょ: 'よ' };
const SWAPS: Record<string, string[]> = { さ: ['ち'], ち: ['さ'], め: ['ぬ'], ぬ: ['め', 'ね'], は: ['ほ'], ほ: ['は'], る: ['ろ'], ろ: ['る'], シ: ['ツ'], ツ: ['シ'], ソ: ['ン'], ン: ['ソ'] };

/** Near-miss spellings of a kana string: one voicing mark, one small kana or one look-alike changed. */
export function nearMisses(form: string): string[] {
  const chars = Array.from(form);
  const out = new Set<string>();
  chars.forEach((c, i) => {
    const swap = (r: string) => { const x = [...chars]; x[i] = r; out.add(x.join('')); };
    const base = c.normalize('NFD').replace(/[\u3099\u309a]/g, '').normalize('NFC');
    for (const mark of ['', '\u3099', '\u309a']) {
      const v = (base + mark).normalize('NFC');
      if (Array.from(v).length === 1 && v !== c && v !== 'ゔ' && v !== 'ヴ') swap(v);
    }
    if (SMALL[c]) swap(SMALL[c]!);
    for (const r of SWAPS[c] ?? []) swap(r);
  });
  out.delete(form);
  return [...out];
}

/** Picks n wrong options: near-misses first (these make the question measure real distinctions), then other words. */
export function pickDistractors(expected: string, pool: string[], n: number, rng: Rng): string[] {
  const chosen: string[] = [];
  const add = (c: string) => { if (c !== expected && !chosen.includes(c) && chosen.length < n) chosen.push(c); };
  shuffle(nearMisses(expected), rng).forEach(add);
  const len = Array.from(expected).length;
  const similar = pool.filter((p) => Math.abs(Array.from(p).length - len) <= 1);
  shuffle(similar, rng).forEach(add);
  shuffle(pool, rng).forEach(add);
  return chosen;
}
