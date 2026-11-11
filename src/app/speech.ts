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

export const japaneseVoices = (): SpeechSynthesisVoice[] => (speechSupported() ? rankVoices(speechSynthesis.getVoices()) : []);

/** Voices often load a moment after the page; this calls back when the list changes. */
export function onVoicesChanged(cb: () => void): () => void {
  if (!speechSupported()) return () => {};
  speechSynthesis.addEventListener('voiceschanged', cb);
  return () => speechSynthesis.removeEventListener('voiceschanged', cb);
}

let preferred = '';
export const setPreferredVoice = (uri: string) => { preferred = uri; };

export function speak(text: string, rate = 0.9, voiceURI = preferred) {
  if (!speechSupported() || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ja-JP';
  u.rate = rate;
  const v = chooseVoice(speechSynthesis.getVoices(), voiceURI);
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}
