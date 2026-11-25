import { describe, expect, it } from 'vitest';
import { blankWord } from '../src/data/repo';
import { DAY, newState } from '../src/domain/scheduler';
import type { Attempt, Word } from '../src/domain/types';
import { MY_WORDS, lessonSizes, wordLessonInfo, wordLessonSteps, wordSummary, wordUnits } from '../src/domain/wordPath';

const NOW = new Date(2026, 10, 25, 10).getTime();
let n = 0;
const w = (topic: string | null, text = `w${n}`): Word => ({ ...blankWord({ text, reading: 'よみ', meaning: `m${n}`, topic }, NOW + n), id: `id${n++}` });
const att = (wordId: string, correct: boolean, ts: number, firstTry = true): Attempt => ({ id: wordId + ts + Math.random(), wordId, sessionId: 's', ts, exercise: 'meaning-mc', skill: 'recognition', shown: '', expected: '', submitted: '', correct, firstTry, boxBefore: 0, responseMs: 1, mistakes: [], options: null, appVersion: 't', deviceId: 'd' });

describe('word course', () => {
  it('splits a topic into the fewest lessons of at most 5, evenly', () => {
    expect(lessonSizes(11)).toEqual([4, 4, 3]);
    expect(lessonSizes(5)).toEqual([5]);
    expect(lessonSizes(6)).toEqual([3, 3]);
    expect(lessonSizes(13)).toEqual([5, 4, 4]);
    expect(lessonSizes(0)).toEqual([]);
  });
  it('units run in beginner order; unknown topics after, alphabetical; words without a topic last', () => {
    const words = [w('Grammar'), w('Zoo'), w(null), w('Greetings'), w('Apples'), w('People')];
    expect(wordUnits(words).map((u) => u.name)).toEqual(['Greetings', 'People', 'Grammar', 'Apples', 'Zoo', MY_WORDS]);
  });
  it('lessons keep the order words were added and skip deleted words', () => {
    const ws = Array.from({ length: 6 }, () => w('Food'));
    ws[2] = { ...ws[2]!, deletedAt: NOW };
    const u = wordUnits(ws)[0]!;
    expect(u.lessons.map((l) => l.words.length)).toEqual([5]);
    expect(u.lessons[0]!.words.map((x) => x.id)).not.toContain(ws[2]!.id);
    expect(u.lessons[0]).toMatchObject({ unit: 'Food', n: 1, of: 1 });
  });
  it('word levels follow the kana rule: learned stays after a miss, mastered = 3 right first tries on 2+ days', () => {
    const [a, b, c, d] = [w('Food'), w('Food'), w('Food'), w('Food')];
    const s = wordSummary([a!, b!, c!, d!], [{ ...newState(b!.id, 'recognition', NOW), lastAt: NOW }], [
      att(b!.id, false, NOW),
      att(c!.id, true, NOW - DAY), att(c!.id, false, NOW),
      att(d!.id, true, NOW - 2 * DAY), att(d!.id, true, NOW - DAY), att(d!.id, true, NOW),
    ]);
    expect([a, b, c, d].map((x) => s.levels.get(x!.id))).toEqual(['new', 'learning', 'learned', 'mastered']);
    expect([s.learned, s.mastered, s.total]).toEqual([2, 1, 4]);
  });
  it('lesson info: nothing locked; the first unfinished lesson is current, finished ones show strength', () => {
    const ws = Array.from({ length: 8 }, () => w('Food')); // lessons of 4 + 4
    const levels = new Map(ws.slice(0, 4).map((x) => [x.id, 'mastered' as const]));
    const info = wordLessonInfo(wordUnits(ws), levels);
    expect(info.map((x) => x.status)).toEqual(['done', 'current']);
    expect(info[0]!.strength).toBe(3);
    const later = wordLessonInfo(wordUnits([...ws, ...Array.from({ length: 5 }, () => w('Grammar'))]), levels);
    expect(later.map((x) => x.status)).toEqual(['done', 'current', 'open']);
  });
  it('a lesson teaches then checks each new word, ends with matching, and resumes without repeating', () => {
    const ws = Array.from({ length: 4 }, () => w('Food'));
    const lesson = wordUnits(ws)[0]!.lessons[0]!;
    expect(wordLessonSteps(lesson, new Map()).map((s) => s.kind)).toEqual(['learn', 'quiz', 'learn', 'quiz', 'learn', 'quiz', 'learn', 'quiz', 'match']);
    const resumed = wordLessonSteps(lesson, new Map([[ws[0]!.id, 'learned' as const], [ws[1]!.id, 'learning' as const]]));
    expect(resumed.filter((s) => s.kind === 'learn').map((s) => (s as { word: Word }).word.id)).toEqual([ws[2]!.id, ws[3]!.id]);
    const done = wordLessonSteps(lesson, new Map(ws.map((x) => [x.id, 'learned' as const])));
    expect(done.map((s) => s.kind)).toEqual(['quiz', 'quiz', 'quiz', 'quiz', 'match']); // practice round
    expect(wordLessonSteps(wordUnits([w('Colors'), w('Colors')])[0]!.lessons[0]!, new Map()).some((s) => s.kind === 'match')).toBe(false);
  });
});

import 'fake-indexeddb/auto';
import { romajiOf } from '../src/app/exercise';
import { dbName, openUserDb } from '../src/data/db';
import { Repo } from '../src/data/repo';
import { LIBRARY } from '../src/data/library';

describe('content fixes', () => {
  it('romaji follows pronunciation: particle は is wa, を is o', () => {
    expect(romajiOf('おなまえは')).toBe('onamaewa');
    expect(romajiOf('これは')).toBe('korewa');
    expect(romajiOf('こんにちは')).toBe('konnichiwa');
    expect(romajiOf('は', 'this (topic particle)')).toBe('wa');
    expect(romajiOf('は')).toBe('ha'); // a lone は that is not the particle (e.g. tooth)
    expect(romajiOf('ほんをよむ')).toBe("hon'oyomu"); // the apostrophe keeps ん and お apart (Hepburn)
    expect(romajiOf('はし')).toBe('hashi');
  });
  it('the starter word お名前は is spelled おなまえは, and an old saved copy is repaired unless it was edited', async () => {
    expect(LIBRARY.find((l) => l.id === 't6mo0by')?.text).toBe('おなまえは');
    const repo = new Repo(await openUserDb(dbName('fix-test', 'u')));
    await repo.seedLibrary(LIBRARY);
    const w = (await repo.listWords()).find((x) => x.libraryId === 't6mo0by')!;
    await repo.updateWord(w.id, { text: 'おはまえは' }); // as saved by the old version
    await repo.seedLibrary(LIBRARY);
    expect((await repo.listWords()).find((x) => x.libraryId === 't6mo0by')?.text).toBe('おなまえは');
    await repo.updateWord(w.id, { text: 'お名前は' }); // learner's own edit stays
    await repo.seedLibrary(LIBRARY);
    expect((await repo.listWords()).find((x) => x.libraryId === 't6mo0by')?.text).toBe('お名前は');
  });
});
