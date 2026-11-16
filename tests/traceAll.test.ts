import { describe, expect, it } from 'vitest';
import strokes from '../src/data/strokes.json';
import { KANA } from '../src/domain/kanaCourse';
import { dist, judgeStroke, pathLength, type Pt } from '../src/domain/trace';

const data = strokes as unknown as Record<string, { p: string[]; n: number[][] }>;

/** Flattens the SVG path commands KanjiVG uses (M m L l H h V v C c S s Z) into points. */
function flatten(d: string, steps = 12): Pt[] {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const pts: Pt[] = [];
  let i = 0, cx = 0, cy = 0, sx = 0, sy = 0, lastC: Pt | null = null, cmd = '';
  const num = () => parseFloat(tokens[i++]!);
  const cubic = (p0: Pt, p1: Pt, p2: Pt, p3: Pt) => {
    for (let k = 1; k <= steps; k++) {
      const t = k / steps, u = 1 - t;
      pts.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]);
    }
  };
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i]!)) cmd = tokens[i++]!;
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? cx : 0, oy = rel ? cy : 0;
    switch (cmd.toUpperCase()) {
      case 'M': { cx = ox + num(); cy = oy + num(); sx = cx; sy = cy; pts.push([cx, cy]); cmd = rel ? 'l' : 'L'; lastC = null; break; }
      case 'L': { cx = ox + num(); cy = oy + num(); pts.push([cx, cy]); lastC = null; break; }
      case 'H': { cx = ox + num(); pts.push([cx, cy]); lastC = null; break; }
      case 'V': { cy = oy + num(); pts.push([cx, cy]); lastC = null; break; }
      case 'C': { const p1: Pt = [ox + num(), oy + num()], p2: Pt = [ox + num(), oy + num()], p3: Pt = [ox + num(), oy + num()]; cubic([cx, cy], p1, p2, p3); cx = p3[0]; cy = p3[1]; lastC = p2; break; }
      case 'S': { const p1: Pt = lastC ? [2 * cx - lastC[0], 2 * cy - lastC[1]] : [cx, cy], p2: Pt = [ox + num(), oy + num()], p3: Pt = [ox + num(), oy + num()]; cubic([cx, cy], p1, p2, p3); cx = p3[0]; cy = p3[1]; lastC = p2; break; }
      case 'Z': { cx = sx; cy = sy; break; }
      default: throw new Error('unsupported path command ' + cmd);
    }
  }
  return pts;
}

// small deterministic "wobble" so the test is repeatable
const rnd = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

describe('every kana in the course can be traced', () => {
  const chars = [...new Set(KANA.filter((k) => k.stage !== 'combo').map((k) => k.char))];
  it('accepts a shaky, slightly offset copy of every stroke of every kana', () => {
    const r = rnd(7);
    const bad: string[] = [];
    for (const ch of chars) data[ch]!.p.forEach((d, i) => {
      const model = flatten(d);
      const dx = (r() - 0.5) * 8, dy = (r() - 0.5) * 8; // up to 4 units off (about 7 px on a phone)
      const user = model.filter((_, k) => k % 2 === 0 || k === model.length - 1).map(([x, y]) => [x + dx + (r() - 0.5) * 3, y + dy + (r() - 0.5) * 3] as Pt);
      if (!judgeStroke(user, model).ok) bad.push(`${ch}#${i + 1}`);
    });
    expect(bad).toEqual([]);
  });
  it('refuses a long stroke drawn backwards', () => {
    const bad: string[] = [];
    for (const ch of chars) data[ch]!.p.forEach((d, i) => {
      const model = flatten(d);
      if (pathLength(model) > 30 && dist(model[0]!, model[model.length - 1]!) > 30 && judgeStroke([...model].reverse(), model).ok) bad.push(`${ch}#${i + 1}`);
    });
    expect(bad).toEqual([]);
  });
  it('refuses a stroke when a different stroke of the same kana is drawn in its place (when they start far apart)', () => {
    const accepted: string[] = [];
    for (const ch of chars) {
      const paths = data[ch]!.p.map((d) => flatten(d));
      for (let i = 0; i < paths.length; i++) for (let j = 0; j < paths.length; j++) {
        if (i === j || dist(paths[i]![0]!, paths[j]![0]!) < 28) continue;
        if (judgeStroke(paths[i]!, paths[j]!).ok) accepted.push(`${ch}: ${i + 1} for ${j + 1}`);
      }
    }
    expect(accepted).toEqual([]);
  });
});
