import { toRomaji } from 'wanakana';
import type { WordKind } from './types';

/** One dictionary entry: [written form, reading, part of speech, commonness rank (0 = most common), senses (each a list of English glosses)]. */
export type DictEntry = [string, string, string, number, string[][]];

export interface Match { text: string; reading: string; meaning: string; pos: string; kind: WordKind; rank: number }
interface Hit { e: number; s: number; g: number; v: boolean }
export interface DictIndex { entries: DictEntry[]; whole: Map<string, Hit[]>; token: Map<string, Hit[]>; sounds?: Sound[] }
/** How an entry sounds in romaji: exactly as Hepburn spells it, and with spelling variants folded together (see `loose`). */
interface Sound { e: number; strict: string; loose: string }

/** Lower-case, drop "(...)" notes and a leading to/a/an/the, so "to eat" and "eat" and "a cat (domestic)" all line up. */
export const norm = (s: string) => {
  let t = s.toLowerCase();
  for (let prev = ''; prev !== t;) { prev = t; t = t.replace(/\([^()]*\)/g, ' '); }   // nested notes too: "dog (Canis (lupus) familiaris)"
  return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9' -]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^(to|a|an|the) (?=\S)/, '');
};

const push = (m: Map<string, Hit[]>, k: string, h: Hit) => { const a = m.get(k); a ? a.push(h) : m.set(k, [h]); };

export function buildIndex(entries: DictEntry[]): DictIndex {
  const whole = new Map<string, Hit[]>(), token = new Map<string, Hit[]>();
  entries.forEach((en, e) => en[4].forEach((glosses, s) => glosses.forEach((raw, g) => {
    const n = norm(raw);
    if (!n) return;
    const h = { e, s, g, v: /^to /i.test(raw.trim()) };
    push(whole, n, h);
    for (const t of new Set(n.split(' '))) if (t.length > 1) push(token, t, h);
  })));
  return { entries, whole, token };
}

export function kindOf(pos: string): WordKind {
  switch (pos) {
    case 'verb': return 'verb';
    case 'i-adjective': case 'na-adjective': return 'adjective';
    case 'noun': return 'noun';
    case 'particle': return 'particle';
    case 'expression': case 'interjection': return 'expression';
    default: return 'word';
  }
}

/** A gloss without its "(...)" notes: "cat (esp. the domestic cat, Felis catus)" becomes "cat". */
const clean = (g: string) => {
  let t = g;
  for (let prev = ''; prev !== t;) { prev = t; t = t.replace(/\s*\([^()]*\)/g, ''); }
  t = t.replace(/\s+/g, ' ').trim();
  return t || g.trim();
};

/** The meaning to show and save: the glosses of the sense that matched, notes removed, at most three. Short on purpose; the person can edit it later. */
export function meaningOf(senses: string[][], first = 0): string {
  const out: string[] = [];
  for (const g of (senses[first] ?? senses[0] ?? []).map(clean)) if (g && !out.some((o) => o.toLowerCase() === g.toLowerCase())) out.push(g);
  return out.slice(0, 3).join(', ');
}

/** Typed romaji, tidied: lower case, macrons spelled out (ō -> ou), no spaces, apostrophes or hyphens. */
export const strictRomaji = (s: string) =>
  s.toLowerCase().replace(/ā/g, 'aa').replace(/ī/g, 'ii').replace(/ū/g, 'uu').replace(/ē/g, 'ee').replace(/ō/g, 'ou').replace(/[^a-z]/g, '');

/**
 * Folds the ways people spell the same Japanese sound, so "ookii", "ōkii", "ohkii" are not needed one by one:
 * long vowels collapse (ou, oo -> o), Hepburn and Nihon-shiki meet (shi/si, chi/ti, tsu/tu, fu/hu, ji/zi, sha/sya), wo -> o.
 */
export const loose = (romaji: string) =>
  strictRomaji(romaji)
    .replace(/shi/g, 'si').replace(/sh([aueo])/g, 'sy$1').replace(/chi/g, 'ti').replace(/ch([aueo])/g, 'ty$1')
    .replace(/tsu/g, 'tu').replace(/fu/g, 'hu').replace(/ji/g, 'zi').replace(/j([aueo])/g, 'zy$1').replace(/wo/g, 'o')
    .replace(/ou|oo/g, 'o').replace(/uu/g, 'u').replace(/aa/g, 'a').replace(/ii/g, 'i').replace(/ee|ei/g, 'e');

/** Builds the romaji spellings ahead of the first search (about 150 ms), so typing never stalls. */
export const warmUp = (ix: DictIndex) => { soundsOf(ix); };

function soundsOf(ix: DictIndex): Sound[] {
  if (ix.sounds) return ix.sounds;
  const out: Sound[] = [];
  ix.entries.forEach((en, e) => {
    const readings = [en[1]];
    // "konnichiwa" is spelled こんにちは: the particle は, へ at the end of a word sounds like わ, え
    if (/[はへ]$/.test(en[1]) && en[1].length > 2) readings.push(en[1].slice(0, -1) + (en[1].endsWith('は') ? 'わ' : 'え'));
    for (const r of readings) { const strict = strictRomaji(toRomaji(r)); if (strict) out.push({ e, strict, loose: loose(strict) }); }
  });
  return (ix.sounds = out);
}

const JA = /[\u3040-\u30ff\u3400-\u9fff]/;
const WEAK_POS = new Set(['suffix', 'prefix', 'counter']);

/**
 * Finds Japanese words for an English query and ranks them by a score (lower is better). The score is the log of the word's
 * commonness rank (so "twice as rare" costs the same everywhere on the scale) plus penalties: the English only starts or ends
 * with the query ("railway station") or merely contains it, it is a later gloss or a minor sense, the word is a suffix/prefix/counter,
 * or the query was "to eat" and the word is not a verb. A Japanese query (kana or kanji) matches forms and readings that start with it.
 */
export function lookup(ix: DictIndex, query: string, limit = 8): Match[] {
  const q = query.trim();
  if (q.length < 2 && !JA.test(q)) return [];
  const best = new Map<number, { score: number; first: number }>();
  const offer = (e: number, base: number, s: number, g: number, verbOk = true) => {
    const en = ix.entries[e]!;
    const score = 100 * Math.log(en[3] + 50) + base + Math.min(s, 3) * 120 + Math.min(g, 2) * 250 + (WEAK_POS.has(en[2]) ? 500 : 0) + (verbOk ? 0 : 250);
    const cur = best.get(e);
    if (!cur || score < cur.score) best.set(e, { score, first: s });
  };
  if (JA.test(q)) {
    ix.entries.forEach((en, e) => { if (en[0] === q || en[1] === q) offer(e, 0, 0, 0); else if (en[0].startsWith(q) || en[1].startsWith(q)) offer(e, 250, 0, 0); });
  } else {
    const n = norm(q);
    if (!n) return [];
    const wantVerb = /^to /i.test(q);
    for (const h of ix.whole.get(n) ?? []) offer(h.e, 0, h.s, h.g, !wantVerb || h.v);
    const words = n.split(' ').filter((w) => w.length > 1);
    if (words.length) {
      // candidates share the rarest word of the query; keep the ones whose gloss has every word
      const rarest = words.map((w) => ix.token.get(w) ?? []).sort((a, b) => a.length - b.length)[0]!;
      for (const h of rarest) {
        const gl = norm(ix.entries[h.e]![4][h.s]![h.g]!);
        if (gl === n) continue;
        const toks = new Set(gl.split(' '));
        if (!words.every((w) => toks.has(w))) continue;
        offer(h.e, gl.startsWith(n + ' ') || gl.endsWith(' ' + n) ? 80 : 450, h.s, h.g, !wantVerb || h.v);
      }
    }
    // the same letters may be Japanese in romaji ("neko", "arigatou"): match readings. English matches win ties.
    const typed = strictRomaji(q), typedLoose = loose(q);
    if (/^[a-zāīūēō' -]+$/i.test(q) && typed.length >= 2) {
      for (const so of soundsOf(ix)) {
        if (so.strict === typed) offer(so.e, 150, 0, 0);
        else if (so.loose === typedLoose) offer(so.e, 210, 0, 0);
        else if (typedLoose.length >= 3 && so.loose.startsWith(typedLoose)) offer(so.e, 500, 0, 0);
      }
    }
  }
  return [...best.entries()]
    .sort(([, a], [, b]) => a.score - b.score)
    .slice(0, limit)
    .map(([e, b]) => {
      const [text, reading, pos, rank, senses] = ix.entries[e]!;
      return { text, reading, pos, kind: kindOf(pos), rank, meaning: meaningOf(senses, b.first) };
    });
}
