import { describe, expect, it } from 'vitest';
import { dbName, openUserDb } from '../src/data/db';
import { Repo } from '../src/data/repo';
import { LIBRARY } from '../src/data/library';
import { BackupError, buildBackup, parseBackup } from '../src/data/backup';

let n = 0;
const fresh = async () => new Repo(await openUserDb(dbName('bk' + n++, 'u')));
const answer = (repo: Repo, id: string, correct = true, now = 1000) =>
  repo.recordAnswer({ word: { id }, skill: 'recognition', exercise: 'meaning-mc', shown: 'x', expected: 'y', submitted: correct ? 'y' : 'z', correct, firstTry: correct, sessionId: 's1', now });

describe('backup and restore', () => {
  it('round-trips words, answers, skills, sessions and photos into a brand new phone without duplicating built-in words', async () => {
    const a = await fresh();
    await a.seedLibrary(LIBRARY);
    const words = await a.listWords();
    const w = words[0]!;
    await a.updateWord(w.id, { favourite: true }, 5000);
    const removed = words[1]!;
    await a.deleteWord(removed.id, 6000);
    const mine = (await a.addWords([{ text: '猫', reading: 'ねこ', meaning: 'cat', photoId: 'ph1' }], 7000))[0]!;
    await a.startSession('review', 1);
    await a.savePhotos([{ id: 'ph1', blob: new Blob(['hello photo'], { type: 'image/jpeg' }), width: 4, height: 3 }]);
    await answer(a, w.id); await answer(a, mine.id, false, 2000); await answer(a, 'kana:h:あ', true, 3000);

    const { text, name, summary } = await buildBackup(a, { name: 'Venko' }, { newLimit: 15 });
    expect(name).toMatch(/^japanese-book-Venko-\d{4}-\d{2}-\d{2}\.json$/);
    expect(summary).toEqual({ words: 105, attempts: 3, photos: 1 });

    const b = await fresh();
    await b.seedLibrary(LIBRARY); // a new phone seeds its own copies with different ids first
    const parsed = parseBackup(text);
    const r = await b.mergeSnapshot(parsed.snapshot);
    expect(r.attempts).toBe(3);

    const after = await b.listWords();
    expect(after).toHaveLength(104); // 104 built-in + 1 own - 1 deleted: no duplicates of the built-in words
    const twin = after.find((x) => x.libraryId === w.libraryId)!;
    expect(twin.favourite).toBe(true); // the backup's edit beat the untouched fresh copy
    expect(after.find((x) => x.libraryId === removed.libraryId)).toBeUndefined();
    expect((await b.snapshot()).words.find((x) => x.libraryId === removed.libraryId)!.deletedAt).toBe(6000); // a deleted built-in word stays deleted
    expect(after.find((x) => x.text === '猫')).toBeTruthy();

    const states = await b.getStates();
    expect(states.map((s) => s.wordId).sort()).toEqual([twin.id, mine.id, 'kana:h:あ'].sort()); // progress is attached to this phone's copy
    expect((await b.attemptsSince(0)).map((x) => x.wordId).sort()).toEqual([twin.id, mine.id, 'kana:h:あ'].sort());
    expect(await b.getPhoto('ph1')).toBeTruthy();
    expect((await (await b.getPhoto('ph1'))!.blob.text())).toBe('hello photo');
  });

  it('is safe to restore twice and never deletes or overwrites newer local work', async () => {
    const a = await fresh();
    await a.seedLibrary(LIBRARY);
    const w = (await a.listWords())[0]!;
    await answer(a, w.id, true, 1000);
    const { text } = await buildBackup(a, { name: 'A' }, {});
    // later, more work on the same phone
    const later = Date.now() + 60_000;
    await answer(a, w.id, true, later);
    await a.updateWord(w.id, { meaning: 'newer edit' }, later);
    const before = { att: (await a.attemptsSince(0)).length, state: (await a.getStates())[0]! };

    const snap = parseBackup(text).snapshot;
    const first = await a.mergeSnapshot(snap);
    const second = await a.mergeSnapshot(snap);
    expect(first.attempts).toBe(0);
    expect(second).toEqual(first);
    expect((await a.attemptsSince(0)).length).toBe(before.att); // append-only: nothing added, nothing removed
    expect((await a.getStates())[0]).toEqual(before.state); // the newer progress was kept
    expect((await a.listWords()).find((x) => x.id === w.id)!.meaning).toBe('newer edit');
  });

  it('merges two phones: answers from both are kept', async () => {
    const a = await fresh(); const b = await fresh();
    await answer(a, 'kana:h:あ', true, 1000);
    await answer(b, 'kana:h:い', true, 2000);
    await b.mergeSnapshot(parseBackup((await buildBackup(a, { name: 'A' }, {})).text).snapshot);
    expect((await b.attemptsSince(0)).map((x) => x.wordId).sort()).toEqual(['kana:h:あ', 'kana:h:い']);
  });

  it('rejects bad files with a plain message and changes nothing', async () => {
    expect(() => parseBackup('not json')).toThrow(BackupError);
    expect(() => parseBackup('{"format":"other"}')).toThrow(/not a backup file/);
    expect(() => parseBackup(JSON.stringify({ format: 'japanese-book-backup', version: 99, data: {} }))).toThrow(/newer version/);
    expect(() => parseBackup(JSON.stringify({ format: 'japanese-book-backup', version: 1, data: { words: [] } }))).toThrow(/incomplete/);
    const a = await fresh(); await answer(a, 'kana:h:あ');
    const good = JSON.parse((await buildBackup(a, { name: 'A' }, {})).text);
    good.data.attempts[0].id = 5;
    expect(() => parseBackup(JSON.stringify(good))).toThrow(/damaged/);
  });
});
