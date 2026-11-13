import { useEffect, useState } from 'preact/hooks';
import { useApp } from '../app/state';
import { APP_VERSION } from '../data/repo';
import { dbName } from '../data/db';
import { loadProfiles, removeProfile } from '../app/profiles';
import { chooseVoice, hasVoice, isRobotic, japaneseVoices, loadVoices, onVoicesChanged, speak, speakWithPhone, speechSupported, voiceQuality, type VoiceLike } from '../app/speech';

export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const { settings, setSettings, repo, profile, switchProfile, hiraganaDone } = useApp();
  const [voices, setVoices] = useState<VoiceLike[]>(japaneseVoices);
  const [loading, setLoading] = useState(true);
  const [voiceHelp, setVoiceHelp] = useState(false);
  // iPhones hand over Enhanced voices late and do not always announce it, so keep looking for 10 seconds
  const refresh = () => { setLoading(true); void loadVoices(undefined, (v) => setVoices(v)).then((v) => { setVoices(v); setLoading(false); }); };
  useEffect(() => { refresh(); return onVoicesChanged(() => setVoices(japaneseVoices())); }, []);
  const present = hasVoice(voices, settings.voiceURI, settings.voiceName);
  const using = chooseVoice(voices, settings.voiceURI, settings.voiceName);
  // save the name too: iPhone sometimes reports a different id after a restart, the name stays the same
  const pick = (uri: string) => setSettings({ voiceURI: uri, voiceName: voices.find((v) => v.voiceURI === uri)?.name ?? '' });
  const sel = <K extends keyof typeof settings>(k: K, v: string) => setSettings({ [k]: typeof settings[k] === 'number' ? Number(v) : v } as any);
  const others = loadProfiles().length > 1;

  const reset = async () => {
    if (!window.confirm(`Delete every word, answer and setting ${profile.name} has on this device? This cannot be undone.`)) return;
    await repo.wipe();
    removeProfile(profile.id);
    const req = indexedDB.deleteDatabase(dbName(import.meta.env.BASE_URL, profile.id));
    req.onsuccess = req.onerror = req.onblocked = () => location.reload();
  };
  const label = (v: VoiceLike) => `${v.name}${isRobotic(v) ? ' (robotic)' : voiceQuality(v) >= 2 && !/enhanced|premium/i.test(v.name) ? ' (natural)' : ''}`;

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
        <p class="m voice-info">{settings.voiceMode === 'recorded'
          ? 'Natural Japanese recordings built into the app: every kana and all built-in words. Same on every phone, works offline. Words you add yourself use the phone voice below.'
          : 'Everything is spoken by the phone voice below. iPhone does not give web apps its Enhanced voices (like O-ren Enhanced), so this is usually Kyoko.'}</p>
        <button class="btn" style="width:100%;margin-top:10px" onClick={() => speak('こんにちは', settings.speechRate)}>Try it</button>
        {speechSupported() && <>
          <label class="field" style="margin-top:16px"><span>Phone voice{settings.voiceMode === 'recorded' ? ' (for words you add)' : ''}</span>
            <select class="select" name="voice" value={settings.voiceURI} onChange={(e) => pick((e.target as HTMLSelectElement).value)}>
              <option value="">Best available{voices[0] ? ` (${voices[0].name})` : ''}</option>
              {voices.map((v) => <option key={v.voiceURI || v.name} value={v.voiceURI}>{label(v)}</option>)}
              {/* keep showing the saved choice while iOS has not handed it over yet, instead of jumping to "Best available" */}
              {settings.voiceURI && !present && <option value={settings.voiceURI}>{settings.voiceName || 'Your voice'} (waiting for iPhone)</option>}
            </select></label>
          <div class="voice-info m" role="status">
            {loading && voices.length === 0 ? 'Looking for voices on this phone…'
              : voices.length === 0 ? 'This phone is not sharing any Japanese voice with the app yet.'
              : <>This phone shares {voices.length} Japanese {voices.length === 1 ? 'voice' : 'voices'} with the app: {voices.map((v) => v.name).join(', ')}.{loading && ' Still looking…'}</>}
            {settings.voiceURI && !present && !loading && <div style="color:var(--warn);margin-top:4px">Your voice ({settings.voiceName || 'saved choice'}) is saved, but iPhone is not offering it right now, so {using?.name ?? 'the default voice'} speaks. It is used again as soon as iPhone offers it. Tap Refresh list in a moment.</div>}
          </div>
          <div style="display:flex;gap:10px;margin-top:10px">
            <button class="btn" style="flex:2" onClick={() => speakWithPhone('こんにちは。日本語を勉強しましょう。', settings.speechRate)}>Try phone voice</button>
            <button class="btn" style="flex:1" disabled={loading} onClick={refresh}>Refresh list</button>
          </div>
          <label class="field"><span>Speaking speed</span><select class="select" value={settings.speechRate} onChange={(e) => sel('speechRate', (e.target as HTMLSelectElement).value)}><option value={0.7}>Slow</option><option value={0.9}>Normal</option><option value={1.1}>Fast</option></select></label>
          <label class="field" style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:16px"><span style="margin:0;color:var(--ink);font-size:16px">Play audio automatically</span><input type="checkbox" checked={settings.autoPlay} onChange={(e) => setSettings({ autoPlay: (e.target as HTMLInputElement).checked })} style="width:24px;height:24px" /></label>
          <button class="link" style="margin-top:8px" onClick={() => setVoiceHelp(!voiceHelp)}>{voiceHelp ? 'Hide' : 'Why is O-ren (Enhanced) not in the list?'}</button>
          {voiceHelp && (
            <div class="card" style="margin-top:8px;font-size:15px">
              iPhone only gives web apps (like this one) its basic voices: Kyoko plus the Eloquence voices (Eddy, Flo, Grandma …), which are the most robotic. Enhanced and Premium voices such as O-ren (Enhanced) stay inside Apple's own apps, even when they are downloaded. That is Apple's rule and no web app can change it. That is why the app has its own natural voice above.
            </div>
          )}
        </>}

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
