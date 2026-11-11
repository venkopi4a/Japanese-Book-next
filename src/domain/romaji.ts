import { toKana, toRomaji } from 'wanakana';
import { nearDiff } from './answer';
import type { CheckResult } from './answer';
import { toHiragana } from './kana';

/**
 * Beginner romaji mode. This is only ever used for the reading skill, never for spelling practice.
 * The typed romaji is converted to kana and compared as kana, so shi/si, tsu/tu, nn and long vowels all work.
 */
const MACRONS: Record<string, string[]> = { ā: ['aa'], ī: ['ii'], ū: ['uu'], ē: ['ee'], ō: ['oo', 'ou'] };

function candidates(input: string): string[] {
  let outs = [input.normalize('NFKC').toLowerCase().trim()];
  for (const [mac, reps] of Object.entries(MACRONS)) {
    outs = outs.flatMap((s) => (s.includes(mac) ? reps.map((r) => s.split(mac).join(r)) : [s]));
  }
  return outs.map((s) => toHiragana(toKana(s)));
}

/** A reading with its long-vowel marks spelled out: ニュース can be typed as nyuusu. */
function expectedVariants(reading: string): string[] {
  const hira = toHiragana(reading);
  if (!hira.includes('ー')) return [hira];
  const VOWEL: Record<string, string[]> = { a: ['あ'], i: ['い'], u: ['う'], e: ['え'], o: ['う', 'お'] };
  let outs = [''];
  const chars = Array.from(hira);
  chars.forEach((c, i) => {
    if (c !== 'ー' || i === 0) { outs = outs.map((o) => o + c); return; }
    const v = toRomaji(chars[i - 1]!).slice(-1);
    const reps = VOWEL[v] ?? ['ー'];
    outs = outs.flatMap((o) => reps.map((r) => o + r));
  });
  return [hira, ...outs];
}

export function checkRomaji(reading: string, typed: string): CheckResult & { kana: string } {
  const cands = candidates(typed);
  const exp = expectedVariants(reading);
  const kana = cands[0] ?? '';
  if (typed.trim() && cands.some((c) => exp.includes(c))) return { correct: true, matchedForm: reading, variant: false, closest: reading, mistakes: [], kana };
  const target = exp[0]!;
  return { correct: false, matchedForm: null, variant: false, closest: reading, mistakes: kana ? nearDiff(target, kana) : [], kana };
}

/** Live preview of what the typed romaji becomes. */
export const previewKana = (typed: string) => candidates(typed)[0] ?? '';
