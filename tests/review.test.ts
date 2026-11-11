import { describe, expect, it } from 'vitest';
import { buildReview, confirmItem, editItem, parseRecognition, readyToSave, removeItem, MAX_ENTRIES } from '../src/import/review';
import { blankWord } from '../src/data/repo';

const good = { text: '弁護士', reading: 'べんごし', meaning: 'lawyer', confidence: 'high' };

describe('parseRecognition', () => {
  it('rejects results without entries', () => {
    expect(parseRecognition(null).entries).toEqual([]);
    expect(parseRecognition({ entries: 'x' }).warnings.length).toBe(1);
  });
  it('treats a missing or unknown confidence as low, never high', () => {
    const { entries } = parseRecognition({ entries: [{ text: '猫', reading: 'ねこ', meaning: 'cat' }, { ...good, confidence: 'certain' }] });
    expect(entries.map((e) => e.confidence)).toEqual(['low', 'low']);
  });
  it('cleans and caps text and drops entries with no text', () => {
    const { entries } = parseRecognition({ entries: [{ text: '  猫\n\u0000 ', reading: 'ねこ', meaning: 'x'.repeat(500), confidence: 'high' }, { text: '', meaning: 'nothing' }, 7] });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.text).toBe('猫');
    expect(entries[0]!.meaning).toHaveLength(200);
  });
  it('limits the number of entries', () => {
    const many = Array.from({ length: MAX_ENTRIES + 20 }, (_, i) => ({ ...good, text: `語${i}` }));
    const r = parseRecognition({ entries: many });
    expect(r.entries).toHaveLength(MAX_ENTRIES);
    expect(r.warnings.length).toBe(1);
  });
});

describe('review', () => {
  const existing = [blankWord({ text: '学生', reading: 'がくせい', meaning: 'student' }, 0)];
  const items = () => buildReview(parseRecognition({ entries: [
    good,
    { text: '地図', reading: 'ちず', meaning: 'map', confidence: 'medium', issues: ['Second character unclear'] },
    { text: '学生', reading: 'がくせい', meaning: 'student', confidence: 'high' },
    { text: '弁護士', reading: 'べんごし', meaning: 'lawyer', confidence: 'high' },
    { text: '本', reading: 'hon', meaning: 'book', confidence: 'high' },
    { text: '猫', reading: 'ねこ', meaning: '', confidence: 'high' },
  ] }).entries, existing);

  it('confirms only clear entries and flags the rest', () => {
    expect(items().map((i) => i.status)).toEqual(['confirmed', 'needs-check', 'duplicate', 'duplicate', 'needs-check', 'needs-check']);
  });
  it('finds duplicates against the notebook and inside the batch', () => {
    const [, , inNotebook, inBatch] = items();
    expect(inNotebook!.duplicateOf).toBe(existing[0]!.id);
    expect(inBatch!.duplicateOf).toBe('batch:0');
  });
  it('never saves an uncertain entry until it is confirmed, and editing does not confirm', () => {
    let list = items();
    expect(readyToSave(list).save).toHaveLength(1);
    expect(readyToSave(list).blocked).toHaveLength(3);
    list = list.map((i) => (i.key === 'r1' ? editItem(i, { meaning: 'map (of a city)' }) : i));
    expect(readyToSave(list).save).toHaveLength(1);
    list = list.map((i) => (i.key === 'r1' ? confirmItem(i) : i));
    expect(readyToSave(list).save.map((i) => i.entry.text)).toEqual(['弁護士', '地図']);
  });
  it('refuses to save a confirmed entry that still lacks a meaning or reading', () => {
    const list = items().map((i) => (i.key === 'r5' ? confirmItem(i) : i));
    expect(readyToSave(list).save.map((i) => i.entry.text)).not.toContain('猫');
  });
  it('removed items are neither saved nor blocking', () => {
    const list = items().map((i) => (i.key === 'r4' ? removeItem(i) : i));
    expect(readyToSave(list).blocked.map((i) => i.key)).toEqual(['r1', 'r5']);
  });
});
