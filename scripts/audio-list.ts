/**
 * Prints everything the app has a recording for, as JSON: one entry per sound.
 * Used by scripts/make-audio.py (run by Claude, not part of the app build).
 *   npx vitest run --root . scripts/audio-list.test.ts   (or: node --experimental-strip-types scripts/audio-list.ts)
 */
import library from '../src/data/library.json' with { type: 'json' };
import { KANA } from '../src/domain/kanaCourse';
import { KANA_EXAMPLES } from '../src/domain/kanaExamples';
import { audioKey } from '../src/app/audioKey';

/** text: the written form (kanji helps the voice with particles and rhythm); reading: what must be heard. */
export interface AudioItem { key: string; kind: 'kana' | 'word'; text: string; reading: string }

export function audioItems(): AudioItem[] {
  const out = new Map<string, AudioItem>();
  const add = (kind: AudioItem['kind'], text: string, reading: string) => {
    const key = audioKey(reading);
    if (!out.has(key)) out.set(key, { key, kind, text, reading });
  };
  for (const k of KANA) if (k.script === 'hiragana') add('kana', k.char, k.char); // katakana sound the same
  for (const [word] of Object.values(KANA_EXAMPLES)) add('word', word, word);
  for (const w of library as { text: string; reading: string }[]) add('word', w.text, w.reading);
  add('word', 'こんにちは', 'こんにちは'); // the "Try it" button in Settings
  return [...out.values()];
}

console.log(JSON.stringify(audioItems()));
