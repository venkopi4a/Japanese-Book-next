import { hasKanji } from './kana';
import { checkTyped, type CheckResult } from './answer';
import type { Skill, Word } from './types';

/** The written forms accepted for a typed answer. The first is the primary form. */
export function acceptedForms(word: Word, skill: Skill): string[] {
  if (skill === 'reading') return [word.reading];
  const forms = [word.text, ...word.accepted];
  // A kanji word written fully in kana is valid spelling, so it is accepted as a variant.
  if (hasKanji(word.text) && word.reading) forms.push(word.reading);
  return forms;
}

/** Grades a typed answer for a skill. Reading ignores hiragana/katakana script; spelling does not. */
export function gradeTyped(word: Word, skill: Skill, submitted: string): CheckResult {
  return checkTyped(acceptedForms(word, skill), submitted, { scriptSensitive: skill !== 'reading' });
}
