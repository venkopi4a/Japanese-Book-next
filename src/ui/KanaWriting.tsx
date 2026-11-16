import { HIRAGANA_INTRO, originFor } from '../domain/kanaOrigins';
import type { KanaChar } from '../domain/kanaCourse';
import { useState } from 'preact/hooks';
import { StrokeOrder } from './StrokeOrder';
import { TraceKana } from './TraceKana';

/** True when the course has a stroke-order drawing for this kana (single characters only, not combinations). */
export const hasStrokes = (k: KanaChar) => k.stage !== 'combo';

/** "Why it looks like this": the kanji a hiragana grew out of. Katakana and voiced kana have none yet. */
export function Origin({ k }: { k: KanaChar }) {
  const o = k.script === 'hiragana' && k.stage === 'basic' ? originFor(k.char) : undefined;
  if (!o) return null;
  return (
    <div class="origin-box">
      <b>Why it looks like this</b>
      <div class="origin-row">
        <span class="origin-from j" lang="zh-Hant-JP" aria-hidden="true">{o[0]}</span>
        <span class="origin-arrow" aria-hidden="true">→</span>
        <span class="origin-to j" lang="ja" aria-hidden="true">{k.char}</span>
        <span class="m origin-name">from <span lang="ja">{o[0]}</span> ({o[1]})</span>
      </div>
      <div>{o[2]}</div>
    </div>
  );
}

export { HIRAGANA_INTRO };

/** How to write a kana: the animated stroke order, plus the tip for combinations. */
export function Writing({ k, size = 150 }: { k: KanaChar; size?: number }) {
  if (k.stage === 'combo') {
    return <div class="origin-box"><b>How to write it</b><div>Write the first kana at normal size, then the small one about half the size, tucked in at the lower right of it. Same stroke order as each kana on its own.</div></div>;
  }
  return <StrokeOrder char={k.char} size={size} />;
}

/** The button that opens finger-tracing practice for a kana (single characters only). */
export function TraceButton({ k, style = '' }: { k: KanaChar; style?: string }) {
  const [open, setOpen] = useState(false);
  if (k.stage === 'combo') return null;
  return <>
    <button class="btn trace-btn" style={style} onClick={() => setOpen(true)}>Try writing it</button>
    {open && <TraceKana char={k.char} onClose={() => setOpen(false)} />}
  </>;
}
