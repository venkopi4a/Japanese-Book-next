/**
 * Judging a finger-traced stroke against the model stroke. This only checks the *shape* of one stroke
 * (where it starts, which way it goes, roughly where it travels). It is practice, not handwriting recognition,
 * and nothing about it is stored or counted against the learner.
 * Coordinates are in the 109 x 109 box that the stroke data uses.
 */
export type Pt = [number, number];

export const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const pathLength = (p: Pt[]) => p.reduce((s, q, i) => (i ? s + dist(p[i - 1]!, q) : 0), 0);

/** n points spaced evenly along the polyline. */
export function resample(pts: Pt[], n: number): Pt[] {
  if (pts.length === 0) return [];
  if (pts.length === 1) return Array.from({ length: n }, () => pts[0]!);
  const total = pathLength(pts);
  if (total === 0) return Array.from({ length: n }, () => pts[0]!);
  const out: Pt[] = [pts[0]!];
  let acc = 0, i = 1, prev = pts[0]!;
  const step = total / (n - 1);
  let next = step;
  while (out.length < n - 1 && i < pts.length) {
    const seg = dist(prev, pts[i]!);
    if (acc + seg >= next) {
      const t = (next - acc) / seg;
      const q: Pt = [prev[0] + (pts[i]![0] - prev[0]) * t, prev[1] + (pts[i]![1] - prev[1]) * t];
      out.push(q); prev = q; acc = next; next += step;
    } else { acc += seg; prev = pts[i]!; i++; }
  }
  while (out.length < n) out.push(pts[pts.length - 1]!);
  return out;
}

export type Why = 'short' | 'start' | 'direction' | 'end' | 'shape';
export interface Verdict { ok: boolean; why?: Why }

const START_TOL = 17, END_TOL = 20, MEAN_TOL = 11, MAX_TOL = 25;

export function judgeStroke(user: Pt[], expected: Pt[]): Verdict {
  if (user.length === 0 || expected.length === 0) return { ok: false, why: 'short' };
  const expLen = pathLength(expected), userLen = pathLength(user);
  const first = user[0]!, last = user[user.length - 1]!;
  const dotLike = expLen < 14; // small marks such as the ゛ dots
  if (userLen < Math.min(3, expLen * 0.5)) return { ok: false, why: 'short' };
  if (dist(first, expected[0]!) > START_TOL) {
    return { ok: false, why: dist(first, expected[expected.length - 1]!) <= START_TOL && dist(last, expected[0]!) <= END_TOL ? 'direction' : 'start' };
  }
  if (dist(last, expected[expected.length - 1]!) > END_TOL) return { ok: false, why: 'end' };
  if (dotLike) return { ok: true };
  if (userLen < expLen * 0.55 || userLen > expLen * 1.7) return { ok: false, why: 'shape' };
  const a = resample(user, 24), b = resample(expected, 24);
  let sum = 0, max = 0;
  for (let i = 0; i < 24; i++) { const d = dist(a[i]!, b[i]!); sum += d; if (d > max) max = d; }
  return sum / 24 <= MEAN_TOL && max <= MAX_TOL ? { ok: true } : { ok: false, why: 'shape' };
}

export const WHY_TEXT: Record<Why, string> = {
  short: 'Draw the whole stroke with one move of your finger.',
  start: 'Start at the number.',
  direction: 'This stroke goes the other way. Start at the number.',
  end: 'Keep going to the end of the stroke.',
  shape: 'Follow the shape of the guide a little closer.',
};
