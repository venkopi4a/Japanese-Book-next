import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useApp } from '../app/state';
import { Icon } from '../app/icons';
import { cropToBlob, defaultRect, loadBase, rotateQuarter, type Rect } from '../app/image';
import { isKanaOnly } from '../domain/kana';
import type { Word } from '../domain/types';
import { buildReview, confirmItem, editItem, manualItem, refreshDuplicates, removeItem, summarise, type ReviewItem } from '../import/review';
import { activeRecogniser, recogniseAll } from '../recognise/provider';
import { Cropper } from './Cropper';
import { PhotoViewer } from './PhotoViewer';
import type { SessionItem } from './Session';

interface Pic { id: string; file: File | null; blob: Blob | null; url: string | null; width: number; height: number; rotation: number; rect: Rect }
const MAX_PHOTOS = 8;
const uid = () => globalThis.crypto.randomUUID();
const newPic = (file: File): Pic => ({ id: uid(), file, blob: null, url: null, width: 0, height: 0, rotation: 0, rect: defaultRect });
type Step = 'crop' | 'reading' | 'review' | 'saved';

export function PhotoFlow({ files, resume, onClose, onPractise }: { files: File[]; resume: boolean; onClose: () => void; onPractise: (items: SessionItem[]) => void }) {
  const { repo, words, reload, toast } = useApp();
  const [pics, setPics] = useState<Pic[]>(() => files.slice(0, MAX_PHOTOS).map(newPic));
  const [step, setStep] = useState<Step>(resume ? 'review' : 'crop');
  const [idx, setIdx] = useState(0);
  const [view, setView] = useState<HTMLCanvasElement | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [failed, setFailed] = useState<number[]>([]);
  const [readErr, setReadErr] = useState(false);
  const [prog, setProg] = useState({ done: 0, total: 1 });
  const [topic, setTopic] = useState('');
  const [unit, setUnit] = useState('');
  const [keep, setKeep] = useState(true);
  const [leave, setLeave] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [viewer, setViewer] = useState<number | null>(null);
  const [saved, setSaved] = useState<{ added: Word[]; skipped: number; removed: number } | null>(null);
  const raw = useRef<HTMLCanvasElement | null>(null);
  const abort = useRef<AbortController | null>(null);
  const more = useRef<HTMLInputElement>(null);
  const picsRef = useRef(pics); picsRef.current = pics;
  const pic = pics[idx];

  const patch = (i: number, p: Partial<Pic>) => setPics((cur) => cur.map((x, j) => (j === i ? { ...x, ...p } : x)));
  useEffect(() => () => picsRef.current.forEach((p) => p.url && URL.revokeObjectURL(p.url)), []);

  // resume an unfinished import
  useEffect(() => {
    if (!resume) return;
    repo.loadDraft().then((d) => {
      if (!d) { toast('There was nothing to continue'); return onClose(); }
      setPics(d.photos.map((p) => ({ id: p.id, file: null, blob: p.blob, url: URL.createObjectURL(p.blob), width: p.width, height: p.height, rotation: 0, rect: defaultRect })));
      setItems(refreshDuplicates(d.items, words)); setTopic(d.topic); setUnit(d.unit);
    });
  }, []);

  // open the photo being cropped
  useEffect(() => {
    if (step !== 'crop' || !pic?.file) return;
    let live = true; setLoadErr(''); setView(null);
    loadBase(pic.file).then((c) => { if (live) { raw.current = c; setView(rotateQuarter(c, pic.rotation)); } }).catch((e) => live && setLoadErr(e.message));
    return () => { live = false; };
  }, [step, pic?.id, pic?.rotation]);

  // keep a draft while reviewing, so nothing is lost if the app is closed or reloaded
  useEffect(() => {
    if (step !== 'review') return;
    const t = setTimeout(() => { repo.saveDraft({ photos: pics.filter((p) => p.blob).map((p) => ({ id: p.id, blob: p.blob!, width: p.width, height: p.height })), items, topic, unit, savedAt: Date.now() }); }, 300);
    return () => clearTimeout(t);
  }, [step, items, topic, unit]);

  const addFiles = (list: File[]) => setPics((cur) => [...cur, ...list.slice(0, Math.max(0, MAX_PHOTOS - cur.length)).map(newPic)]);

  const cropCurrent = async (): Promise<Pic[] | null> => {
    if (!view || !pic) return null;
    setBusy(true);
    try {
      const out = await cropToBlob(view, pic.rect);
      const url = URL.createObjectURL(out.blob);
      if (pic.url) URL.revokeObjectURL(pic.url);
      const next = picsRef.current.map((x, j) => (j === idx ? { ...x, blob: out.blob, url, width: out.width, height: out.height } : x));
      setPics(next); return next;
    } catch (e) { toast((e as Error).message); return null; } finally { setBusy(false); }
  };
  const next = async () => {
    const done = await cropCurrent(); if (!done) return;
    if (idx < done.length - 1) setIdx(idx + 1); else read(done);
  };
  const removePic = () => {
    if (pic?.url) URL.revokeObjectURL(pic.url);
    const rest = pics.filter((_, j) => j !== idx);
    if (!rest.length) return onClose();
    setPics(rest); setIdx(Math.min(idx, rest.length - 1));
  };

  const read = async (list: Pic[]) => {
    setStep('reading'); setReadErr(false); setProg({ done: 0, total: list.length });
    const ctl = new AbortController(); abort.current = ctl;
    try {
      const res = await recogniseAll(list.map((p, i) => ({ blob: p.blob!, index: i, width: p.width, height: p.height })), activeRecogniser, { signal: ctl.signal, onProgress: (d, t) => setProg({ done: d, total: t }) });
      if (res.failed.length === list.length) return setReadErr(true);
      setFailed(res.failed); setItems(buildReview(res.entries, words)); setStep('review');
    } catch (e) { if ((e as Error).name !== 'AbortError') setReadErr(true); }
  };
  const cancelReading = () => { abort.current?.abort(); setStep('crop'); };

  const sum = useMemo(() => summarise(items), [items]);
  const topics = useMemo(() => [...new Set(words.map((w) => w.topic).filter(Boolean))] as string[], [words]);
  const mutate = (fn: (cur: ReviewItem[]) => ReviewItem[]) => setItems((cur) => refreshDuplicates(fn(cur), words));
  const remove = (key: string) => {
    const before = items; mutate((cur) => cur.map((i) => (i.key === key ? removeItem(i) : i)));
    toast('Removed', { label: 'Undo', run: () => setItems(before) });
  };

  const save = async () => {
    setBusy(true);
    try {
      const usedPhotos = new Set(items.filter((i) => i.status === 'confirmed' && i.entry.photo !== null).map((i) => i.entry.photo as number));
      const photoIds = pics.map((p, i) => (keep && usedPhotos.has(i) && p.blob ? p.id : null));
      await repo.savePhotos(pics.filter((p, i) => photoIds[i]).map((p) => ({ id: p.id, blob: p.blob!, width: p.width, height: p.height })));
      const { added, skipped } = await repo.addPhotoBatch(items, { topic: topic.trim() || null, unit: unit.trim() || null, photoIds });
      await repo.clearDraft(); await reload();
      setSaved({ added, skipped: skipped.length + sum.duplicates, removed: sum.removed }); setConfirming(false); setStep('saved');
    } catch { toast('Could not save. Nothing was changed.'); } finally { setBusy(false); }
  };

  const editingItem = editing && editing !== 'new' ? items.find((i) => i.key === editing) ?? null : null;
  const practise = () => { if (saved) onPractise(saved.added.map((w) => ({ wordId: w.id, skill: 'recognition' as const, kind: 'new' as const, reason: 'New word', promote: true }))); onClose(); };

  // ---------- screens ----------
  if (step === 'saved' && saved) {
    return (
      <Shell>
        <div class="screen" style="padding-top:96px">
          <div class="j" style="font-size:36px;line-height:1.2">{saved.added.length} {saved.added.length === 1 ? 'word' : 'words'} added</div>
          <div class="m" style="margin-top:6px">{topic.trim() ? `to ${topic.trim()}, ready for your next practice.` : 'to your notebook, ready for your next practice.'}</div>
          <div class="list" style="margin-top:18px">{saved.added.map((w) => <div class="row" key={w.id}><span><span class="j" lang="ja" style="font-size:21px">{w.text}</span> <span class="m" lang="ja">{w.reading}</span></span><span class="m">{w.meaning}</span></div>)}</div>
          {(saved.skipped > 0 || saved.removed > 0) && <p class="m" style="margin-top:14px">{[saved.skipped ? `${saved.skipped} already in your notebook` : '', saved.removed ? `${saved.removed} removed` : ''].filter(Boolean).join(', ')}.</p>}
        </div>
        <div class="foot">
          {saved.added.length > 0 && <button class="btn primary" onClick={practise}>Practise these words</button>}
          <button class="btn accent" style="width:100%;margin-top:6px" onClick={onClose}>Done</button>
        </div>
      </Shell>
    );
  }

  if (step === 'reading') {
    return (
      <Shell>
        <div class="topbar"><span style="flex:1" /><span class="j" style="font-size:18px">Reading</span><span style="flex:1" /></div>
        <div class="q" style="justify-content:center;text-align:center;padding:0 32px">
          {pics[0]?.url && <img src={pics[Math.min(prog.done, pics.length - 1)]?.url ?? pics[0].url!} alt="" style="width:96px;height:120px;object-fit:cover;margin:0 auto 28px;border:1px solid var(--ru);border-radius:6px" />}
          {readErr ? (<>
            <div class="j" style="font-size:24px">Could not read the photo</div>
            <div class="m" style="margin:8px 0 22px;line-height:1.5">Nothing was saved. You can try again, or type the words yourself while looking at the photo.</div>
            <button class="btn primary" onClick={() => read(pics)}>Try again</button>
            <button class="btn" style="width:100%;margin-top:10px" onClick={() => { setFailed(pics.map((_, i) => i)); setItems([]); setStep('review'); }}>Type the words myself</button>
            <button class="btn accent" style="width:100%;margin-top:6px" onClick={() => setStep('crop')}>Back to photos</button>
          </>) : (<>
            <div class="j" style="font-size:24px">Reading your handwriting</div>
            <div class="m" style="margin:8px 0 22px;line-height:1.5">{pics.length > 1 ? `Photo ${Math.min(prog.done + 1, pics.length)} of ${pics.length}. ` : ''}Nothing is saved until you confirm it.</div>
            <div class="bar" role="progressbar" aria-label="Reading"><i style={`width:${Math.max(8, (prog.done / Math.max(1, prog.total)) * 100)}%`} /></div>
            <button class="btn" style="margin:28px auto 0;padding:0 28px" onClick={cancelReading}>Cancel</button>
          </>)}
        </div>
      </Shell>
    );
  }

  if (step === 'review') {
    return (
      <Shell>
        <div class="topbar"><button class="link" onClick={() => setLeave(true)}>Cancel</button><span class="j" style="flex:1;text-align:center;font-size:18px">Review words</span><span style="width:70px" /></div>
        <div class="screen" style="padding-top:10px">
          {activeRecogniser.isPlaceholder && <div class="banner" role="note"><b>Placeholder recognition.</b> These are sample words, not read from your photo. Real recognition is not connected yet.</div>}
          {failed.length > 0 && failed.length < pics.length && <div class="banner" role="note">{failed.length === 1 ? `Photo ${failed[0]! + 1} could not be read.` : `${failed.length} photos could not be read.`} Add its words by hand below.</div>}
          <div class="thumbs">{pics.filter((p) => p.url).map((p, i) => <button key={p.id} class="thumb" style={`background-image:url(${p.url})`} aria-label={`View photo ${i + 1}`} onClick={() => setViewer(i)} />)}<span class="m" style="align-self:center">{sum.ready + sum.needsCheck + sum.duplicates} found · tap a photo to look closer</span></div>
          <div class="m" style="margin:12px 0 4px">{sum.ready} ready{sum.needsCheck ? ` · ${sum.needsCheck} ${sum.needsCheck === 1 ? 'needs' : 'need'} your check` : ''}{sum.duplicates ? ` · ${sum.duplicates} already in your notebook` : ''}</div>
          <div class="list">
            {items.filter((i) => i.status !== 'removed').map((i) => (
              <div key={i.key} class={`rv${i.status === 'needs-check' ? ' check' : ''}${i.status === 'duplicate' ? ' dup' : ''}`}>
                <div style="min-width:0">
                  <span class="j" lang="ja" style="font-size:22px">{i.entry.text}</span> {i.entry.reading && i.entry.reading !== i.entry.text && <span class="m" lang="ja">{i.entry.reading}</span>}
                  <div style="font-size:14px">{i.entry.meaning || <span class="m">No meaning yet</span>}</div>
                  {i.status === 'needs-check' && <div class="note">{i.reasons.join(' · ')}</div>}
                  {i.status === 'duplicate' && <div class="m">Already in your notebook, will be skipped</div>}
                  {i.origin === 'manual' && <div class="m">Added by you</div>}
                </div>
                <button class="btn" style="min-height:44px;padding:0 14px;font-size:14px;flex:none" onClick={() => setEditing(i.key)}>{i.status === 'needs-check' ? 'Check' : 'Edit'}</button>
              </div>
            ))}
            <button class="row tap" style="color:var(--ac);font-weight:700;justify-content:flex-start;gap:8px" onClick={() => setEditing('new')}><Icon name="plus" size={18} /> Add a missing word</button>
          </div>
        </div>
        <div class="foot" style="border-top:1px solid var(--ru);background:var(--sf)">
          <button class="btn primary" disabled={sum.ready === 0} onClick={() => setConfirming(true)}>{sum.ready === 0 ? 'Nothing to save yet' : `Save ${sum.ready} ${sum.ready === 1 ? 'word' : 'words'}`}</button>
          {sum.needsCheck > 0 && <div class="m" style="text-align:center;margin-top:8px">{sum.needsCheck} still {sum.needsCheck === 1 ? 'needs' : 'need'} your check and will not be saved</div>}
        </div>

        {editing && <EntrySheet item={editingItem} onCancel={() => setEditing(null)}
          onRemove={editingItem ? () => { remove(editingItem.key); setEditing(null); } : undefined}
          onSave={(e) => {
            if (editingItem) mutate((cur) => cur.map((i) => (i.key === editingItem.key ? confirmItem(editItem(i, e)) : i)));
            else mutate((cur) => [...cur, manualItem(`m${Date.now()}`, e)]);
            setEditing(null);
          }} />}
        {confirming && (
          <Sheet label="Confirm">
            <h2 style="font-size:22px">Add {sum.ready} {sum.ready === 1 ? 'word' : 'words'} to your notebook?</h2>
            {activeRecogniser.isPlaceholder && <p class="note" style="margin:6px 0 0">These are placeholder sample words, not read from your photo.</p>}
            <p class="m" style="margin:6px 0 0">{[sum.needsCheck ? `${sum.needsCheck} still need your check and will not be saved.` : '', sum.duplicates ? `${sum.duplicates} already in your notebook will be skipped.` : '', sum.removed ? `${sum.removed} removed.` : ''].filter(Boolean).join(' ')}</p>
            <label class="field"><span>Topic</span><input class="input" list="photo-topics" value={topic} onInput={(e) => setTopic((e.target as HTMLInputElement).value)} /><datalist id="photo-topics">{topics.map((t) => <option key={t} value={t} />)}</datalist></label>
            <label class="field"><span>Lesson or unit (optional)</span><input class="input" value={unit} onInput={(e) => setUnit((e.target as HTMLInputElement).value)} /></label>
            <label style="display:flex;align-items:center;gap:12px;margin-top:16px"><input type="checkbox" checked={keep} onChange={(e) => setKeep((e.target as HTMLInputElement).checked)} style="width:24px;height:24px" /><span>Keep the photo with these words</span></label>
            <button class="btn primary" style="margin-top:18px" disabled={busy} onClick={save}>Add {sum.ready} {sum.ready === 1 ? 'word' : 'words'}</button>
            <button class="btn accent" style="width:100%;margin-top:6px" onClick={() => setConfirming(false)}>Keep reviewing</button>
          </Sheet>
        )}
        {leave && (
          <Sheet label="Leave review">
            <h2 style="font-size:22px">Leave this review?</h2>
            <p class="m" style="margin:6px 0 16px">Your photos and changes are kept as a draft, so you can continue later from the Add menu.</p>
            <button class="btn primary" onClick={onClose}>Save for later</button>
            <button class="btn danger" style="width:100%;margin-top:10px" onClick={async () => { await repo.clearDraft(); onClose(); }}>Discard this import</button>
            <button class="btn accent" style="width:100%;margin-top:6px" onClick={() => setLeave(false)}>Keep working</button>
          </Sheet>
        )}
        {viewer !== null && pics.filter((p) => p.url)[viewer] && <PhotoViewer url={pics.filter((p) => p.url)[viewer]!.url!} title={`Photo ${viewer + 1}`} onClose={() => setViewer(null)} />}
      </Shell>
    );
  }

  // crop step
  const first = idx === 0;
  return (
    <Shell>
      <div class="topbar"><button class="link" onClick={() => setLeave(true)}>Cancel</button><span class="j" style="flex:1;text-align:center;font-size:18px">Crop</span><span style="width:70px;text-align:right;color:var(--mu);font-size:13px">{pics.length > 1 ? `${idx + 1} of ${pics.length}` : ''}</span></div>
      {loadErr ? <div class="q" style="justify-content:center;text-align:center"><p class="note">{loadErr}</p><button class="btn" onClick={removePic}>Remove this photo</button></div>
        : view && pic ? <Cropper canvas={view} rect={pic.rect} onRect={(r) => patch(idx, { rect: r })} /> : <div class="q" style="justify-content:center;text-align:center" role="status"><span class="m">Opening photo</span></div>}
      <div class="m" style="text-align:center;padding:4px 28px 0;line-height:1.5">Drag the corners to frame the words you want. Wide lists read best one column at a time.</div>
      <div class="chips" style="justify-content:center;flex-wrap:wrap;padding:10px 20px 0">
        <button class="chip" onClick={() => patch(idx, { rotation: (pic!.rotation + 1) % 4, rect: defaultRect })} disabled={!view}>Rotate</button>
        <button class="chip" onClick={() => patch(idx, { rect: { x: 0, y: 0, w: 1, h: 1 } })} disabled={!view}>Whole photo</button>
        <button class="chip" onClick={() => more.current?.click()} disabled={pics.length >= MAX_PHOTOS}>Add photo</button>
        {pics.length > 1 && <button class="chip" onClick={removePic}>Remove</button>}
      </div>
      <div class="foot" style="display:flex;gap:10px">
        {!first && <button class="btn" style="flex:none" onClick={() => setIdx(idx - 1)}>Back</button>}
        <button class="btn primary" disabled={!view || busy} onClick={next}>{idx < pics.length - 1 ? 'Next photo' : 'Read handwriting'}</button>
      </div>
      <input class="vh" ref={more} type="file" accept="image/*" multiple tabIndex={-1} aria-label="Add another photo" onChange={(e) => { const f = [...((e.target as HTMLInputElement).files ?? [])]; (e.target as HTMLInputElement).value = ''; addFiles(f); }} />
      {leave && (
        <Sheet label="Discard photos">
          <h2 style="font-size:22px">Discard {pics.length === 1 ? 'this photo' : 'these photos'}?</h2>
          <p class="m" style="margin:6px 0 16px">Nothing has been added to your notebook.</p>
          <button class="btn danger" style="width:100%" onClick={onClose}>Discard</button>
          <button class="btn accent" style="width:100%;margin-top:6px" onClick={() => setLeave(false)}>Keep working</button>
        </Sheet>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: preact.ComponentChildren }) {
  return <div class="overlay" role="dialog" aria-modal="true" aria-label="Add words from a photo"><div class="inner">{children}</div></div>;
}
function Sheet({ children, label }: { children: preact.ComponentChildren; label: string }) {
  return <div class="sheet-bg"><div class="sheet" role="dialog" aria-modal="true" aria-label={label}>{children}</div></div>;
}

function EntrySheet({ item, onSave, onRemove, onCancel }: { item: ReviewItem | null; onSave: (e: { text: string; reading: string; meaning: string }) => void; onRemove?: () => void; onCancel: () => void }) {
  const [f, setF] = useState({ text: item?.entry.text ?? '', reading: item?.entry.reading ?? '', meaning: item?.entry.meaning ?? '' });
  const [err, setErr] = useState('');
  const set = (k: keyof typeof f) => (e: Event) => setF((c) => ({ ...c, [k]: (e.target as HTMLInputElement).value }));
  const submit = (e: Event) => {
    e.preventDefault();
    const text = f.text.trim(), meaning = f.meaning.trim(), reading = f.reading.trim() || (isKanaOnly(text) ? text : '');
    if (!text) return setErr('Enter the Japanese word.');
    if (!reading) return setErr('Enter the reading in kana.');
    if (!isKanaOnly(reading)) return setErr('The reading must be in kana (hiragana or katakana).');
    if (!meaning) return setErr('Enter the English meaning.');
    onSave({ text, reading, meaning });
  };
  return (
    <div class="sheet-bg"><div class="sheet" role="dialog" aria-modal="true" aria-label={item ? 'Check this word' : 'Add a missing word'}><form onSubmit={submit}>
      <h2 style="font-size:20px">{item ? 'Check this word' : 'Add a missing word'}</h2>
      {item && item.status === 'needs-check' && <div class="note" style="margin:2px 0 4px">{item.reasons.join(' · ')}</div>}
      <label class="field"><span>Japanese</span><input name="text" class="input ja" lang="ja" value={f.text} onInput={set('text')} autocapitalize="off" autocorrect="off" spellcheck={false} /></label>
      <label class="field"><span>Reading (kana)</span><input name="reading" class="input" lang="ja" value={f.reading} onInput={set('reading')} autocapitalize="off" autocorrect="off" spellcheck={false} /></label>
      <label class="field"><span>Meaning</span><input name="meaning" class="input" value={f.meaning} onInput={set('meaning')} autocapitalize="off" /></label>
      {err && <p class="note" role="alert" style="margin:12px 0 0">{err}</p>}
      <button class="btn primary" type="submit" style="margin-top:18px">{item ? 'Looks right' : 'Add word'}</button>
      <div style="display:flex;gap:10px;margin-top:10px">{onRemove && <button type="button" class="btn danger" style="flex:1" onClick={onRemove}>Remove</button>}<button type="button" class="btn" style="flex:1" onClick={onCancel}>Cancel</button></div>
    </form></div></div>
  );
}
