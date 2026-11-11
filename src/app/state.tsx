import { createContext } from 'preact';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { dbName, openUserDb } from '../data/db';
import { LIBRARY } from '../data/library';
import { Repo } from '../data/repo';
import type { Attempt, SkillState, Word } from '../domain/types';
import { DEFAULTS, applyTheme, loadSettings, saveSettings, type Settings } from './settings';

interface ToastMsg { text: string; action?: { label: string; run: () => void } }
interface Ctx {
  repo: Repo; words: Word[]; states: SkillState[]; attempts: Attempt[];
  settings: Settings; setSettings: (p: Partial<Settings>) => void;
  reload: () => Promise<void>; toast: (text: string, action?: ToastMsg['action']) => void;
}
const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => useContext(AppCtx)!;

export function AppProvider({ children }: { children: ComponentChildren }) {
  const [ctx, setCtx] = useState<Omit<Ctx, 'settings' | 'setSettings' | 'toast'> | null>(null);
  const [settings, setS] = useState<Settings>(DEFAULTS);
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const timer = useRef<number>(0);

  useEffect(() => {
    const s = loadSettings();
    setS(s); applyTheme(s.theme);
    (async () => {
      const repo = new Repo(await openUserDb(dbName(import.meta.env.BASE_URL, 'local')));
      await repo.seedLibrary(LIBRARY);
      const reload = async () => {
        const [words, states, attempts] = await Promise.all([repo.listWords(), repo.getStates(), repo.attemptsSince(0)]);
        setCtx({ repo, words, states, attempts, reload });
      };
      await reload();
    })();
  }, []);

  const setSettings = useCallback((p: Partial<Settings>) => {
    setS((cur) => { const next = { ...cur, ...p }; saveSettings(next); if (p.theme) applyTheme(next.theme); return next; });
  }, []);
  const toast = useCallback((text: string, action?: ToastMsg['action']) => {
    setMsg({ text, action });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(null), action ? 6000 : 2600);
  }, []);

  const value = useMemo(() => (ctx ? { ...ctx, settings, setSettings, toast } : null), [ctx, settings, setSettings, toast]);
  if (!value) return <div class="shell"><div class="empty"><span class="j">単語帳</span>Opening your notebook</div></div>;
  return (
    <AppCtx.Provider value={value}>
      {children}
      {msg && <div class="toast" role="status">{msg.text}{msg.action && <button onClick={() => { msg.action!.run(); setMsg(null); }}>{msg.action.label}</button>}</div>}
    </AppCtx.Provider>
  );
}
