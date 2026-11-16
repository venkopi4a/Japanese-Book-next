import { describe, expect, it } from 'vitest';
import strokes from '../src/data/strokes.json';
import { KANA } from '../src/domain/kanaCourse';
import { HIRAGANA_ORIGIN } from '../src/domain/kanaOrigins';
import { romajiOf } from '../src/app/exercise';

const data = strokes as unknown as Record<string, { p: string[]; n: number[][] }>;

describe('stroke order data', () => {
  it('has strokes for every single kana in the course, with a number for each stroke', () => {
    for (const k of KANA.filter((x) => x.stage !== 'combo')) {
      const s = data[k.char];
      expect(s, k.char).toBeTruthy();
      expect(s!.p.length, k.char).toBeGreaterThan(0);
      expect(s!.n.length, k.char).toBe(s!.p.length);
    }
  });
  it('has the small ゃゅょ and ャュョ used in combinations', () => {
    for (const c of 'ゃゅょャュョ') expect(data[c], c).toBeTruthy();
  });
  it('has plausible stroke counts for well-known kana', () => {
    expect(data['い']!.p.length).toBe(2);
    expect(data['あ']!.p.length).toBe(3);
    expect(data['し']!.p.length).toBe(1);
    expect(data['が']!.p.length).toBe(data['か']!.p.length + 2);
    expect(data['ぱ']!.p.length).toBe(data['は']!.p.length + 1);
  });
});

describe('hiragana origins', () => {
  const basic = KANA.filter((k) => k.script === 'hiragana' && k.stage === 'basic');
  it('explains every one of the 46 basic hiragana', () => {
    expect(basic).toHaveLength(46);
    for (const k of basic) {
      const o = HIRAGANA_ORIGIN[k.char];
      expect(o, k.char).toBeTruthy();
      expect(o![0]).toMatch(/^[一-鿿]$/);
      expect(o![2].length).toBeGreaterThan(20);
    }
  });
  it('has no entries for characters that are not basic hiragana', () => {
    const ok = new Set(basic.map((k) => k.char));
    for (const c of Object.keys(HIRAGANA_ORIGIN)) expect(ok.has(c), c).toBe(true);
  });
});

describe('romaji shown in the Notebook', () => {
  it('spells words from their reading', () => {
    expect(romajiOf('がくせい')).toBe('gakusei');
    expect(romajiOf('ざっし')).toBe('zasshi');
    expect(romajiOf('ゆうびん')).toBe('yuubin');
    expect(romajiOf('しゃしん')).toBe('shashin');
  });
});
