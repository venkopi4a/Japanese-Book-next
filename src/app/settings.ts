export interface Settings {
  theme: 'auto' | 'light' | 'dark';
  newLimit: number;
  readingMode: 'choice' | 'kana' | 'romaji';
  speechRate: number;
  autoPlay: boolean;
}
export const DEFAULTS: Settings = { theme: 'auto', newLimit: 10, readingMode: 'choice', speechRate: 0.9, autoPlay: true };

const key = () => `jb:${import.meta.env.BASE_URL}:settings`;
export function loadSettings(): Settings {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(key()) ?? '{}') }; } catch { return DEFAULTS; }
}
export function saveSettings(s: Settings) {
  try { localStorage.setItem(key(), JSON.stringify(s)); } catch { /* private mode: settings last for this visit only */ }
}
export function applyTheme(t: Settings['theme']) {
  if (t === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}
