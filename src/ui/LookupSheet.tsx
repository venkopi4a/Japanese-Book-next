import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useApp } from '../app/state';
import { romajiOf } from '../app/exercise';
import { buildIndex, lookup, type DictIndex, type Match } from '../domain/lookup';

let cached: Promise<DictIndex> | null = null;
/** The dictionary is a separate file (about 1 MB compressed), loaded the first time someone looks a word up and then kept for offline use. */
const loadIndex = () => (cached ??= import('../data/dictionary.json').then((m) => buildIndex(m.default as never)));

const keyOf = (text: string, reading: string) => `${text.normalize('NFKC')}|${reading.normalize('NFKC')}`;

/** "Add a word": type the English, pick the Japanese. One tap adds it to the notebook. */
export function LookupSheet({ onClose, onManual }: { onClose: () => void; onManual: () => void }) {
  const { repo, words, reload, toast } = useApp();
  const [q, setQ] = useState('');
  const [ix, setIx] = useState<DictIndex | null>(null);
  const [failed, setFailed] = useState(false);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { loadIndex().then(setIx, () => setFailed(true)); input.current?.focus(); }, []);

  const have = useMemo(() => new Set(words.filter((w) => !w.deletedAt).map((w) => keyOf(w.text, w.reading))), [words]);
  const [debounced, setDebounced] = useState('');
  useEffect(() => { const t = setTimeout(() => setDebounced(q), 120); return () => clearTimeout(t); }, [q]);
  const results = useMemo(() => (ix ? lookup(ix, debounced, 8) : []), [ix, debounced]);

  const add = async (m: Match) => {
    const k = keyOf(m.text, m.reading);
    setBusy(k);
    try {
      await repo.addWords([{ text: m.text, reading: m.reading, meaning: m.meaning, kind: m.kind, source: 'user' }]);
      await reload();
      setAdded((a) => new Set(a).add(k));
    } catch { toast('Could not add that word. Nothing was changed.'); }
    finally { setBusy(null); }
  };

  const typed = debounced.trim().length >= 2 || /[぀-ヿ㐀-鿿]/.test(debounced);
  return (
    <div class="sheet-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="sheet" role="dialog" aria-modal="true" aria-label="Add a word">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <h2 style="font-size:22px;margin:0">Add a word</h2>
          <button class="btn" onClick={onClose}>Done{added.size ? ` (${added.size} added)` : ''}</button>
        </div>
        <input ref={input} class="input" type="search" name="english" aria-label="English word" placeholder="Type it in English, e.g. cat, to eat" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} enterkeyhint="search" autocapitalize="off" autocorrect="off" autocomplete="off" spellcheck={false} />
        <div style="margin-top:6px" aria-live="polite">
          {failed && <p class="m">The dictionary could not load. Check your connection once, then try again.</p>}
          {!failed && !ix && typed && <p class="m">Loading the dictionary…</p>}
          {ix && !typed && <p class="m">Type an English word and pick the Japanese one. Try <b>cat</b>, <b>to eat</b> or <b>thank you</b>.</p>}
          {ix && typed && !results.length && <p class="m">No match for “{debounced.trim()}”. Try a simpler word (cat instead of kitten), or add it by hand below.</p>}
          {results.map((m) => {
            const k = keyOf(m.text, m.reading);
            const done = added.has(k), inBook = have.has(k) && !done;
            return (
              <div key={k + m.meaning} class="row" data-result>
                <span style="min-width:0">
                  <span class="j" lang="ja" style="font-size:22px">{m.text}</span>{m.reading !== m.text && <> <span class="m" lang="ja">{m.reading}</span></>}
                  <span class="roma" style="display:block">{romajiOf(m.reading)}</span>
                  <span style="display:block;font-size:14px">{m.meaning}{m.pos && <span class="m"> · {m.pos}</span>}</span>
                </span>
                <button class="btn add" style="flex:none;min-width:84px" name="add-result" disabled={done || inBook || busy === k} onClick={() => add(m)}>
                  {done ? '✓ Added' : inBook ? 'In notebook' : 'Add'}
                </button>
              </div>
            );
          })}
        </div>
        <button class="btn" style="width:100%;margin-top:14px" onClick={onManual}>Can’t find it? Add it by hand</button>
      </div>
    </div>
  );
}
