import { useEffect, useState } from 'preact/hooks';
import { useApp } from '../app/state';
import { APP_VERSION } from '../data/repo';
import { dbName } from '../data/db';
import { loadProfiles, removeProfile } from '../app/profiles';
import { chooseVoice, japaneseVoices, loadVoices, onVoicesChanged, speak, speakWithPhone, speechSupported, voiceQuality, type VoiceLike } from '../app/speech';

export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const { settings, setSettings, repo, profile, switchProfile, hiraganaDone } = useApp();
  const [voices, setVoices] = useState<VoiceLike[]>(japaneseVoices);
  const [loading, setLoading] = useState(true);
  const [voiceHelp, setVoiceHelp] = useState(false);
  // iPhones hand over the voice list late and do not always announce it, so keep checking for a few seconds
  const refresh = () => { setLoading(true); void loadVoices().then((v) => { setVoices(v); setLoading(false); }); };
  useEffect(() => { refresh(); return onVoicesChanged(() => setVoices(japaneseVoices())); }, []);
  const chosen = settings.voiceURI ? voices.find((v) => v.voiceURI === settings.voiceURI) : undefined;
  const using = chooseVoice(voices, settings.voiceURI);
  const natural = voices.filter((v) => voiceQuality(v) >= 2);
  const sel = <K extends keyof typeof settings>(k: K, v: string) => setSettings({ [k]: typeof settings[k] === 'number' ? Number(v) : v } as any);
  const others = loadProfiles().length > 1;

  const reset = async () => {
    if (!window.confirm(`Delete every word, answer and setting ${profile.name} has on this device? This cannot be undone.`)) return;
    await repo.wipe();
    removeProfile(profile.id);
    const req = indexedDB.deleteDatabase(dbName(import.meta.env.BASE_URL, profile.id));
    req.onsuccess = req.onerror = req.onblocked = () => location.reload();
  };
  const label = (v: VoiceLike) => `${v.name}${voiceQuality(v) >= 2 && !/enhanced|premium/i.test(v.name) ? ' (natural)' : ''}`;

  return (
    <div class="sheet-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="sheet" role="dialog" aria-modal="true" aria-label="Settings">
        <div style="display:flex;align-items:center"><h2 style="flex:1;font-size:22px">Settings</h2><button class="link" onClick={onClose}>Done</button></div>

        <div class="row" style="border-top:0;padding-top:4px">
          <span><b>{profile.name}</b><br /><span class="m">is studying on this device</span></span>
          <button class="btn" onClick={() => { onClose(); switchProfile(); }}>{others ? 'Switch person' : 'Add a person'}</button>
        </div>

        <label class="field"><span>Theme</span><select class="select" value={settings.theme} onChange={(e) => sel('theme', (e.target as HTMLSelectElement).value)}><option value="auto">Match my phone</option><option value="light">Light</option><option value="dark">Dark</option></select></label>

        <div class="section" style="margin-top:22px"><h2>Voice</h2></div>
        <div class="seg-toggle" role="group" aria-label="Voice" style="margin-top:6px">
          <button aria-pressed={settings.voiceMode === 'recorded'} onClick={() => setSettings({ voiceMode: 'recorded' })}>Natural voice</button>
          <button aria-pressed={settings.voiceMode === 'device'} onClick={() => setSettings({ voiceMode: 'device' })}>Phone voice</button>
        </div>
        {settings.voiceMode === 'recorded'
          ? <p class="m voice-info">A natural Japanese voice recorded into the app. It sounds the same on every phone, works offline and needs nothing downloaded. It covers every kana and all built-in words. Words you add yourself use the phone voice below.</p>
          : <p class="m voice-info">Everything is spoken by this phone's own voice. On iPhone this is often the robotic one.</p>}
        <button class="btn" style="width:100%;margin-top:10px" onClick={() => speak('こんにちは', settings.speechRate)}>Try it</button>
        <label class="field"><span>Speaking speed</span><select class="select" value={settings.speechRate} onChange={(e) => sel('speechRate', (e.target as HTMLSelectElement).value)}><option value={0.7}>Slow</option><option value={0.9}>Normal</option><option value={1.1}>Fast</option></select></label>
        <label class="field" style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:16px"><span style="margin:0;color:var(--ink);font-size:16px">Play audio automatically</span><input type="checkbox" checked={settings.autoPlay} onChange={(e) => setSettings({ autoPlay: (e.target as HTMLInputElement).checked })} style="width:24px;height:24px" /></label>

        {speechSupported() && <details class="phone-voice" style="margin-top:14px">
          <summary>Phone voice {settings.voiceMode === 'recorded' ? '(for words you add)' : ''}</summary>
          <label class="field" style="margin-top:4px"><span>Japanese voice on this phone</span>
            <select class="select" name="voice" value={settings.voiceURI} onChange={(e) => sel('voiceURI', (e.target as HTMLSelectElement).value)}>
              <option value="">Best available{voices[0] ? ` (${voices[0].name})` : ''}</option>
              {voices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{label(v)}</option>)}
            </select></label>
          <div class="voice-info m" role="status">
            {loading ? 'Looking for voices on this phone…'
              : voices.length === 0 ? 'This phone is not sharing any Japanese voice with the app yet.'
              : <>This phone shares {voices.length} Japanese {voices.length === 1 ? 'voice' : 'voices'} with the app: {voices.map((v) => v.name).join(', ')}.{natural.length === 0 && ' None of them is an Enhanced or Premium voice.'}</>}
            {settings.voiceURI && !chosen && !loading && <div style="color:var(--warn);margin-top:4px">Your chosen voice is not available right now, so {using?.name ?? 'the default voice'} is used.</div>}
          </div>
          <div style="display:flex;gap:10px;margin-top:10px">
            <button class="btn" style="flex:2" onClick={() => speakWithPhone('こんにちは。日本語を勉強しましょう。', settings.speechRate, settings.voiceURI)}>Try phone voice</button>
            <button class="btn" style="flex:1" disabled={loading} onClick={refresh}>Refresh list</button>
          </div>
          <button class="link" style="margin-top:8px" onClick={() => setVoiceHelp(!voiceHelp)}>{voiceHelp ? 'Hide' : 'Better phone voices on iPhone'}</button>
          {voiceHelp && (
            <div class="card" style="margin-top:8px;font-size:15px">
              <ol style="margin:0;padding-left:20px;line-height:1.6">
                <li>iPhone <b>Settings</b> → <b>Accessibility</b> → <b>Spoken Content</b> → <b>Voices</b> → <b>Japanese</b>.</li>
                <li>Download an <b>Enhanced</b> or <b>Premium</b> voice.</li>
                <li>Close this app fully, open it again, tap <b>Refresh list</b>.</li>
              </ol>
              <p class="m" style="margin:8px 0 0">If it still is not listed, your iPhone does not share it with web apps. Apple decides this; the app cannot unlock it. The natural voice above does not depend on it.</p>
            </div>
          )}
        </details>}

        <div class="section" style="margin-top:22px"><h2>Kana</h2></div>
        <label class="field" style="margin-top:4px"><span>New kana per day</span><select class="select" value={settings.kanaLimit} onChange={(e) => sel('kanaLimit', (e.target as HTMLSelectElement).value)}>{[5, 10, 15, 20, 25].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
        {!hiraganaDone && <>
          <label class="field" style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:16px"><span style="margin:0;color:var(--ink);font-size:16px">I already read hiragana</span><input type="checkbox" name="kanaSkip" checked={settings.kanaSkip} onChange={(e) => setSettings({ kanaSkip: (e.target as HTMLInputElement).checked })} style="width:24px;height:24px" /></label>
          <p class="m" style="margin:6px 0 0">Vocabulary opens after you learn hiragana. Tick this only if you can already read it.</p>
        </>}

        <div class="section" style="margin-top:22px"><h2>Words</h2></div>
        <label class="field" style="margin-top:4px"><span>New words per day</span><select class="select" value={settings.newLimit} onChange={(e) => sel('newLimit', (e.target as HTMLSelectElement).value)}>{[3, 5, 10, 15, 20].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
        <label class="field"><span>Reading practice</span><select class="select" value={settings.readingMode} onChange={(e) => sel('readingMode', (e.target as HTMLSelectElement).value)}><option value="choice">Multiple choice</option><option value="kana">Type the reading in kana</option><option value="romaji">Beginner: type the reading in romaji</option></select></label>
        <p class="m" style="margin:6px 0 0">Romaji is only used for reading practice. Spelling practice always needs real Japanese.</p>

        <div class="section"><h2>This device</h2><p class="m" style="margin:0 0 10px">{profile.name}'s words and answers are stored only on this device. There is no backup yet: deleting the app or clearing Safari's website data removes them.</p>
          <button class="btn danger" style="width:100%" onClick={reset}>Delete {profile.name}'s data on this device</button></div>
        <p class="m" style="margin-top:16px">THE JAPANESE BOOK · version {APP_VERSION}</p>
        <p class="m" style="margin-top:4px;font-size:11px">Voices: Kokoro (Apache 2.0) for words; Open JTalk with the Mei voice, © Nagoya Institute of Technology (CC BY 3.0), for single kana.</p>
      </div>
    </div>
  );
}
