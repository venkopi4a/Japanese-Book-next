import { createContext } from 'preact';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { dbName, openUserDb } from '../data/db';
import { LIBRARY } from '../data/library';
import { Repo } from '../data/repo';
import { scriptDone } from '../domain/kanaPlan';
import type { Attempt, SkillState, Word } from '../domain/types';
import type { Profile } from './profiles';
import { DEFAULTS, applyTheme, loadSettings, saveSettings, type Settings } from './settings';
import { loadVoices, setPreferredVoice, setVoiceMode } from './speech';

interface ToastMsg { text: string; action?: { label: string; run: () => void } }
interface Ctx {
  repo: Repo; words: Word[]; states: SkillState[]; attempts: Attempt[];
  settings: Settings; setSettings: (p: Partial<Settings>) => void;
  reload: () => Promise<void>; toast: (text: string, action?: ToastMsg['action']) => void;
  profile: Profile; switchProfile: () => void;
  /** Vocabulary waits until hiragana is learned, unless this person said they already read it. */
  vocabLocked: boolean;
  hiraganaDone: boolean;
  /** Until katakana is learned, katakana words show romaji help. */
  katakanaDone: boolean;
}
const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => useContext(AppCtx)!;

export function AppProvider({ profile, onSwitch, children }: { profile: Profile; onSwitch: () => void; children: ComponentChildren }) {
  const [ctx, setCtx] = useState<Pick<Ctx, 'repo' | 'words' | 'states' | 'attempts' | 'reload'> | null>(null);
  const [settings, setS] = useState<Settings>(DEFAULTS);
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const timer = useRef<number>(0);

  useEffect(() => {
    const s = loadSettings(profile.id);
    setS(s); applyTheme(s.theme); setPreferredVoice(s.voiceURI, s.voiceName); setVoiceMode(s.voiceMode);
    void loadVoices(); // warm up the voice list so the first word already uses the chosen voice
    (async () => {
      const repo = new Repo(await openUserDb(dbName(import.meta.env.BASE_URL, profile.id)));
      await repo.seedLibrary(LIBRARY);
      const reload = async () => {
        const [words, states, attempts] = await Promise.all([repo.listWords(), repo.getStates(), repo.attemptsSince(0)]);
        setCtx({ repo, words, states, attempts, reload });
      };
      await reload();
    })();
  }, [profile.id]);

  const setSettings = useCallback((p: Partial<Settings>) => {
    setS((cur) => {
      const next = { ...cur, ...p };
      saveSettings(next, profile.id);
      if (p.theme) applyTheme(next.theme);
      if (p.voiceURI !== undefined || p.voiceName !== undefined) setPreferredVoice(next.voiceURI, next.voiceName);
      if (p.voiceMode !== undefined) setVoiceMode(next.voiceMode);
      return next;
    });
  }, [profile.id]);
  const toast = useCallback((text: string, action?: ToastMsg['action']) => {
    setMsg({ text, action });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(null), action ? 6000 : 2600);
  }, []);

  const value = useMemo(() => {
    if (!ctx) return null;
    const hiraganaDone = scriptDone(ctx.states, 'hiragana');
    return { ...ctx, settings, setSettings, toast, profile, switchProfile: onSwitch, hiraganaDone, vocabLocked: !hiraganaDone && !settings.kanaSkip, katakanaDone: scriptDone(ctx.states, 'katakana') };
  }, [ctx, settings, setSettings, toast, profile, onSwitch]);
  if (!value) return <div class="shell"><div class="empty"><span class="j">単語帳</span>Opening {profile.name}'s notebook</div></div>;
  return (
    <AppCtx.Provider value={value}>
      {children}
      {msg && <div class="toast" role="status">{msg.text}{msg.action && <button onClick={() => { msg.action!.run(); setMsg(null); }}>{msg.action.label}</button>}</div>}
    </AppCtx.Provider>
  );
}
