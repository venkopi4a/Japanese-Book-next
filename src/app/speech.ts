export const speechSupported = () => typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined';

export interface VoiceLike { name: string; lang: string; voiceURI: string; localService?: boolean }

const isJapanese = (v: VoiceLike) => v.lang.replace('_', '-').toLowerCase().startsWith('ja');

/** Higher is more natural: Premium and Enhanced voices (free downloads on iPhone) beat the compact default. */
export function voiceQuality(v: VoiceLike): number {
  const s = `${v.name} ${v.voiceURI}`.toLowerCase();
  if (s.includes('premium')) return 3;
  if (s.includes('enhanced') || s.includes('natural') || s.includes('neural')) return 2;
  if (s.includes('google')) return 2;
  if (s.includes('compact')) return 0;
  return 1;
}

/** The Japanese voices this device offers, most natural first. */
export function rankVoices<T extends VoiceLike>(all: T[]): T[] {
  return all.filter(isJapanese).sort((a, b) => voiceQuality(b) - voiceQuality(a) || a.name.localeCompare(b.name));
}

/** "O-Ren (Enhanced)" → "o-ren": the same voice in any quality. */
const baseName = (name: string) => name.toLowerCase().replace(/\s*\((enhanced|premium|compact|拡張|高品質)\)\s*/g, '').trim();

/**
 * The chosen voice, found even if iOS reports it differently after a restart:
 * by its id, else by its exact name, else the best quality of a voice with the same name.
 * Without a match: the most natural Japanese voice available.
 */
export function chooseVoice<T extends VoiceLike>(all: T[], uri: string, name = ''): T | undefined {
  const ranked = rankVoices(all);
  if (uri || name) {
    const hit = ranked.find((v) => uri && v.voiceURI === uri)
      ?? ranked.find((v) => name && v.name === name)
      ?? ranked.find((v) => name && baseName(v.name) === baseName(name));
    if (hit) return hit;
  }
  return ranked[0];
}

/** Whether the chosen voice is in this list (otherwise iOS has not handed it over yet). */
export const hasVoice = (all: VoiceLike[], uri: string, name = '') =>
  !!rankVoices(all).find((v) => (uri && v.voiceURI === uri) || (name && (v.name === name || baseName(v.name) === baseName(name))));

/**
 * Every voice seen during this visit. After a restart iPhones often return the basic voices first and the Enhanced
 * ones seconds later, and sometimes a shorter list in between; remembering what was seen keeps the choice usable.
 */
const seen = new Map<string, SpeechSynthesisVoice>();
const allVoices = (): SpeechSynthesisVoice[] => {
  if (!speechSupported()) return [];
  for (const v of speechSynthesis.getVoices()) seen.set(v.voiceURI || v.name, v);
  return [...seen.values()];
};
export const japaneseVoices = (): SpeechSynthesisVoice[] => rankVoices(allVoices());

/**
 * Keeps asking the phone for its voices for `timeoutMs` (10 s), because Enhanced voices can arrive late,
 * and reports every time the list grows. It does not stop early when the list looks stable.
 */
export function loadVoices(getAll: () => VoiceLike[] = allVoices, onUpdate?: (v: VoiceLike[]) => void, timeoutMs = 10000, everyMs = 300): Promise<VoiceLike[]> {
  return new Promise((resolve) => {
    let last = -1, waited = 0;
    const tick = () => {
      const all = rankVoices(getAll());
      if (all.length !== last) { last = all.length; onUpdate?.(all); }
      if (waited >= timeoutMs) { resolve(all); return; }
      waited += everyMs; setTimeout(tick, everyMs);
    };
    tick();
  });
}

/** Voices often load a moment after the page; this calls back when the list changes. */
export function onVoicesChanged(cb: () => void): () => void {
  if (!speechSupported()) return () => {};
  speechSynthesis.addEventListener('voiceschanged', cb);
  return () => speechSynthesis.removeEventListener('voiceschanged', cb);
}

let preferred = { uri: '', name: '' };
export const setPreferredVoice = (uri: string, name = '') => { preferred = { uri, name }; };

let unlocked = false;
/** iPhones only allow speech that starts from a tap: the first tap speaks an empty sentence, which unlocks it. */
export function unlockAudio() {
  if (unlocked || !speechSupported()) return;
  unlocked = true;
  try { speechSynthesis.speak(new SpeechSynthesisUtterance('')); allVoices(); } catch { unlocked = false; }
}

export function speak(text: string, rate = 0.9, uri = preferred.uri, name = preferred.name) {
  if (!speechSupported() || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = rate;
  const v = chooseVoice(allVoices(), uri, name);
  // iOS can ignore the chosen voice unless the language matches that voice exactly (ja-JP vs ja_JP)
  u.lang = v?.lang ?? 'ja-JP';
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}
