import { beforeEach, describe, expect, it } from 'vitest';
import { dbName, openUserDb } from '../src/data/db';
import { Repo } from '../src/data/repo';
import { LIBRARY } from '../src/data/library';
import { isKanaOnly } from '../src/domain/kana';

let n = 0;
const fresh = async (user = 'u') => new Repo(await openUserDb(dbName('t' + n++, user)));
let repo: Repo;
beforeEach(async () => { repo = await fresh(); });

describe('starter library', () => {
  it('has 104 unique words with kana readings, katakana words read in katakana', () => {
    expect(LIBRARY).toHaveLength(104);
    expect(new Set(LIBRARY.map((l) => l.id)).size).toBe(104);
    expect(LIBRARY.every((l) => isKanaOnly(l.reading))).toBe(true);
    const news = LIBRARY.find((l) => l.text === 'ニュース');
    expect(news?.reading).toBe('ニュース');
  });
  it('seeds once, and a deleted starter word never comes back', async () => {
    expect(await repo.seedLibrary(LIBRARY)).toBe(104);
    expect(await repo.seedLibrary(LIBRARY)).toBe(0);
    const w = (await repo.listWords())[0]!;
    await repo.deleteWord(w.id);
    await repo.seedLibrary(LIBRARY);
    expect(await repo.listWords()).toHaveLength(103);
    expect(await repo.listWords(true)).toHaveLength(104);
  });
});

describe('recording answers', () => {
  it('writes the attempt, the new state and the sync queue together', async () => {
    const [w] = await repo.addWords([{ text: '学生', reading: 'がくせい', meaning: 'student' }]);
    const s = await repo.startSession('today');
    const { attempt, state } = await repo.recordAnswer({ word: w!, skill: 'recognition', exercise: 'meaning-mc', shown: '学生', expected: 'student', submitted: 'teacher', correct: false, firstTry: true, sessionId: s.id });
    expect(state).toMatchObject({ box: 0, lapses: 1 });
    expect(attempt).toMatchObject({ submitted: 'teacher', boxBefore: null, correct: false });
    expect(await repo.attemptsSince(0)).toHaveLength(1);
    expect(await repo.getStates()).toHaveLength(1);
    expect(await repo.outboxSize()).toBe(3); // the word, the attempt, the skill state
    await repo.recordAnswer({ word: w!, skill: 'recognition', exercise: 'meaning-mc', shown: '学生', expected: 'student', submitted: 'student', correct: true, firstTry: false, sessionId: s.id });
    expect((await repo.attemptsSince(0))).toHaveLength(2); // history is append-only
    expect((await repo.getStates())[0]).toMatchObject({ box: 1, correct: 0 });
  });
  it('counts words introduced today', async () => {
    const [a, b] = await repo.addWords([{ text: 'a', reading: 'あ', meaning: 'x' }, { text: 'b', reading: 'い', meaning: 'y' }]);
    const base = { skill: 'recognition' as const, exercise: 'meaning-mc' as const, shown: '', expected: '', submitted: '', correct: true, firstTry: true, sessionId: 's' };
    await repo.recordAnswer({ ...base, word: a! });
    await repo.recordAnswer({ ...base, word: b! });
    await repo.recordAnswer({ ...base, word: a! });
    expect(await repo.introducedToday()).toBe(2);
  });
  it('keeps the same device id', async () => {
    expect(await repo.deviceId()).toBe(await repo.deviceId());
  });
});

describe('separate accounts', () => {
  it('never see each other’s local data', async () => {
    const a = new Repo(await openUserDb(dbName('iso', 'alice')));
    const b = new Repo(await openUserDb(dbName('iso', 'bob')));
    await a.addWords([{ text: '猫', reading: 'ねこ', meaning: 'cat' }]);
    expect(await b.listWords()).toHaveLength(0);
    await a.wipe();
    expect(await a.listWords()).toHaveLength(0);
  });
});

describe('extra practice', () => {
  it('records a right answer without promoting an item that is not due', async () => {
    const r = await fresh();
    const [w] = await r.addWords([{ text: '猫', reading: 'ねこ', meaning: 'cat' }]);
    const base = { word: w!, skill: 'recognition' as const, exercise: 'meaning-mc' as const, shown: '', expected: '', submitted: '', firstTry: true, sessionId: 's' };
    await r.recordAnswer({ ...base, correct: true });
    const before = (await r.getStates())[0]!;
    await r.recordAnswer({ ...base, correct: true, promote: false });
    expect((await r.getStates())[0]).toEqual(before);
    expect(await r.attemptsSince(0)).toHaveLength(2);
    await r.recordAnswer({ ...base, correct: false, promote: false });
    expect((await r.getStates())[0]).toMatchObject({ box: 0, lapses: 1 });
  });
});

describe('first exposure', () => {
  it('not knowing a brand-new word is not a lapse', async () => {
    const r = await fresh();
    const [w] = await r.addWords([{ text: '猫', reading: 'ねこ', meaning: 'cat' }]);
    const base = { word: w!, skill: 'recognition' as const, exercise: 'flashcard' as const, shown: '', expected: '', submitted: 'again', sessionId: 's' };
    await r.recordAnswer({ ...base, correct: false, firstTry: true, learning: true });
    expect((await r.getStates())[0]).toMatchObject({ box: 0, lapses: 0, lastCorrect: false });
    await r.recordAnswer({ ...base, correct: true, firstTry: false, learning: true });
    expect((await r.getStates())[0]).toMatchObject({ box: 1, lapses: 0 });
    await r.recordAnswer({ ...base, correct: false, firstTry: true, learning: true }); // now it is known: a miss is a real lapse
    expect((await r.getStates())[0]).toMatchObject({ box: 0, lapses: 1 });
  });
});
