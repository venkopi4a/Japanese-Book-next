export const speechSupported = () => typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined';

export function speak(text: string, rate = 0.9) {
  if (!speechSupported() || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ja-JP';
  u.rate = rate;
  const v = speechSynthesis.getVoices().find((x) => x.lang.replace('_', '-').toLowerCase().startsWith('ja'));
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}
