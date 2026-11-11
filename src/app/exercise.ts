import { pickDistractors, shuffle, type Rng } from '../domain/distractors';
import { hasKanji, isKatakana } from '../domain/kana';
import { toRomaji } from 'wanakana';
import type { ExerciseType, Skill, Word } from '../domain/types';
import type { Settings } from './settings';

export interface Exercise {
  type: ExerciseType | 'flashcard';
  skill: Skill;
  word: Word;
  prompt: string;
  promptKind: 'ja' | 'en' | 'audio';
  hint: string;
  options: string[];
  optionsJa: boolean;
  answer: string;       // the correct option (multiple choice) or the shown correct answer (typed)
  audioText: string;
  typed: null | 'kana' | 'romaji' | 'spelling';
  /** Reading help under the prompt (kana and/or romaji), or '' when the learner does not need it. */
  help: string;
  /** Reading help under each Japanese option. */
  optionHelp: Record<string, string>;
}

/** What the learner already knows, so questions only use words they have met and help only where it is needed. */
export interface Known {
  /** Words that have been taught (they have a recognition state). */
  met: Set<string>;
  /** Words whose reading is known well (reading skill at box 2 or higher). */
  readingKnown: Set<string>;
  katakanaDone: boolean;
}
export const KNOW_NOTHING: Known = { met: new Set(), readingKnown: new Set(), katakanaDone: false };

export const romajiOf = (kana: string) => toRomaji(kana);

/**
 * Reading help for a Japanese word: the kana reading under kanji until its reading is known,
 * and romaji under katakana until katakana is learned. Hiragana is learned first, so it needs no help.
 */
export function readingHelp(word: Pick<Word, 'id' | 'text' | 'reading'>, k: Known): string {
  const kat = Array.from(word.reading || word.text).some(isKatakana) && !k.katakanaDone;
  const parts: string[] = [];
  if (hasKanji(word.text) && !k.readingKnown.has(word.id)) parts.push(word.reading);
  if (kat) parts.push(romajiOf(word.reading || word.text));
  return parts.join(' · ');
}

/**
 * Wrong options come from words already taught. Unseen words are only used to fill up when fewer than three
 * taught words are available, so a question never shows Japanese the learner has not met if it can be avoided.
 */
const uniqueOthers = (words: Word[], word: Word, pick: (w: Word) => string, avoid: string, met: Set<string>, rng: Rng) => {
  const seen = new Set([avoid]);
  const take = (list: Word[]) => shuffle(list, rng).map(pick).filter((s) => s && !seen.has(s) && (seen.add(s), true));
  const live = words.filter((w) => !w.deletedAt && w.id !== word.id);
  const known = take(live.filter((w) => met.has(w.id)));
  return known.length >= 3 ? known : [...known, ...take(live.filter((w) => !met.has(w.id)))];
};

export function buildExercise(word: Word, skill: Skill, words: Word[], settings: Settings, rng: Rng, k: Known = KNOW_NOTHING): Exercise {
  const base = { skill, word, audioText: word.reading || word.text, options: [] as string[], optionsJa: false, typed: null as Exercise['typed'], help: readingHelp(word, k), optionHelp: {} as Record<string, string> };
  // the pool is already shuffled, met words first
  const choices = (correct: string, pool: string[]) => shuffle([correct, ...pool.slice(0, 3)], rng);
  switch (skill) {
    case 'recognition': {
      const options = choices(word.meaning, uniqueOthers(words, word, (w) => w.meaning, word.meaning, k.met, rng));
      if (options.length < 2) return { ...base, type: 'flashcard', prompt: word.text, promptKind: 'ja', hint: 'Do you know it?', answer: word.meaning };
      return { ...base, type: 'meaning-mc', prompt: word.text, promptKind: 'ja', hint: 'What does it mean?', options, answer: word.meaning };
    }
    case 'recall': {
      const same = uniqueOthers(words, word, (w) => w.text, word.text, k.met, rng);
      const near = same.filter((t) => Math.abs(Array.from(t).length - Array.from(word.text).length) <= 1);
      const metNear = near.filter((t) => words.some((w) => w.text === t && k.met.has(w.id)));
      const options = choices(word.text, metNear.length >= 3 ? metNear : same);
      if (options.length < 2) return { ...base, help: '', type: 'flashcard', prompt: word.meaning, promptKind: 'en', hint: 'Do you remember the Japanese?', answer: word.text };
      const optionHelp: Record<string, string> = {};
      for (const o of options) { const w = o === word.text ? word : words.find((x) => x.text === o && !x.deletedAt); if (w) optionHelp[o] = readingHelp(w, k); }
      return { ...base, help: '', type: 'recall-mc', prompt: word.meaning, promptKind: 'en', hint: 'Choose the Japanese', options, optionsJa: true, answer: word.text, optionHelp };
    }
    case 'reading': {
      base.help = ''; // the reading is the answer here
      if (settings.readingMode === 'kana') return { ...base, type: 'reading-type', prompt: word.text, promptKind: 'ja', hint: 'Type the reading in kana', typed: 'kana', answer: word.reading };
      if (settings.readingMode === 'romaji') return { ...base, type: 'romaji-type', prompt: word.text, promptKind: 'ja', hint: 'Type the reading in romaji (beginner mode)', typed: 'romaji', answer: word.reading };
      const pool = uniqueOthers(words, word, (w) => w.reading, word.reading, k.met, rng);
      const wrong = pickDistractors(word.reading, pool, 3, rng);
      return { ...base, type: 'reading-mc', prompt: word.text, promptKind: 'ja', hint: 'How is it read?', options: shuffle([word.reading, ...wrong], rng), optionsJa: true, answer: word.reading };
    }
    case 'listening': {
      const options = choices(word.meaning, uniqueOthers(words, word, (w) => w.meaning, word.meaning, k.met, rng));
      return { ...base, help: '', type: 'listening-mc', prompt: '', promptKind: 'audio', hint: 'Listen, then choose the meaning', options, answer: word.meaning };
    }
    default:
      return { ...base, help: '', type: 'spelling-type', prompt: word.meaning, promptKind: 'en', hint: 'Type it in Japanese', typed: 'spelling', answer: word.text };
  }
}

export const isKanjiWord = (w: Word) => hasKanji(w.text);

const NAMES: Record<string, string> = {
  dakuten: 'Check the dakuten (゛)', handakuten: 'Check the handakuten (゜)', 'small-kana': 'Check the small kana',
  'long-vowel': 'Check the long vowel', script: 'Wrong script', confusable: 'Look-alike characters',
  substitution: 'A different character', missing: 'A character is missing', extra: 'An extra character',
};
/** Plain-language lines for the first mistakes in an answer. */
export function explainMistakes(m: { kind: string; expected: string | null; got: string | null }[]): string[] {
  return m.slice(0, 2).map((x) => `${NAMES[x.kind] ?? 'Mistake'}${x.expected && x.got ? `: ${x.expected} not ${x.got}` : x.expected ? `: ${x.expected}` : ''}`);
}
