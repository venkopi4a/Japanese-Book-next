import { useApp } from '../app/state';
import { APP_VERSION } from '../data/repo';
import { speak, speechSupported } from '../app/speech';

export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const { settings, setSettings, repo, reload, toast } = useApp();
  const sel = <K extends keyof typeof settings>(k: K, v: string) => setSettings({ [k]: typeof settings[k] === 'number' ? Number(v) : v } as any);
  const reset = async () => {
    if (!window.confirm('Delete every word, answer and setting stored on this device? This cannot be undone.')) return;
    await repo.wipe();
    // Only this app's own keys: other sites on the same address keep theirs.
    const own = `jb:${import.meta.env.BASE_URL}:`;
    Object.keys(localStorage).filter((k) => k.startsWith(own)).forEach((k) => localStorage.removeItem(k));
    location.reload();
  };
  void reload; void toast;
  return (
    <div class="sheet-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="sheet" role="dialog" aria-modal="true" aria-label="Settings">
        <div style="display:flex;align-items:center"><h2 style="flex:1;font-size:22px">Settings</h2><button class="link" onClick={onClose}>Done</button></div>
        <label class="field"><span>Theme</span><select class="select" value={settings.theme} onChange={(e) => sel('theme', (e.target as HTMLSelectElement).value)}><option value="auto">Match my phone</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
        <label class="field"><span>New words per day</span><select class="select" value={settings.newLimit} onChange={(e) => sel('newLimit', (e.target as HTMLSelectElement).value)}>{[3, 5, 10, 15, 20].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
        <label class="field"><span>Reading practice</span><select class="select" value={settings.readingMode} onChange={(e) => sel('readingMode', (e.target as HTMLSelectElement).value)}><option value="choice">Multiple choice</option><option value="kana">Type the reading in kana</option><option value="romaji">Beginner: type the reading in romaji</option></select></label>
        <p class="m" style="margin:6px 0 0">Romaji is only used for reading practice. Spelling practice always needs real Japanese.</p>
        {speechSupported() && <>
          <label class="field"><span>Speaking speed</span><select class="select" value={settings.speechRate} onChange={(e) => sel('speechRate', (e.target as HTMLSelectElement).value)}><option value={0.7}>Slow</option><option value={0.9}>Normal</option><option value={1.1}>Fast</option></select></label>
          <label class="field" style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:16px"><span style="margin:0;color:var(--ink);font-size:16px">Play audio automatically</span><input type="checkbox" checked={settings.autoPlay} onChange={(e) => setSettings({ autoPlay: (e.target as HTMLInputElement).checked })} style="width:24px;height:24px" /></label>
          <button class="btn" style="width:100%;margin-top:12px" onClick={() => speak('こんにちは', settings.speechRate)}>Test the voice</button>
        </>}
        <div class="section"><h2>This device</h2><p class="m" style="margin:0 0 10px">Your words and answers are stored on this device. Accounts and sync arrive in a later version.</p>
          <button class="btn danger" style="width:100%" onClick={reset}>Delete all data on this device</button></div>
        <p class="m" style="margin-top:16px">THE JAPANESE BOOK · version {APP_VERSION}</p>
      </div>
    </div>
  );
}
