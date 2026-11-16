import { useEffect, useRef, useState } from 'preact/hooks';

type Stroke = { p: string[]; n: [number, number][] };
let cache: Promise<Record<string, Stroke>> | null = null;
/** Loaded on first use so the stroke data (about 57 KB) is not part of the first page load. */
export const loadStrokes = () => (cache ??= import('../data/strokes.json').then((m) => ((m as { default?: unknown }).default ?? m) as unknown as Record<string, Stroke>));

const PER_STROKE = 900; // ms to draw one stroke
const GAP = 250;

/** A kana drawn stroke by stroke. Tap "Show again" to replay; "Step" draws one stroke at a time. */
export function StrokeOrder({ char, size = 160, auto = true }: { char: string; size?: number; auto?: boolean }) {
  const [data, setData] = useState<Stroke | null>(null);
  const [shown, setShown] = useState(0);              // how many strokes are fully drawn
  const [playing, setPlaying] = useState(false);
  const timer = useRef(0);
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    let live = true; setData(null); setShown(0); setPlaying(false);
    loadStrokes().then((all) => { if (live) setData(all[char] ?? null); }).catch(() => { if (live) setData(null); });
    return () => { live = false; window.clearTimeout(timer.current); };
  }, [char]);

  const total = data?.p.length ?? 0;
  const [run, setRun] = useState(0);                 // changes on every replay so the drawing animation restarts
  const play = () => {
    window.clearTimeout(timer.current);
    if (!total) return;
    setRun((r) => r + 1);
    if (reduce) { setShown(total); setPlaying(false); return; }
    setShown(1); setPlaying(true);
    let i = 1;
    const tick = () => {
      if (i < total) { i++; setShown(i); timer.current = window.setTimeout(tick, PER_STROKE + GAP); }
      else timer.current = window.setTimeout(() => setPlaying(false), PER_STROKE);
    };
    timer.current = window.setTimeout(tick, PER_STROKE + GAP);
  };
  useEffect(() => { if (data && auto) play(); }, [data]);

  const step = () => {
    window.clearTimeout(timer.current); setPlaying(false); setRun((r) => r + 1);
    setShown((s) => (s >= total ? 1 : s + 1));
  };
  if (!data) return <div class="stroke-box" style={`width:${size}px;height:${size}px`} aria-hidden="true" />;

  return (
    <div class="stroke-wrap">
      <svg class="stroke-box" viewBox="0 0 109 109" width={size} height={size} role="img" aria-label={`Stroke order for ${char}: ${total} ${total === 1 ? 'stroke' : 'strokes'}`}>
        <path class="guide" d="M54.5 6V103M6 54.5H103" />
        {data.p.slice(0, shown).map((d, i) => <path key={`${run}-${i}`} d={d} pathLength={1} class={`stk${i === shown - 1 && !reduce ? ' draw' : ''}`} />)}
        {data.n.slice(0, shown).map((pt, i) => <text key={`n${run}-${i}`} x={pt[0]} y={pt[1]} class="stk-num">{i + 1}</text>)}
      </svg>
      <div class="stroke-bar">
        <span class="m">{total} {total === 1 ? 'stroke' : 'strokes'}{shown > 0 && shown < total ? ` · ${shown} of ${total}` : ''}</span>
        <span style="flex:1" />
        <button class="chip" onClick={step} aria-label="Next stroke">Step</button>
        <button class="chip" onClick={play} aria-label="Play stroke order again">{shown >= total && !playing ? 'Replay' : 'Play'}</button>
      </div>
    </div>
  );
}
