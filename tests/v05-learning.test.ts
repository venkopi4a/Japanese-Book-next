import { beforeEach, describe, expect, it } from 'vitest';
import { buildExercise, readingHelp, type Known } from '../src/app/exercise';
import { DEFAULTS } from '../src/app/settings';
import { chooseVoice, hasVoice, loadVoices, rankVoices } from '../src/app/speech';
import { autoProfile, settingsKey } from '../src/app/profiles';
import { dbName, openUserDb } from '../src/data/db';
import { Repo, blankWord } from '../src/data/repo';
import { mulberry32 } from '../src/domain/distractors';
import { levelFor, milestones } from '../src/domain/levels';
import { DAY, newState, startOfDay } from '../src/domain/scheduler';
import { planMistakes, planWeak, wordsIntroducedToday } from '../src/domain/session';
import { bestStreak, streak } from '../src/domain/stats';
import type { Attempt, Word } from '../src/domain/types';

const NOW = new Date(2026, 10, 11, 10).getTime();
const w = (id: string, text: string, reading: string, meaning: string): Word => ({ ...blankWord({ text, reading, meaning }, NOW), id });
const WORDS = [w('a', '学生', 'がくせい', 'student'), w('b', '先生', 'せんせい', 'teacher'), w('c', '本', 'ほん', 'book'), w('d', 'ニュース', 'ニュース', 'news'),
  w('e', '雑誌', 'ざっし', 'magazine'), w('f', '猫', 'ねこ', 'cat'), w('g', '犬', 'いぬ', 'dog'), w('h', '水', 'みず', 'water'), w('i', 'テレビ', 'テレビ', 'TV')];
const known = (met: string[], readingKnown: string[] = [], katakanaDone = false): Known => ({ met: new Set(met), readingKnown: new Set(readingKnown), katakanaDone });

describe('teach first', () => {
  let repo: Repo, n = 0;
  beforeEach(async () => { repo = new Repo(await openUserDb(dbName('v5-' + n++, 'u'))); });
  it('a lesson starts the word at box 0, first due tomorrow, and writes no attempt', async () => {
    const s = await repo.introduce('a', 'recognition', NOW);
    expect(s.box).toBe(0);
    expect(s.dueAt).toBe(startOfDay(NOW) + DAY);
    expect(await repo.attemptsSince(0)).toHaveLength(0);
    expect(await repo.outboxSize()).toBe(1);
    expect(await repo.introducedToday(NOW)).toBe(1);
  });
  it('teaching the same word twice changes nothing', async () => {
    await repo.introduce('a', 'recognition', NOW);
    const again = await repo.introduce('a', 'recognition', NOW + DAY * 3);
    expect(again.introducedAt).toBe(NOW);
    expect(await repo.outboxSize()).toBe(1);
  });
  it('missing a kana right after its lesson card is not a lapse; missing it later is', async () => {
    await repo.introduce('kana:h:か', 'recognition', NOW);
    const first = await repo.recordAnswer({ word: { id: 'kana:h:か' }, skill: 'recognition', exercise: 'kana-sound-mc', shown: 'か', expected: 'ka', submitted: 'ki', correct: false, firstTry: true, sessionId: 's', now: NOW + 1, learning: true });
    expect(first.state.lapses).toBe(0);
    const later = await repo.recordAnswer({ word: { id: 'kana:h:か' }, skill: 'recognition', exercise: 'kana-sound-mc', shown: 'か', expected: 'ka', submitted: 'ki', correct: false, firstTry: false, sessionId: 's', now: NOW + 2, learning: true });
    expect(later.state.lapses).toBe(1);
  });
  it('kana lessons do not use up the daily new-word limit', async () => {
    await repo.introduce('kana:h:あ', 'recognition', NOW);
    await repo.introduce('a', 'recognition', NOW);
    expect(await repo.introducedToday(NOW)).toBe(1);
    expect(wordsIntroducedToday(await repo.getStates(), startOfDay(NOW))).toBe(1);
  });
});

describe('kana never leak into vocabulary plans', () => {
  const att = (wordId: string, correct: boolean): Attempt => ({ id: wordId + Math.random(), wordId, sessionId: 's', ts: NOW - 1000, exercise: 'kana-sound-mc', skill: 'recognition', shown: '', expected: '', submitted: '', correct, firstTry: true, boxBefore: 0, responseMs: 1, mistakes: [], options: null, appVersion: 't', deviceId: 'd' });
  it('weak words and mistakes ignore kana', () => {
    const states = [{ ...newState('kana:h:あ', 'recognition', NOW), lapses: 3 }];
    expect(planWeak(states, [att('kana:h:あ', false), att('kana:h:あ', false), att('kana:h:あ', false)])).toHaveLength(0);
    expect(planMistakes([att('kana:h:あ', false)], 0)).toHaveLength(0);
  });
});

describe('questions only use words you have met, with reading help', () => {
  it('wrong options come from met words when there are at least three', () => {
    const k = known(['a', 'b', 'c', 'e']);
    for (let seed = 1; seed < 40; seed++) {
      const ex = buildExercise(WORDS[0]!, 'recall', WORDS, DEFAULTS, mulberry32(seed), k);
      expect(ex.options).toHaveLength(4);
      expect(ex.options.every((o) => ['学生', '先生', '本', '雑誌'].includes(o))).toBe(true);
      const rec = buildExercise(WORDS[0]!, 'recognition', WORDS, DEFAULTS, mulberry32(seed), k);
      expect(rec.options.every((o) => ['student', 'teacher', 'book', 'magazine'].includes(o))).toBe(true);
    }
  });
  it('fills up with unseen words only when fewer than three are met', () => {
    const ex = buildExercise(WORDS[0]!, 'recognition', WORDS, DEFAULTS, mulberry32(1), known(['a', 'b']));
    expect(ex.options).toHaveLength(4);
    expect(ex.options).toContain('teacher');
  });
  it('kanji show their kana until the reading is known; katakana shows romaji until katakana is learned', () => {
    expect(readingHelp(WORDS[0]!, known([]))).toBe('がくせい');
    expect(readingHelp(WORDS[0]!, known([], ['a']))).toBe('');
    expect(readingHelp(WORDS[3]!, known([]))).toBe('nyuusu');
    expect(readingHelp(WORDS[3]!, known([], [], true))).toBe('');
    expect(readingHelp(w('x', 'よく', 'よく', 'often'), known([]))).toBe('');
  });
  it('recognition shows reading help under the prompt; reading questions never give the answer away', () => {
    expect(buildExercise(WORDS[0]!, 'recognition', WORDS, DEFAULTS, mulberry32(1), known(['a', 'b', 'c'])).help).toBe('がくせい');
    expect(buildExercise(WORDS[0]!, 'reading', WORDS, DEFAULTS, mulberry32(1), known(['a', 'b', 'c'])).help).toBe('');
    const recall = buildExercise(WORDS[0]!, 'recall', WORDS, DEFAULTS, mulberry32(2), known(['a', 'b', 'c', 'e']));
    expect(recall.optionHelp['学生']).toBe('がくせい');
    expect(Object.keys(recall.optionHelp).sort()).toEqual([...recall.options].sort());
  });
});

describe('voices', () => {
  const v = (name: string, voiceURI = name, lang = 'ja-JP') => ({ name, voiceURI, lang });
  const all = [v('Samantha', 'a', 'en-US'), v('Kyoko', 'com.apple.voice.compact.ja-JP.Kyoko'), v('Kyoko (Enhanced)', 'com.apple.voice.enhanced.ja-JP.Kyoko'), v('O-Ren (Premium)', 'com.apple.voice.premium.ja-JP.O-Ren'), v('Hattori', 'h', 'ja_JP')];
  it('lists only Japanese voices, most natural first', () => {
    expect(rankVoices(all).map((x) => x.name)).toEqual(['O-Ren (Premium)', 'Kyoko (Enhanced)', 'Hattori', 'Kyoko']);
  });
  it('keeps looking until the timeout, because Enhanced voices arrive seconds after the basic ones (iPhone restart)', async () => {
    let calls = 0;
    // the basic voices stay "stable" for a long while, then O-Ren (Enhanced) appears
    const late = () => { calls++; return calls < 3 ? [] : calls < 30 ? all.slice(0, 3) : all; };
    const updates: number[] = [];
    const got = await loadVoices(late, (l) => updates.push(l.length), 60, 1);
    expect(got.map((x) => x.name)).toContain('O-Ren (Premium)');
    expect(updates).toEqual([0, 2, 4]);
  });
  it('gives up after the timeout when the phone shares no voices', async () => {
    expect(await loadVoices(() => [], undefined, 5, 1)).toEqual([]);
  });
  it('uses the chosen voice, or the most natural one if the choice is gone', () => {
    expect(chooseVoice(all, 'h')?.name).toBe('Hattori');
    expect(chooseVoice(all, '')?.name).toBe('O-Ren (Premium)');
    expect(chooseVoice(all, 'deleted-voice')?.name).toBe('O-Ren (Premium)');
    expect(chooseVoice([v('Samantha', 'a', 'en-US')], '')).toBeUndefined();
  });
  it('ranks the robotic Eloquence voices last, so "Best available" is Kyoko, not Eddy (as offered on iPhone)', () => {
    const iphone = ['Eddy', 'Flo', 'Grandma', 'Grandpa', 'Reed', 'Rocko', 'Sandy', 'Shelley', 'Kyoko'].map((n) => v(n, `com.apple.eloquence.ja-JP.${n}`.replace('eloquence.ja-JP.Kyoko', 'voice.compact.ja-JP.Kyoko')));
    expect(chooseVoice(iphone, '')?.name).toBe('Kyoko');
    expect(rankVoices(iphone).at(-1)?.name).not.toBe('Kyoko');
  });
  it('finds the saved voice by name when iPhone reports a different id after a restart', () => {
    const after = [v('Kyoko', 'k2'), v('O-ren (Enhanced)', 'new-id-after-restart')];
    expect(chooseVoice(after, 'com.apple.voice.enhanced.ja-JP.O-ren', 'O-ren (Enhanced)')?.voiceURI).toBe('new-id-after-restart');
    expect(hasVoice(after, 'com.apple.voice.enhanced.ja-JP.O-ren', 'O-ren (Enhanced)')).toBe(true);
    // same voice in another quality counts as that voice too
    expect(chooseVoice([v('Kyoko', 'k'), v('O-ren', 'o')], 'gone', 'O-ren (Enhanced)')?.name).toBe('O-ren');
    // not offered at all: say so, and use the most natural available
    expect(hasVoice([v('Kyoko', 'k')], 'gone', 'O-ren (Enhanced)')).toBe(false);
    expect(chooseVoice([v('Kyoko', 'k')], 'gone', 'O-ren (Enhanced)')?.name).toBe('Kyoko');
  });
});

describe('people on one device', () => {
  it('the first person keeps the original database and settings key, others get their own', () => {
    expect(settingsKey('local')).toBe(`jb:${import.meta.env.BASE_URL}:settings`);
    expect(settingsKey('p1')).toBe(`jb:${import.meta.env.BASE_URL}:settings:p1`);
    expect(dbName('/B/', 'local')).not.toBe(dbName('/B/', 'p1'));
  });
  it('opens straight in with one person, shows the picker with several', () => {
    const p = { id: 'local', name: 'V', colour: 0 };
    expect(autoProfile([p])).toBe(p);
    expect(autoProfile([p, { ...p, id: 'p2' }])).toBeNull();
    expect(autoProfile([])).toBeNull();
  });
});

describe('progress', () => {
  const at = (ts: number) => ({ ts }) as Attempt;
  it('a day with only lessons still counts for the streak', () => {
    expect(streak([at(NOW - DAY)], NOW, [NOW])).toBe(2);
    expect(streak([], NOW, [NOW - DAY, NOW - 2 * DAY])).toBe(2);
  });
  it('best streak is the longest run ever', () => {
    expect(bestStreak([at(NOW - 10 * DAY), at(NOW - 9 * DAY), at(NOW - 8 * DAY), at(NOW - 2 * DAY)], [NOW])).toBe(3);
    expect(bestStreak([])).toBe(0);
  });
  it('levels grow with everything learned', () => {
    expect(levelFor(0)).toMatchObject({ n: 1, name: 'Seed', to: 10 });
    expect(levelFor(10)).toMatchObject({ n: 2, name: 'Sprout' });
    expect(levelFor(9999)).toMatchObject({ n: 10, to: null, nextName: null });
  });
  it('milestones show progress until done', () => {
    const m = milestones({ words: 30, hiragana: 104, hiraganaTotal: 104, katakana: 4, katakanaTotal: 104, bestStreak: 3, anyStudy: true });
    expect(m.find((x) => x.id === 'hira')?.done).toBe(true);
    expect(m.find((x) => x.id === 'w25')?.done).toBe(true);
    expect(m.find((x) => x.id === 'w100')).toMatchObject({ done: false, progress: '30/100' });
    expect(m.find((x) => x.id === 'streak7')).toMatchObject({ done: false, progress: '3/7' });
  });
});
