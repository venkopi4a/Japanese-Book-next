import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Blossom, Icon } from '../app/icons';
import { judgeStroke, WHY_TEXT, type Pt } from '../domain/trace';
import { loadStrokes } from './StrokeOrder';

type Stroke = { p: string[]; n: [number, number][] };

/** Points along an SVG path, in the path's own 109 x 109 units. Needs a browser. */
function samplePath(d: string, n = 40): Pt[] {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.style.position = 'absolute';
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', d); svg.appendChild(p); document.body.appendChild(svg);
  const len = p.getTotalLength();
  const out: Pt[] = Array.from({ length: n }, (_, i) => { const q = p.getPointAtLength((len * i) / (n - 1)); return [q.x, q.y] as Pt; });
  svg.remove();
  return out;
}

const MISSES_BEFORE_HELP = 2;

/**
 * Practise writing one kana with a finger: draw each stroke in order. Each stroke is checked for where it starts, which way it
 * goes and roughly where it travels. It is practice only: nothing is graded, saved or counted against the learner.
 */
export function TraceKana({ char, onClose }: { char: string; onClose: () => void }) {
  const [data, setData] = useState<Stroke | null>(null);
  const [done, setDone] = useState(0);
  const [guide, setGuide] = useState(true);
  const [live, setLive] = useState<Pt[]>([]);
  const [msg, setMsg] = useState('');
  const [misses, setMisses] = useState(0);
  const [shake, setShake] = useState(0);
  const [round, setRound] = useState(1);
  const svg = useRef<SVGSVGElement>(null);
  const drawing = useRef<Pt[] | null>(null);

  useEffect(() => { let on = true; loadStrokes().then((all) => { if (on) setData(all[char] ?? null); }); return () => { on = false; }; }, [char]);
  const model = useMemo(() => (data ? data.p.map((d) => samplePath(d)) : []), [data]);
  const total = data?.p.length ?? 0;
  const finished = total > 0 && done >= total;

  const toBox = (e: PointerEvent): Pt => {
    const r = svg.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * 109, ((e.clientY - r.top) / r.height) * 109];
  };
  const down = (e: PointerEvent) => {
    if (finished || !data) return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drawing.current = [toBox(e)]; setLive([toBox(e)]); setMsg('');
  };
  const move = (e: PointerEvent) => {
    if (!drawing.current) return;
    drawing.current.push(toBox(e)); setLive([...drawing.current]);
  };
  const up = () => {
    const pts = drawing.current; drawing.current = null; setLive([]);
    if (!pts || !data) return;
    const v = judgeStroke(pts, model[done]!);
    if (v.ok) { setDone(done + 1); setMisses(0); setMsg(done + 1 >= total ? '' : 'Good. Next stroke.'); }
    else { setMisses(misses + 1); setShake((s) => s + 1); setMsg(WHY_TEXT[v.why!]); }
  };
  const again = () => { setDone(0); setMisses(0); setMsg(''); setRound((r) => r + 1); };

  const cur = data && !finished ? data.n[done] : null;
  const help = misses >= MISSES_BEFORE_HELP && !finished; // after two tries, show the stroke itself

  return (
    <div class="sheet-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="sheet trace-sheet" role="dialog" aria-modal="true" aria-label={`Trace ${char}`}>
        <div style="display:flex;align-items:center;gap:10px">
          <div style="flex:1"><div class="j" lang="ja" style="font-size:28px;line-height:1">{char}</div><div class="m">Trace it with your finger. Not graded.</div></div>
          <button class="icon-btn ring" aria-label="Close" onClick={onClose}><Icon name="close" /></button>
        </div>
        {!data ? <div class="m" style="padding:40px 0;text-align:center">Loading…</div> : <>
          <svg ref={svg} class={`trace-box${shake ? ' shake' : ''}`} key={`${round}-${shake}`} viewBox="0 0 109 109" role="img" aria-label={`Drawing area. Stroke ${Math.min(done + 1, total)} of ${total}`}
            onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
            <path class="guide" d="M54.5 6V103M6 54.5H103" />
            {guide && data.p.map((d, i) => (i >= done ? <path key={`g${i}`} d={d} class="tr-guide" pathLength={1} /> : null))}
            {data.p.slice(0, done).map((d, i) => <path key={`d${i}`} d={d} class="stk" pathLength={1} />)}
            {help && <path d={data.p[done]} class="tr-help" />}
            {live.length > 1 && <polyline points={live.map((p) => p.join(',')).join(' ')} class="tr-live" />}
            {cur && <g class="tr-start"><circle cx={cur[0] + 4} cy={cur[1] - 3} r="6" /><text x={cur[0] + 4} y={cur[1] - 0.5}>{done + 1}</text></g>}
          </svg>
          <div class="tr-msg" role="status" aria-live="polite">
            {finished
              ? <span class="tr-done"><Blossom size={22} /> Well done! All {total} {total === 1 ? 'stroke' : 'strokes'}.</span>
              : msg || `Stroke ${done + 1} of ${total}. Start at the number.`}
          </div>
          <div class="tr-actions">
            <button class="chip" aria-pressed={!guide} onClick={() => setGuide(!guide)}>{guide ? 'Hide guide' : 'Show guide'}</button>
            <button class="chip" onClick={again}>Start over</button>
            <span style="flex:1" />
            {finished && <button class="btn primary" onClick={() => { setGuide(false); again(); }}>Again, from memory</button>}
          </div>
        </>}
      </div>
    </div>
  );
}
