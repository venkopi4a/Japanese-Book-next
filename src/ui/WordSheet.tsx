import { useEffect, useMemo, useState } from 'preact/hooks';
import { useApp } from '../app/state';
import { Icon } from '../app/icons';
import { speak, speechSupported } from '../app/speech';
import { isKanaOnly } from '../domain/kana';
import { DAY, startOfDay } from '../domain/scheduler';
import { SKILLS, type Skill, type Word, type WordKind } from '../domain/types';
import { PhotoViewer, useBlobUrl } from './PhotoViewer';

const KINDS: WordKind[] = ['word', 'noun', 'verb', 'adjective', 'expression', 'particle', 'grammar', 'kanji'];
const SKILL_NAMES: Record<Skill, string> = { recognition: 'Recognition', recall: 'Recall', reading: 'Reading', listening: 'Listening', spelling: 'Spelling' };

function when(due: number, now: number) {
  const d = Math.round((startOfDay(due) - startOfDay(now)) / DAY);
  return d < 0 ? `overdue by ${-d} ${-d === 1 ? 'day' : 'days'}` : d === 0 ? 'due today' : d === 1 ? 'due tomorrow' : `due in ${d} days`;
}

export function WordSheet({ wordId, onClose }: { wordId: string | null; onClose: () => void }) {
  const { words, states, attempts, repo, reload, toast, settings } = useApp();
  const word = wordId ? words.find((w) => w.id === wordId) ?? null : null;
  const [editing, setEditing] = useState(wordId === null);
  const mine = states.filter((s) => s.wordId === wordId);
  const misses = useMemo(() => attempts.filter((a) => a.wordId === wordId && !a.correct).sort((a, b) => b.ts - a.ts).slice(0, 4), [attempts, wordId]);
  const now = Date.now();
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [showPhoto, setShowPhoto] = useState(false);
  useEffect(() => { if (word?.photoId) repo.getPhoto(word.photoId).then((p) => setPhoto(p?.blob ?? null)); else setPhoto(null); }, [word?.photoId]);
  const photoUrl = useBlobUrl(photo);

  if (editing) return <Form word={word} onDone={(saved) => { if (word && saved) setEditing(false); else onClose(); }} />;
  if (!word) return null;
  const remove = async () => {
    await repo.deleteWord(word.id); await reload(); onClose();
    toast(`Deleted ${word.text}`, { label: 'Undo', run: async () => { await repo.updateWord(word.id, { deletedAt: null }); await reload(); } });
  };
  return (
    <div class="overlay" role="dialog" aria-modal="true" aria-label={word.text}><div class="inner">
      <div class="topbar">
        <button class="link" onClick={onClose} style="display:flex;align-items:center;gap:2px"><Icon name="back" /> Back</button>
        <span style="flex:1" />
        <button class="icon-btn" aria-label={word.favourite ? 'Remove from favourites' : 'Add to favourites'} aria-pressed={word.favourite} style={word.favourite ? 'color:var(--ac)' : ''} onClick={async () => { await repo.updateWord(word.id, { favourite: !word.favourite }); await reload(); }}><Icon name="star" fill={word.favourite} /></button>
        <button class="link" onClick={() => setEditing(true)}>Edit</button>
      </div>
      <div class="screen" style="padding-top:12px">
        <div class="j" lang="ja" style="font-size:60px;line-height:1.15;color:var(--ac)">{word.text}</div>
        <div style="font-size:22px;display:flex;align-items:center;gap:4px" lang="ja">{word.reading}
          {speechSupported() && <button class="icon-btn" aria-label="Play audio" onClick={() => speak(word.reading || word.text, settings.speechRate)}><Icon name="speaker" /></button>}
        </div>
        <div class="j" style="font-size:28px;margin:0 0 14px">{word.meaning}</div>
        <Meta k="Type" v={word.kind} /><Meta k="Topic" v={word.topic} /><Meta k="Lesson / unit" v={word.unit} />{word.note && <Meta k="Note" v={word.note} />}
        {photoUrl && <div class="row"><span class="m" style="font-size:15px">From a photo</span><button class="link" onClick={() => setShowPhoto(true)}>View photo</button></div>}
        <h2 style="margin-top:22px">Progress</h2>
        {SKILLS.map((s) => { const st = mine.find((x) => x.skill === s); return <Meta key={s} k={SKILL_NAMES[s]} v={st ? `${'●'.repeat(st.box)}${'○'.repeat(6 - st.box)} · ${when(st.dueAt, now)}` : 'not started'} />; })}
        <h2 style="margin-top:22px">Mistakes on this word</h2>
        {misses.length === 0 ? <div class="m">None recorded.</div> : misses.map((a) => <div class="row" key={a.id}><span lang="ja">{a.submitted || '(blank)'} <span class="m">instead of</span> {a.expected}</span><span class="m">{SKILL_NAMES[a.skill]}</span></div>)}
        <h2 style="margin-top:22px">Examples</h2>
        {word.examples.length === 0 ? <div class="m">No examples yet. Add one with Edit.</div> : word.examples.map((e, i) => <div class="row" key={i} style="display:block"><div lang="ja">{e.ja}</div><div class="m">{e.en}</div></div>)}
        <button class="btn danger" style="width:100%;margin-top:28px" onClick={remove}>Delete word</button>
      </div>
      {showPhoto && photoUrl && <PhotoViewer url={photoUrl} title="Photo this word came from" onClose={() => setShowPhoto(false)} />}
    </div></div>
  );
}

const Meta = ({ k, v }: { k: string; v: string | null }) => <div class="row"><span class="m" style="font-size:15px">{k}</span><span>{v || <span style="color:var(--mu)">Not set</span>}</span></div>;

function Form({ word, onDone }: { word: Word | null; onDone: (saved: boolean) => void }) {
  const { words, repo, reload, toast } = useApp();
  const [f, setF] = useState({ text: word?.text ?? '', reading: word?.reading ?? '', meaning: word?.meaning ?? '', kind: word?.kind ?? 'word', topic: word?.topic ?? '', unit: word?.unit ?? '', note: word?.note ?? '', ja: word?.examples[0]?.ja ?? '', en: word?.examples[0]?.en ?? '' });
  const [err, setErr] = useState('');
  const topics = useMemo(() => [...new Set(words.map((w) => w.topic).filter(Boolean))] as string[], [words]);
  const set = (k: keyof typeof f) => (e: Event) => setF((c) => ({ ...c, [k]: (e.target as HTMLInputElement).value }));

  const save = async (e: Event) => {
    e.preventDefault();
    const text = f.text.trim(), meaning = f.meaning.trim();
    const reading = f.reading.trim() || (isKanaOnly(text) ? text : '');
    if (!text) return setErr('Enter the Japanese word.');
    if (!reading) return setErr('Enter the reading in kana.');
    if (!isKanaOnly(reading)) return setErr('The reading must be in kana (hiragana or katakana).');
    if (!meaning) return setErr('Enter the English meaning.');
    if (!word && words.some((w) => w.text === text && w.reading === reading)) return setErr('This word is already in your notebook.');
    const examples = f.ja.trim() ? [{ ja: f.ja.trim(), en: f.en.trim() }] : [];
    const patch = { text, reading, meaning, kind: f.kind as WordKind, topic: f.topic.trim() || null, unit: f.unit.trim() || null, note: f.note.trim() || null, examples };
    if (word) await repo.updateWord(word.id, patch); else await repo.addWords([{ ...patch, source: 'user' }]);
    await reload(); toast(word ? 'Saved' : `Added ${text}`); onDone(true);
  };
  return (
    <div class="overlay" role="dialog" aria-modal="true" aria-label={word ? 'Edit word' : 'Add a word'}><div class="inner">
      <div class="topbar"><button class="link" onClick={() => onDone(false)}>Cancel</button><span class="j" style="flex:1;text-align:center;font-size:18px">{word ? 'Edit word' : 'Add a word'}</span><span style="width:64px" /></div>
      <form class="screen" style="padding-top:8px" onSubmit={save}>
        <label class="field"><span>Japanese</span><input name="text" class="input ja" lang="ja" value={f.text} onInput={set('text')} autocapitalize="off" autocorrect="off" spellcheck={false} /></label>
        <label class="field"><span>Reading (kana)</span><input name="reading" class="input" lang="ja" value={f.reading} onInput={set('reading')} placeholder="Optional for kana-only words" autocapitalize="off" autocorrect="off" spellcheck={false} /></label>
        <label class="field"><span>Meaning</span><input name="meaning" class="input" value={f.meaning} onInput={set('meaning')} autocapitalize="off" /></label>
        <label class="field"><span>Type</span><select class="select" value={f.kind} onChange={set('kind')}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select></label>
        <label class="field"><span>Topic</span><input class="input" list="topics" value={f.topic} onInput={set('topic')} /><datalist id="topics">{topics.map((t) => <option key={t} value={t} />)}</datalist></label>
        <label class="field"><span>Lesson or unit (optional)</span><input class="input" value={f.unit} onInput={set('unit')} /></label>
        <label class="field"><span>Note (optional)</span><textarea class="input" value={f.note} onInput={set('note')} /></label>
        <label class="field"><span>Example sentence (optional)</span><input class="input" lang="ja" value={f.ja} onInput={set('ja')} /></label>
        {f.ja && <label class="field"><span>Example translation</span><input class="input" value={f.en} onInput={set('en')} /></label>}
        {err && <p class="note" role="alert" style="margin:14px 0 0">{err}</p>}
        <button class="btn primary" type="submit" style="margin-top:20px">{word ? 'Save' : 'Add word'}</button>
      </form>
    </div></div>
  );
}
