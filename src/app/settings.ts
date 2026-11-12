import { settingsKey } from './profiles';

export interface Settings {
  theme: 'auto' | 'light' | 'dark';
  newLimit: number;
  readingMode: 'choice' | 'kana' | 'romaji';
  speechRate: number;
  autoPlay: boolean;
  /** The chosen Japanese voice ('' = the best one this device has). */
  voiceURI: string;
  /** 'recorded': the app's own natural recordings (kana and built-in words), phone voice for everything else. 'device': always the phone voice. */
  voiceMode: 'recorded' | 'device';
  /** New kana per day in the kana course. */
  kanaLimit: number;
  /** true: this person already reads hiragana, so vocabulary is open without finishing the kana course. */
  kanaSkip: boolean;
}
export const DEFAULTS: Settings = { theme: 'auto', newLimit: 10, readingMode: 'choice', speechRate: 0.9, autoPlay: true, voiceURI: '', voiceMode: 'recorded', kanaLimit: 15, kanaSkip: false };

export function loadSettings(profileId = 'local'): Settings {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(settingsKey(profileId)) ?? '{}') }; } catch { return DEFAULTS; }
}
export function saveSettings(s: Settings, profileId = 'local') {
  try { localStorage.setItem(settingsKey(profileId), JSON.stringify(s)); } catch { /* private mode: settings last for this visit only */ }
}
export function applyTheme(t: Settings['theme']) {
  if (t === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}
