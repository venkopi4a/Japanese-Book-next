import recordings from '../data/audio.json';
import { audioKey } from './audioKey';

const RECORDINGS = recordings as Record<string, string>;
/** The URL of the app's own recording of this text, or null when there is none (then the phone voice is used). */
export function recordingUrl(text: string): string | null {
  const file = RECORDINGS[audioKey(text)];
  return file ? `${import.meta.env.BASE_URL}audio/${file}` : null;
}

let player: HTMLAudioElement | null = null;
const getPlayer = () => (player ??= typeof Audio !== 'undefined' ? new Audio() : null);
let unlocked = false;
/**
 * iPhones only let a page play sound that starts from a tap. The first tap anywhere plays a silent sound on the
 * shared player (and an empty utterance), after which the app may play recordings by itself, e.g. after an answer.
 */
export function unlockAudio() {
  if (unlocked) return;
  unlocked = true;
  const p = getPlayer();
  if (p) {
    p.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';
    p.play().then(() => p.pause()).catch(() => { unlocked = false; });
  }
  if (speechSupported()) { try { speechSynthesis.speak(new SpeechSynthesisUtterance('')); } catch { /* not allowed yet */ } }
}

let mode: 'recorded' | 'device' = 'recorded';
export const setVoiceMode = (m: 'recorded' | 'device') => { mode = m; };

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

/** The chosen voice if this device still has it, otherwise the most natural Japanese voice. */
export function chooseVoice<T extends VoiceLike>(all: T[], preferred: string): T | undefined {
  const ranked = rankVoices(all);
  return ranked.find((v) => v.voiceURI === preferred) ?? ranked[0];
}

/** The last non-empty voice list seen: iPhones sometimes return an empty list at the very moment the app speaks. */
let cache: SpeechSynthesisVoice[] = [];
const allVoices = (): SpeechSynthesisVoice[] => {
  if (!speechSupported()) return [];
  const now = speechSynthesis.getVoices();
  if (now.length) cache = now;
  return now.length ? now : cache;
};
export const japaneseVoices = (): SpeechSynthesisVoice[] => rankVoices(allVoices());

/**
 * Waits for the voice list. iPhones often return an empty or partial list at first and do not always send
 * "voiceschanged", so the list is checked again every 250 ms until it stops growing (or 4 seconds pass).
 */
export function loadVoices(getAll: () => VoiceLike[] = allVoices, timeoutMs = 4000, everyMs = 250): Promise<VoiceLike[]> {
  return new Promise((resolve) => {
    let last = -1, stable = 0, waited = 0;
    const tick = () => {
      const all = getAll();
      stable = all.length === last && all.length > 0 ? stable + 1 : 0;
      last = all.length;
      if (stable >= 3 || waited >= timeoutMs) { resolve(rankVoices(all)); return; }
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

let preferred = '';
export const setPreferredVoice = (uri: string) => { preferred = uri; };

/** Speaks Japanese: the app's natural recording when it has one, otherwise the phone's voice. */
export function speak(text: string, rate = 0.9, voiceURI = preferred) {
  if (!text) return;
  const url = mode === 'recorded' ? recordingUrl(text) : null;
  const p = getPlayer();
  if (url && p) {
    if (speechSupported()) speechSynthesis.cancel();
    p.pause();
    p.src = url;
    p.playbackRate = rate / 0.9; // the speed setting: 0.9 is normal
    p.play().catch(() => speakWithPhone(text, rate, voiceURI)); // if the phone refuses, still say something
    return;
  }
  speakWithPhone(text, rate, voiceURI);
}

/** Always the phone's own voice (used for words the app has no recording of). */
export function speakWithPhone(text: string, rate = 0.9, voiceURI = preferred) {
  if (!speechSupported() || !text) return;
  player?.pause();
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = rate;
  const v = chooseVoice(allVoices(), voiceURI);
  // iOS can ignore the chosen voice unless the language matches that voice exactly (ja-JP vs ja_JP)
  u.lang = v?.lang ?? 'ja-JP';
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}
