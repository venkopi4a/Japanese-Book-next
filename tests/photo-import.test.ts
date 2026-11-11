import { describe, expect, it } from 'vitest';
import { openDB } from 'idb';
import { dbName, openUserDb } from '../src/data/db';
import { Repo, blankWord } from '../src/data/repo';
import { buildReview, confirmItem, editItem, manualItem, parseRecognition, readyToSave, refreshDuplicates, removeItem, summarise } from '../src/import/review';
import { placeholderRecogniser, recogniseAll, type Recogniser } from '../src/recognise/provider';

let n = 0;
const fresh = async () => new Repo(await openUserDb(dbName('p' + n++, 'u')));
const E = (text: string, reading: string, meaning: string, confidence = 'high', extra = {}) => ({ text, reading, meaning, confidence, ...extra });

describe('database upgrade', () => {
  it('upgrades a version 1 database without touching existing data', async () => {
    const name = dbName('upgrade', 'u');
    const old = await openDB(name, 1, { upgrade(db) { db.createObjectStore('words', { keyPath: 'id' }); db.createObjectStore('skillStates', { keyPath: ['wordId', 'skill'] }); db.createObjectStore('attempts', { keyPath: 'id' }); db.createObjectStore('sessions', { keyPath: 'id' }); db.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true }); db.createObjectStore('meta'); } });
    await old.put('words', { ...blankWord({ text: '猫', reading: 'ねこ', meaning: 'cat' }, 1), id: 'keep-me' });
    old.close();
    const repo = new Repo(await openUserDb(name));
    expect((await repo.listWords()).map((w) => w.id)).toEqual(['keep-me']);
    await repo.savePhotos([{ id: 'p', blob: new Blob(['x']), width: 1, height: 1 }]);
    expect(await repo.getPhoto('p')).toBeTruthy();
  });
});

describe('review changes', () => {
  const existing = [blankWord({ text: '学生', reading: 'がくせい', meaning: 'student' }, 0)];
  it('starts a duplicate as duplicate and returns an edited one to needs-check, never straight to confirmed', () => {
    let items = buildReview(parseRecognition({ entries: [E('学生', 'がくせい', 'student')] }).entries, existing);
    expect(items[0]!.status).toBe('duplicate');
    items = refreshDuplicates(items.map((i) => editItem(i, { text: '先生', reading: 'せんせい', meaning: 'teacher' })), existing);
    expect(items[0]!.status).toBe('needs-check');
    expect(items[0]!.reasons[0]).toMatch(/Edited/);
    expect(readyToSave(items).save).toHaveLength(0);
  });
  it('turns an item into a duplicate when it is edited to match another in the batch', () => {
    let items = buildReview(parseRecognition({ entries: [E('猫', 'ねこ', 'cat'), E('犬', 'いぬ', 'dog')] }).entries, []);
    items = refreshDuplicates(items.map((i) => (i.key === 'r1' ? editItem(i, { text: '猫', reading: 'ねこ' }) : i)), []);
    expect(items.map((i) => i.status)).toEqual(['confirmed', 'duplicate']);
  });
  it('a word typed in by hand is confirmed, and is still checked for duplicates', () => {
    const items = refreshDuplicates([manualItem('m1', { text: '学生', reading: 'がくせい', meaning: 'student' }), manualItem('m2', { text: '犬', reading: 'いぬ', meaning: 'dog' })], existing);
    expect(items.map((i) => i.status)).toEqual(['duplicate', 'confirmed']);
  });
  it('summarises what will happen', () => {
    const items = buildReview(parseRecognition({ entries: [E('猫', 'ねこ', 'cat'), E('学生', 'がくせい', 'student'), E('犬', 'いぬ', 'dog', 'low'), E('鳥', 'とり', 'bird')] }).entries, existing);
    const list = [...items.slice(0, 3), removeItem(items[3]!)];
    expect(summarise(list)).toEqual({ ready: 1, needsCheck: 1, duplicates: 1, removed: 1 });
    expect(summarise(list.map((i) => (i.key === 'r2' ? confirmItem(i) : i))).ready).toBe(2);
  });
  it('keeps the photo number and ignores a nonsense one', () => {
    const { entries } = parseRecognition({ entries: [{ ...E('猫', 'ねこ', 'cat'), photo: 2 }, { ...E('犬', 'いぬ', 'dog'), photo: -1 }, { ...E('鳥', 'とり', 'bird'), photo: 'x' }] });
    expect(entries.map((e) => e.photo)).toEqual([2, null, null]);
  });
});

describe('saving a reviewed batch', () => {
  it('saves only confirmed items, without duplicates, linked to their photos', async () => {
    const repo = await fresh();
    await repo.addWords([{ text: '学生', reading: 'がくせい', meaning: 'student' }]);
    const entries = parseRecognition({ entries: [{ ...E('猫', 'ねこ', 'cat'), photo: 0 }, { ...E('学生', 'がくせい', 'student'), photo: 0 }, { ...E('犬', 'いぬ', 'dog', 'low'), photo: 1 }, { ...E('鳥', 'とり', 'bird'), photo: 1 }] }).entries;
    let items = buildReview(entries, await repo.listWords());
    items = items.map((i) => (i.key === 'r3' ? removeItem(i) : i));
    const { added, skipped } = await repo.addPhotoBatch(items, { topic: 'Animals', unit: 'Unit 4', photoIds: ['photo-a', 'photo-b'] });
    expect(added.map((w) => w.text)).toEqual(['猫']);
    expect(skipped).toEqual([]);
    expect(added[0]).toMatchObject({ topic: 'Animals', unit: 'Unit 4', source: 'photo', photoId: 'photo-a' });
    expect(await repo.listWords()).toHaveLength(2); // the uncertain 犬 was not saved
  });
  it('checks again at save time, so a word added meanwhile is not duplicated', async () => {
    const repo = await fresh();
    const items = buildReview(parseRecognition({ entries: [E('猫', 'ねこ', 'cat')] }).entries, []);
    await repo.addWords([{ text: '猫', reading: 'ねこ', meaning: 'cat' }]); // added by hand during the review
    const { added, skipped } = await repo.addPhotoBatch(items, { topic: null, unit: null, photoIds: [] });
    expect(added).toEqual([]);
    expect(skipped).toHaveLength(1);
    expect(await repo.listWords()).toHaveLength(1);
  });
  it('keeps and clears the draft', async () => {
    const repo = await fresh();
    await repo.saveDraft({ photos: [{ id: 'a', blob: new Blob(['x']), width: 2, height: 3 }], items: [], topic: 'T', unit: '', savedAt: 1 });
    expect((await repo.loadDraft())?.topic).toBe('T');
    await repo.clearDraft();
    expect(await repo.loadDraft()).toBeUndefined();
  });
});

describe('recognition providers', () => {
  const photo = (index: number) => ({ blob: new Blob(['x']), index, width: 1, height: 1 });
  it('placeholder returns clearly labelled sample words and says it is a placeholder', async () => {
    expect(placeholderRecogniser.isPlaceholder).toBe(true);
    const r = await recogniseAll([photo(0)], placeholderRecogniser);
    expect(r.entries.length).toBeGreaterThan(3);
    expect(r.entries.every((e) => e.photo === 0)).toBe(true);
  });
  it('validates whatever a provider returns, tags photos, and survives one photo failing', async () => {
    const flaky: Recogniser = { id: 'f', label: 'f', isPlaceholder: false, async recognise(p) { if (p.index === 1) throw new Error('boom'); return { entries: [E('猫', 'ねこ', 'cat'), { text: '' }, 5] }; } };
    const r = await recogniseAll([photo(0), photo(1), photo(2)], flaky);
    expect(r.failed).toEqual([1]);
    expect(r.entries.map((e) => e.photo)).toEqual([0, 2]);
  });
  it('can be cancelled', async () => {
    const ctl = new AbortController();
    const p = recogniseAll([photo(0)], placeholderRecogniser, { signal: ctl.signal });
    setTimeout(() => ctl.abort(), 20);
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  });
});
