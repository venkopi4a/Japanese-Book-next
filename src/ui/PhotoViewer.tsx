import { useEffect, useState } from 'preact/hooks';
import { Icon } from '../app/icons';

/** Full-screen photo. It can be scrolled, and pinch-zoomed on a phone, so handwriting can be checked closely. */
export function PhotoViewer({ url, title, onClose }: { url: string; title: string; onClose: () => void }) {
  return (
    <div class="overlay" style="z-index:50;background:var(--bg)" role="dialog" aria-modal="true" aria-label={title}>
      <div class="inner">
        <div class="topbar"><span class="j" style="flex:1;font-size:18px;padding-left:8px">{title}</span><button class="icon-btn" aria-label="Close photo" onClick={onClose}><Icon name="close" /></button></div>
        <div style="flex:1;overflow:auto;touch-action:pan-x pan-y pinch-zoom;padding:8px 12px 24px"><img src={url} alt={title} style="width:100%;display:block;border:1px solid var(--ru)" /></div>
      </div>
    </div>
  );
}

/** An object URL for a stored photo, released when no longer needed. */
export function useBlobUrl(blob: Blob | undefined | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) { setUrl(null); return; }
    const u = URL.createObjectURL(blob); setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}
