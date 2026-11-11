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
  const [pad, setPad] = useState(false);
  const [renaming, setRenaming] = useState<Profile | null>(null);
  const save = (raw: string) => {
    setName(''); setAdding(false); setPad(false);
    if (renaming) { renameProfile(renaming.id, raw); setRenaming(null); refresh(); return; }
    const p = addProfile(raw);
    refresh();
    if (list.length === 0) onPick(p); // the very first person goes straight in
  };
  const create = (e: Event) => { e.preventDefault(); if (name.trim()) save(name); };
  /**
   * On some iPhones a Home Screen app gets neither the keyboard nor pop-ups on this screen.
   * The letter pad and "Skip for now" need only taps, so nobody is ever locked out.
   */
  const press = (k: string) => setName((n) => (k === '⌫' ? n.slice(0, -1) : (n + (k === 'space' ? ' ' : n === '' || n.endsWith(' ') ? k : k.toLowerCase())).slice(0, 24)));
  const label = renaming ? `New name for ${renaming.name}` : list.length ? 'Name of the new person' : 'What’s your name?';
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
              <button class="link" onClick={() => { setRenaming(p); setName(''); setAdding(true); setEditing(false); }}>Rename</button>
              <button class="link" style="color:var(--ac)" onClick={() => remove(p)}>Delete</button>
            </div>}
          </div>
        ))}
      </div>

      {adding ? (
        <form class="card" style="margin-top:22px" onSubmit={create} onClick={(e) => { if (!(e.target as HTMLElement).closest('button')) input.current?.focus(); }}>
          <label class="field" style="margin:0"><span>{label}</span>
            {/* focus() inside the tap handler opens the keyboard on iPhone even when a plain tap does not */}
            <input ref={input} class="input" type="text" name="person" value={name} maxLength={24} autocomplete="off" autocapitalize="words" autocorrect="off" spellcheck={false} enterkeyhint="go" inputMode="text"
              onTouchEnd={() => input.current?.focus()} onInput={(e) => setName((e.target as HTMLInputElement).value)} /></label>
          <div style="display:flex;gap:10px;margin-top:12px">
            {list.length > 0 && <button type="button" class="btn" style="flex:1" onClick={() => { setAdding(false); setRenaming(null); setPad(false); setName(''); }}>Cancel</button>}
            <button class="btn primary" style="flex:2" type="submit" disabled={!name.trim()}>{renaming ? 'Save' : list.length ? 'Add' : 'Start'}</button>
          </div>
          {pad && (
            <div class="namepad" role="group" aria-label="Letter buttons">
              {['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'].map((row) => <div key={row}>{Array.from(row).map((k) => <button type="button" key={k} onClick={() => press(k)}>{k}</button>)}</div>)}
              <div><button type="button" class="wide" onClick={() => press('space')}>space</button><button type="button" class="wide" aria-label="Delete a letter" onClick={() => press('⌫')}>⌫</button></div>
            </div>
          )}
          <div style="display:flex;gap:10px;margin-top:10px">
            <button type="button" class="btn" style="flex:1;font-size:14px" onClick={() => setPad(!pad)}>{pad ? 'Hide letters' : 'Keyboard not opening?'}</button>
            {!renaming && <button type="button" class="btn" style="flex:1;font-size:14px" onClick={() => save('')}>Skip for now</button>}
          </div>
          {!renaming && <p class="m" style="margin:8px 0 0;text-align:center">Skip gives you a name like “Person 1”. You can rename it later in Settings.</p>}
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
