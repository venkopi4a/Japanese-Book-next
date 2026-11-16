import { describe, expect, it } from 'vitest';
import { judgeStroke, pathLength, resample, type Pt } from '../src/domain/trace';

const line = (a: Pt, b: Pt, n = 20): Pt[] => Array.from({ length: n }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / (n - 1), a[1] + ((b[1] - a[1]) * i) / (n - 1)] as Pt);
const curve = (): Pt[] => Array.from({ length: 30 }, (_, i) => { const t = i / 29; return [20 + 60 * t, 30 + 50 * Math.sin(t * Math.PI)] as Pt; }); // an arch
const shift = (p: Pt[], dx: number, dy: number): Pt[] => p.map(([x, y]) => [x + dx, y + dy] as Pt);

describe('resample', () => {
  it('spaces points evenly and keeps the ends', () => {
    const r = resample(line([0, 0], [100, 0], 5), 11);
    expect(r).toHaveLength(11);
    expect(r[0]).toEqual([0, 0]);
    expect(r[10]![0]).toBeCloseTo(100, 5);
    expect(r[5]![0]).toBeCloseTo(50, 5);
    expect(pathLength(r)).toBeCloseTo(100, 4);
  });
});

describe('judgeStroke', () => {
  const e = curve();
  it('accepts the model stroke itself and a slightly wobbly, offset copy', () => {
    expect(judgeStroke(e, e).ok).toBe(true);
    expect(judgeStroke(shift(e, 5, -4), e).ok).toBe(true);
    expect(judgeStroke(e.filter((_, i) => i % 3 === 0 || i === e.length - 1), e).ok).toBe(true);
  });
  it('rejects a tap', () => { expect(judgeStroke([[50, 50]], e)).toEqual({ ok: false, why: 'short' }); });
  it('says "start" when it begins in the wrong place', () => { expect(judgeStroke(shift(e, 0, 40), e).why).toBe('start'); });
  it('says "direction" when drawn backwards', () => { expect(judgeStroke([...e].reverse(), e)).toEqual({ ok: false, why: 'direction' }); });
  it('says "end" when it stops halfway', () => { expect(judgeStroke(e.slice(0, 14), e).ok).toBe(false); });
  it('says "shape" for a straight line between the same ends', () => { expect(judgeStroke(line(e[0]!, e[e.length - 1]!), e)).toEqual({ ok: false, why: 'shape' }); });
  it('accepts a small mark such as a dot when it starts and ends near the model', () => {
    const dot = line([80, 20], [86, 25], 4);
    expect(judgeStroke(shift(dot, 3, 2), dot).ok).toBe(true);
    expect(judgeStroke(line([10, 90], [16, 95], 4), dot).ok).toBe(false);
  });
});
