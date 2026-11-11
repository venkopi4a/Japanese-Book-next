import { useEffect, useRef, useState } from 'preact/hooks';
import { useApp } from '../app/state';
import { Icon } from '../app/icons';

const CAMERA = '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>';
const PHOTOS = '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 16l5-5 4 4 3-3 4 4"/>';

/** The Add menu. The photo pickers use a normal file input: it opens the camera or the photo library on iPhone, in Safari and in the installed app. */
export function AddSheet({ onPick, onResume, onType, onClose }: { onPick: (files: File[]) => void; onResume: () => void; onType: () => void; onClose: () => void }) {
  const { repo } = useApp();
  const cam = useRef<HTMLInputElement>(null), lib = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<number | null>(null);
  useEffect(() => { repo.loadDraft().then((d) => setDraft(d ? d.items.filter((i) => i.status !== 'removed').length : null)); }, []);
  const picked = (e: Event) => { const f = [...((e.target as HTMLInputElement).files ?? [])]; (e.target as HTMLInputElement).value = ''; if (f.length) onPick(f); };
  const opt = (icon: string, title: string, sub: string, run: () => void) => (
    <button class="btn" style="display:flex;justify-content:flex-start;gap:14px;width:100%;text-align:left;padding:12px 16px;margin-bottom:10px;min-height:64px;align-items:center" onClick={run}>
      <span style="color:var(--ac);flex:none"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: icon }} /></span>
      <span><b style="font-weight:700">{title}</b><br /><span class="m">{sub}</span></span>
    </button>
  );
  return (
    <div class="sheet-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="sheet" role="dialog" aria-modal="true" aria-label="Add words">
        <h2 style="font-size:22px;margin-bottom:14px">Add words</h2>
        {draft !== null && opt(PHOTOS, 'Continue your last import', `${draft} ${draft === 1 ? 'word' : 'words'} waiting to be reviewed`, onResume)}
        {opt(CAMERA, 'Take a photo', 'Photograph a handwritten list', () => cam.current?.click())}
        {opt(PHOTOS, 'Choose photos', 'From your library, one or several', () => lib.current?.click())}
        {opt('<path d="M5 19l1-4L16 5l3 3L9 18z"/>', 'Type a word', 'Add a single word by hand', onType)}
        <button class="btn accent" style="width:100%" onClick={onClose}>Cancel</button>
        <input class="vh" ref={cam} type="file" accept="image/*" capture="environment" onChange={picked} aria-label="Take a photo" tabIndex={-1} />
        <input class="vh" ref={lib} type="file" accept="image/*" multiple onChange={picked} aria-label="Choose photos" tabIndex={-1} />
      </div>
    </div>
  );
}
export { Icon };
