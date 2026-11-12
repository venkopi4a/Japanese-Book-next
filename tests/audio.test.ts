import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import recordings from '../src/data/audio.json';
import library from '../src/data/library.json';
import { audioKey } from '../src/app/audioKey';
import { recordingUrl } from '../src/app/speech';
import { KANA } from '../src/domain/kanaCourse';
import { KANA_EXAMPLES } from '../src/domain/kanaExamples';

const files = recordings as Record<string, string>;

describe('recorded voice', () => {
  it('one recording serves both scripts: katakana and hiragana share a key; long vowels are kept', () => {
    expect(audioKey('カ')).toBe(audioKey('か'));
    expect(audioKey('ケーキ')).toBe('けーき');
    expect(audioKey(' ねこ。')).toBe('ねこ');
  });
  it('every kana, every example word and every starter word has a recording', () => {
    const missing = [
      ...KANA.map((k) => k.char),
      ...Object.values(KANA_EXAMPLES).map(([w]) => w),
      ...(library as { reading: string }[]).map((w) => w.reading),
      'こんにちは',
    ].filter((t) => !files[audioKey(t)]);
    expect(missing).toEqual([]);
  });
  it('every recording file in the list exists', () => {
    const gone = Object.values(files).filter((f) => !existsSync(`public/audio/${f}`));
    expect(gone).toEqual([]);
  });
  it('recordingUrl points into the published audio folder, and is null for words without a recording', () => {
    expect(recordingUrl('ア')).toMatch(/audio\/[0-9a-f]{10}\.m4a$/);
    expect(recordingUrl('ざっし')).toBe(recordingUrl('ザッシ'));
    expect(recordingUrl('ぜんぜんしらないことば')).toBeNull();
  });
});
