import { useRef, useState } from 'preact/hooks';
import { dbName } from '../data/db';
import { COLOURS, MAX_PROFILES, addProfile, lastProfileId, loadProfiles, removeProfile, renameProfile, type Profile } from '../app/profiles';

/** "Who's studying?": everyone on this device has their own progress. Shown at start when there is more than one person. */
export function ProfilePicker({ onPick }: { onPick: (p: Profile) => void }) {
  const [list, setList] = useState<Profile[]>(loadProfiles);
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(list.length === 0);
  const [editing, setEditing] = useState(false);
  const last = lastProfileId();
  const refresh = () => setList(loadProfiles());

  const input = useRef<HTMLInputElement>(null);
  const save = (raw: string) => {
    const p = addProfile(raw);
    setName(''); setAdding(false); refresh();
    if (list.length === 0) onPick(p); // the very first person goes straight in
  };
  const create = (e: Event) => { e.preventDefault(); if (name.trim()) save(name); };
  /**
   * Fallback for iPhone Home Screen apps, where the keyboard sometimes does not open for a text box.
   * The phone's own pop-up always works there.
   */
  const askNative = () => { const n = window.prompt(list.length ? 'Name of the new person' : 'What’s your name?', name); if (n && n.trim()) save(n); };
  const remove = (p: Profile) => {
    if (!window.confirm(`Delete ${p.name} and all of ${p.name}'s words and progress on this device? This cannot be undone.`)) return;
    removeProfile(p.id);
    const req = indexedDB.deleteDatabase(dbName(import.meta.env.BASE_URL, p.id));
    req.onsuccess = req.onerror = req.onblocked = () => location.reload();
  };

  return (
    <div class="shell"><div class="screen picker">
      <div style="text-align:center;margin:40px 0 26px">
        <span class="seal" aria-hidden="true" style="margin:0 auto 14px">単</span>
        <h1 class="j" style="font-size:30px;margin:0">{list.length ? 'Who’s studying?' : 'Welcome'}</h1>
        <p class="m" style="margin:6px 0 0">{list.length ? 'Each person has their own words and progress.' : 'Your progress stays on this phone. You can add a second person later.'}</p>
      </div>

      <div class="people">
        {list.map((p) => (
          <div class="person" key={p.id}>
            <button class="person-btn" onClick={() => !editing && onPick(p)} aria-label={`Study as ${p.name}`} disabled={editing}>
              <span class="avatar" style={`background:${COLOURS[p.colour] ?? COLOURS[0]}`}>{p.name.slice(0, 1).toUpperCase()}</span>
              <span class="pname">{p.name}</span>
              {p.id === last && !editing && <span class="m" style="font-size:12px">last time</span>}
            </button>
            {editing && <div style="display:flex;gap:6px;justify-content:center;margin-top:6px">
              <button class="link" onClick={() => { const n = window.prompt('New name', p.name); if (n) { renameProfile(p.id, n); refresh(); } }}>Rename</button>
              <button class="link" style="color:var(--ac)" onClick={() => remove(p)}>Delete</button>
            </div>}
          </div>
        ))}
      </div>

      {adding ? (
        <form class="card" style="margin-top:22px" onSubmit={create} onClick={(e) => { if (!(e.target as HTMLElement).closest('button')) input.current?.focus(); }}>
          <label class="field" style="margin:0"><span>{list.length ? 'Name of the new person' : 'What’s your name?'}</span>
            {/* focus() inside the tap handler opens the keyboard on iPhone even when a plain tap does not */}
            <input ref={input} class="input" type="text" name="person" value={name} maxLength={24} autocomplete="off" autocapitalize="words" autocorrect="off" spellcheck={false} enterkeyhint="go" inputMode="text"
              onTouchEnd={() => input.current?.focus()} onInput={(e) => setName((e.target as HTMLInputElement).value)} /></label>
          <div style="display:flex;gap:10px;margin-top:12px">
            {list.length > 0 && <button type="button" class="btn" style="flex:1" onClick={() => setAdding(false)}>Cancel</button>}
            <button class="btn primary" style="flex:2" type="submit" disabled={!name.trim()}>{list.length ? 'Add' : 'Start'}</button>
          </div>
          <button type="button" class="link" style="width:100%;margin-top:6px;font-size:14px;font-weight:600;color:var(--mu)" onClick={askNative}>Keyboard not opening? Tap here</button>
        </form>
      ) : (
        <div style="display:flex;gap:10px;margin-top:26px">
          {list.length < MAX_PROFILES && <button class="btn" style="flex:1" onClick={() => { setAdding(true); setEditing(false); }}>+ Add a person</button>}
          <button class="btn" style="flex:1" onClick={() => setEditing(!editing)}>{editing ? 'Done' : 'Edit'}</button>
        </div>
      )}
    </div></div>
  );
}
