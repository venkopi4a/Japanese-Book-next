const HIRA_FIRST = 0x3041, HIRA_LAST = 0x3096, KATA_FIRST = 0x30a1, KATA_LAST = 0x30f6, SHIFT = 0x60;

export const isHiragana = (c: string) => { const n = c.codePointAt(0)!; return n >= HIRA_FIRST && n <= HIRA_LAST; };
export const isKatakana = (c: string) => { const n = c.codePointAt(0)!; return (n >= KATA_FIRST && n <= KATA_LAST) || c === 'ー'; };
export const isKana = (c: string) => isHiragana(c) || isKatakana(c);
export const hasKanji = (s: string) => /[\u3400-\u4dbf\u4e00-\u9fff\u3005]/.test(s);
export const isKanaOnly = (s: string) => s.length > 0 && Array.from(s).every(isKana);

export function toHiragana(s: string): string {
  return Array.from(s).map((c) => {
    const n = c.codePointAt(0)!;
    return n >= KATA_FIRST && n <= KATA_LAST ? String.fromCodePoint(n - SHIFT) : c;
  }).join('');
}

export function toKatakana(s: string): string {
  return Array.from(s).map((c) => {
    const n = c.codePointAt(0)!;
    return n >= HIRA_FIRST && n <= HIRA_LAST ? String.fromCodePoint(n + SHIFT) : c;
  }).join('');
}

/**
 * Normalises a typed answer for comparison.
 * NFKC composes separate dakuten and handakuten marks into single characters and converts
 * half-width katakana. It never removes a dakuten or handakuten, so か and が stay different.
 */
export function normaliseAnswer(s: string): string {
  return s.normalize('NFKC').replace(/[\s\u200b-\u200d\ufeff]+/g, '').replace(/[。、．，.,!?！？]+$/u, '');
}

/** The kana without its dakuten or handakuten, folded to hiragana. */
export function kanaBase(c: string): string {
  return toHiragana(c.normalize('NFD').replace(/[\u3099\u309a]/g, '').normalize('NFC'));
}
export const hasDakuten = (c: string) => c.normalize('NFD').includes('\u3099');
export const hasHandakuten = (c: string) => c.normalize('NFD').includes('\u309a');
