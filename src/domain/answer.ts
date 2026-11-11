import { hasHandakuten, kanaBase, normaliseAnswer, toHiragana } from './kana';
import type { MistakeDetail } from './types';

export interface CheckOptions {
  /** true (default): hiragana and katakana are different spellings. false: script is ignored. */
  scriptSensitive?: boolean;
}

export interface CheckResult {
  correct: boolean;
  /** The accepted form that matched, as supplied. */
  matchedForm: string | null;
  /** True when correct but not the primary form. */
  variant: boolean;
  /** The accepted form nearest to the answer, used to explain a mistake. */
  closest: string | null;
  mistakes: MistakeDetail[];
}

const SMALL_PAIRS = ['ぁあ', 'ぃい', 'ぅう', 'ぇえ', 'ぉお', 'っつ', 'ゃや', 'ゅゆ', 'ょよ', 'ゎわ'];
const CONFUSABLE_GROUPS = [
  ['さ', 'ち'], ['き', 'さ'], ['シ', 'ツ'], ['ソ', 'ン'], ['ク', 'ケ'], ['ク', 'タ'], ['ワ', 'ウ'],
  ['め', 'ぬ'], ['ぬ', 'ね', 'れ', 'わ'], ['る', 'ろ'], ['は', 'ほ'], ['ま', 'も'], ['い', 'り'], ['あ', 'お'],
];
const ROW_O = 'おこそとのほもよろをごぞどぼぽょ';
const ROW_E = 'えけせてねへめれげぜでべぺ';

export function areConfusable(a: string, b: string): boolean {
  return CONFUSABLE_GROUPS.some((g) => g.includes(a) && g.includes(b) && a !== b);
}

function classify(e: string, g: string, prev: string | undefined): MistakeDetail['kind'] {
  if (toHiragana(e) === toHiragana(g)) return 'script';
  if (kanaBase(e) === kanaBase(g)) return hasHandakuten(e) || hasHandakuten(g) ? 'handakuten' : 'dakuten';
  const he = toHiragana(e), hg = toHiragana(g);
  if (SMALL_PAIRS.some((p) => p.includes(he) && p.includes(hg))) return 'small-kana';
  if (e === 'ー' || g === 'ー') return 'long-vowel';
  if (prev) {
    const p = toHiragana(prev);
    if ((he === 'う' && hg === 'お') || (he === 'お' && hg === 'う')) { if (ROW_O.includes(p)) return 'long-vowel'; }
    if ((he === 'い' && hg === 'え') || (he === 'え' && hg === 'い')) { if (ROW_E.includes(p)) return 'long-vowel'; }
  }
  return areConfusable(e, g) ? 'confusable' : 'substitution';
}

/** Aligns two strings character by character and describes each difference. */
export function diffAnswer(expected: string, got: string): MistakeDetail[] {
  const a = Array.from(expected), b = Array.from(got);
  const n = a.length, m = b.length;
  const d: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 0; i <= n; i++) d[i]![0] = i;
  for (let j = 0; j <= m; j++) d[0]![j] = j;
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  const out: MistakeDetail[] = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i]![j] === d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1)) {
      if (a[i - 1] !== b[j - 1]) out.push({ kind: classify(a[i - 1]!, b[j - 1]!, a[i - 2]), expected: a[i - 1]!, got: b[j - 1]!, index: i - 1 });
      i--; j--;
    } else if (i > 0 && d[i]![j] === d[i - 1]![j]! + 1) {
      out.push({ kind: 'missing', expected: a[i - 1]!, got: null, index: i - 1 }); i--;
    } else {
      out.push({ kind: 'extra', expected: null, got: b[j - 1]!, index: i }); j--;
    }
  }
  return out.reverse();
}

/**
 * Per-character diagnosis only makes sense for a near miss. A wild guess says nothing about
 * which characters you mix up, so it is not diagnosed (and never feeds the confusion statistics).
 */
export function nearDiff(expected: string, got: string): MistakeDetail[] {
  const diffs = diffAnswer(expected, got);
  return diffs.length * 2 <= Math.max(2, Array.from(expected).length) ? diffs : [];
}

function distance(a: string, b: string): number {
  return diffAnswer(a, b).length;
}

/**
 * Checks a typed answer. forms[0] is the primary accepted form, the rest are accepted variants.
 * Romaji is never accepted: the answer is compared as Japanese text.
 */
export function checkTyped(forms: string[], submitted: string, opts: CheckOptions = {}): CheckResult {
  const sensitive = opts.scriptSensitive !== false;
  const sub = normaliseAnswer(submitted);
  const accepted = forms.map((f) => ({ raw: f, norm: normaliseAnswer(f) })).filter((f) => f.norm);
  const same = (x: string, y: string) => (sensitive ? x === y : toHiragana(x) === toHiragana(y));
  if (sub) {
    for (let i = 0; i < accepted.length; i++) {
      if (same(accepted[i]!.norm, sub)) return { correct: true, matchedForm: accepted[i]!.raw, variant: i > 0, closest: accepted[i]!.norm, mistakes: [] };
    }
  }
  if (!accepted.length) return { correct: false, matchedForm: null, variant: false, closest: null, mistakes: [] };
  let best = accepted[0]!;
  let bestD = Infinity;
  for (const f of accepted) { const dist = distance(f.norm, sub); if (dist < bestD) { bestD = dist; best = f; } }
  const target = sensitive ? best.norm : toHiragana(best.norm);
  const answer = sensitive ? sub : toHiragana(sub);
  return { correct: false, matchedForm: null, variant: false, closest: best.norm, mistakes: sub ? nearDiff(target, answer) : [] };
}
