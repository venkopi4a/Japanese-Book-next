import { toHiragana } from '../domain/kana';

/**
 * The key a recording is stored under: the spoken text in hiragana, without spaces or end punctuation.
 * Katakana is folded to hiragana because ア and あ sound the same, so one recording serves both scripts.
 * Long-vowel marks are kept (ケーキ → けーき), so the sound is still exact.
 */
export function audioKey(text: string): string {
  return toHiragana(text.normalize('NFKC')).replace(/[\s。、！？!?.,]+/g, '');
}
