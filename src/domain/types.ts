export type Skill = 'recognition' | 'recall' | 'reading' | 'listening' | 'spelling';
export const SKILLS: Skill[] = ['recognition', 'recall', 'reading', 'listening', 'spelling'];

export type WordKind = 'kanji' | 'word' | 'expression' | 'verb' | 'adjective' | 'noun' | 'particle' | 'grammar';

export interface Example { ja: string; en: string }

export interface Word {
  id: string;
  kind: WordKind;
  text: string;          // as written: kanji, kana or a mix
  reading: string;       // kana, in the script the word is normally written in
  meaning: string;
  topic: string | null;
  unit: string | null;   // optional lesson or unit label
  note: string | null;
  examples: Example[];
  accepted: string[];    // extra written forms accepted as correct spelling
  source: 'library' | 'user' | 'photo';
  libraryId: string | null;
  photoId: string | null;  // the photo this word was read from, if it was kept
  favourite: boolean;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface SkillState {
  wordId: string;
  skill: Skill;
  box: number;           // 0 to 6
  dueAt: number;         // epoch ms
  correct: number;       // first-try correct answers
  lapses: number;
  introducedAt: number;
  lastAt: number | null;
  lastCorrect: boolean | null;
}

export type ExerciseType =
  | 'flashcard' | 'meaning-mc' | 'recall-mc' | 'reading-mc' | 'reading-type' | 'listening-mc' | 'spelling-type' | 'romaji-type';

export type MistakeKind =
  | 'dakuten' | 'handakuten' | 'small-kana' | 'long-vowel' | 'script' | 'confusable' | 'substitution' | 'missing' | 'extra';

export interface MistakeDetail {
  kind: MistakeKind;
  expected: string | null;
  got: string | null;
  index: number;
}

// Append-only: attempts are never edited or deleted.
export interface Attempt {
  id: string;
  wordId: string;
  sessionId: string;
  ts: number;
  exercise: ExerciseType;
  skill: Skill;
  shown: string;
  expected: string;
  submitted: string;
  correct: boolean;
  firstTry: boolean;
  boxBefore: number | null;
  responseMs: number | null;
  mistakes: MistakeDetail[];
  options: string[] | null;
  appVersion: string;
  deviceId: string;
}
