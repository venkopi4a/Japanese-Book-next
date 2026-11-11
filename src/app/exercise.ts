import { pickDistractors, shuffle, type Rng } from '../domain/distractors';
import { hasKanji } from '../domain/kana';
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
}

const uniqueOthers = (words: Word[], word: Word, pick: (w: Word) => string, avoid: string) => {
  const seen = new Set([avoid]);
  return words.filter((w) => !w.deletedAt && w.id !== word.id).map(pick).filter((s) => s && !seen.has(s) && (seen.add(s), true));
};

export function buildExercise(word: Word, skill: Skill, words: Word[], settings: Settings, rng: Rng): Exercise {
  const base = { skill, word, audioText: word.reading || word.text, options: [] as string[], optionsJa: false, typed: null as Exercise['typed'] };
  const choices = (correct: string, pool: string[]) => shuffle([correct, ...shuffle(pool, rng).slice(0, 3)], rng);
  switch (skill) {
    case 'recognition': {
      const options = choices(word.meaning, uniqueOthers(words, word, (w) => w.meaning, word.meaning));
      if (options.length < 2) return { ...base, type: 'flashcard', prompt: word.text, promptKind: 'ja', hint: 'Do you know it?', answer: word.meaning };
      return { ...base, type: 'meaning-mc', prompt: word.text, promptKind: 'ja', hint: 'What does it mean?', options, answer: word.meaning };
    }
    case 'recall': {
      const same = uniqueOthers(words, word, (w) => w.text, word.text);
      const near = same.filter((t) => Math.abs(Array.from(t).length - Array.from(word.text).length) <= 1);
      const options = choices(word.text, near.length >= 3 ? near : same);
      if (options.length < 2) return { ...base, type: 'flashcard', prompt: word.meaning, promptKind: 'en', hint: 'Do you remember the Japanese?', answer: word.text };
      return { ...base, type: 'recall-mc', prompt: word.meaning, promptKind: 'en', hint: 'Choose the Japanese', options, optionsJa: true, answer: word.text };
    }
    case 'reading': {
      if (settings.readingMode === 'kana') return { ...base, type: 'reading-type', prompt: word.text, promptKind: 'ja', hint: 'Type the reading in kana', typed: 'kana', answer: word.reading };
      if (settings.readingMode === 'romaji') return { ...base, type: 'romaji-type', prompt: word.text, promptKind: 'ja', hint: 'Type the reading in romaji (beginner mode)', typed: 'romaji', answer: word.reading };
      const pool = uniqueOthers(words, word, (w) => w.reading, word.reading);
      const wrong = pickDistractors(word.reading, pool, 3, rng);
      return { ...base, type: 'reading-mc', prompt: word.text, promptKind: 'ja', hint: 'How is it read?', options: shuffle([word.reading, ...wrong], rng), optionsJa: true, answer: word.reading };
    }
    case 'listening': {
      const options = choices(word.meaning, uniqueOthers(words, word, (w) => w.meaning, word.meaning));
      return { ...base, type: 'listening-mc', prompt: '', promptKind: 'audio', hint: 'Listen, then choose the meaning', options, answer: word.meaning };
    }
    default:
      return { ...base, type: 'spelling-type', prompt: word.meaning, promptKind: 'en', hint: 'Type it in Japanese', typed: 'spelling', answer: word.text };
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
