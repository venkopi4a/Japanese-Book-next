import { useEffect, useRef, useState } from 'preact/hooks';
import { MIN_CROP, type Rect } from '../app/image';

type Mode = 'move' | 'tl' | 'tr' | 'bl' | 'br' | 't' | 'b' | 'l' | 'r';
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Shows the photo with a crop frame. Drag a corner or edge to resize it, or drag inside to move it. */
export function Cropper({ canvas, rect, onRect }: { canvas: HTMLCanvasElement; rect: Rect; onRect: (r: Rect) => void }) {
  const stage = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const view = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const drag = useRef<{ mode: Mode; x0: number; y0: number; start: Rect; bw: number; bh: number } | null>(null);

  useEffect(() => {
    const measure = () => {
      const s = stage.current; if (!s) return;
      const aw = s.clientWidth - 40, ah = s.clientHeight - 16;
      const k = Math.min(aw / canvas.width, ah / canvas.height);
      setSize({ w: Math.max(40, Math.floor(canvas.width * k)), h: Math.max(40, Math.floor(canvas.height * k)) });
    };
    measure();
    const ro = new ResizeObserver(measure); if (stage.current) ro.observe(stage.current);
    return () => ro.disconnect();
  }, [canvas]);
  useEffect(() => {
    const v = view.current; if (!v) return;
    v.width = canvas.width; v.height = canvas.height;
    v.getContext('2d')!.drawImage(canvas, 0, 0);
  }, [canvas]);

  const down = (e: PointerEvent) => {
    const el = box.current; if (!el) return;
    const b = el.getBoundingClientRect();
    const px = e.clientX - b.left, py = e.clientY - b.top;
    const L = rect.x * b.width, T = rect.y * b.height, R = (rect.x + rect.w) * b.width, B = (rect.y + rect.h) * b.height;
    const S = 28; // finger-sized hit area
    const near = (x: number, y: number) => Math.hypot(px - x, py - y) < S;
    const inX = px > L && px < R, inY = py > T && py < B;
    const mode: Mode | null = near(L, T) ? 'tl' : near(R, T) ? 'tr' : near(L, B) ? 'bl' : near(R, B) ? 'br'
      : Math.abs(py - T) < S / 2 && inX ? 't' : Math.abs(py - B) < S / 2 && inX ? 'b'
      : Math.abs(px - L) < S / 2 && inY ? 'l' : Math.abs(px - R) < S / 2 && inY ? 'r' : inX && inY ? 'move' : null;
    if (!mode) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode, x0: e.clientX, y0: e.clientY, start: rect, bw: b.width, bh: b.height };
    e.preventDefault();
  };
  const move = (e: PointerEvent) => {
    const d = drag.current; if (!d) return;
    const dx = (e.clientX - d.x0) / d.bw, dy = (e.clientY - d.y0) / d.bh;
    let l = d.start.x, t = d.start.y, r = d.start.x + d.start.w, b = d.start.y + d.start.h;
    if (d.mode === 'move') {
      const w = r - l, h = b - t;
      l = clamp(l + dx, 0, 1 - w); t = clamp(t + dy, 0, 1 - h); r = l + w; b = t + h;
    } else {
      if (d.mode.includes('l')) l = clamp(l + dx, 0, r - MIN_CROP);
      if (d.mode.includes('r')) r = clamp(r + dx, l + MIN_CROP, 1);
      if (d.mode.includes('t')) t = clamp(t + dy, 0, b - MIN_CROP);
      if (d.mode.includes('b')) b = clamp(b + dy, t + MIN_CROP, 1);
    }
    onRect({ x: l, y: t, w: r - l, h: b - t });
  };
  const up = () => { drag.current = null; };

  return (
    <div class="crop-stage" ref={stage}>
      <div class="crop-box" ref={box} style={`width:${size.w}px;height:${size.h}px`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} role="img" aria-label="Your photo with a crop frame">
        <canvas ref={view} />
        <div class="crop-rect" style={`left:${rect.x * 100}%;top:${rect.y * 100}%;width:${rect.w * 100}%;height:${rect.h * 100}%`}>
          <i style="left:-9px;top:-9px" /><i style="right:-9px;top:-9px" /><i style="left:-9px;bottom:-9px" /><i style="right:-9px;bottom:-9px" />
        </div>
      </div>
    </div>
  );
}
