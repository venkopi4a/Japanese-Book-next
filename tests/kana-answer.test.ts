import { describe, expect, it } from 'vitest';
import { normaliseAnswer, toHiragana, toKatakana } from '../src/domain/kana';
import { checkTyped, diffAnswer } from '../src/domain/answer';

describe('normalisation keeps meaningful distinctions', () => {
  it('keeps dakuten and handakuten', () => {
    const forms = ['か', 'が', 'は', 'ば', 'ぱ', 'つ', 'づ'].map(normaliseAnswer);
    expect(new Set(forms).size).toBe(7);
  });
  it('composes separate marks into the same character', () => {
    expect(normaliseAnswer('か\u3099')).toBe('が');
    expect(normaliseAnswer('は\u309a')).toBe('ぱ');
  });
  it('converts half-width katakana and strips spaces and trailing punctuation', () => {
    expect(normaliseAnswer('ﾆｭｰｽ')).toBe('ニュース');
    expect(normaliseAnswer(' がく せい。 ')).toBe('がくせい');
  });
  it('converts between scripts', () => {
    expect(toHiragana('ニュース')).toBe('にゅーす');
    expect(toKatakana('がくせい')).toBe('ガクセイ');
  });
});

describe('checkTyped', () => {
  it('accepts the exact spelling', () => {
    expect(checkTyped(['がくせい'], 'がくせい').correct).toBe(true);
  });
  it('rejects a missing dakuten and says so', () => {
    const r = checkTyped(['がくせい'], 'かくせい');
    expect(r.correct).toBe(false);
    expect(r.mistakes).toEqual([{ kind: 'dakuten', expected: 'が', got: 'か', index: 0 }]);
  });
  it('tells dakuten from handakuten', () => {
    expect(checkTyped(['ぱん'], 'はん').mistakes[0]!.kind).toBe('handakuten');
    expect(checkTyped(['ばん'], 'ぱん').mistakes[0]!.kind).toBe('handakuten');
    expect(checkTyped(['づく'], 'つく').mistakes[0]!.kind).toBe('dakuten');
  });
  it('never accepts romaji', () => {
    expect(checkTyped(['がくせい'], 'gakusei').correct).toBe(false);
  });
  it('treats hiragana for a katakana word as wrong when script matters, right when it does not', () => {
    expect(checkTyped(['ニュース'], 'にゅーす').mistakes.every((m) => m.kind === 'script')).toBe(true);
    expect(checkTyped(['ニュース'], 'にゅーす').correct).toBe(false);
    expect(checkTyped(['ニュース'], 'にゅーす', { scriptSensitive: false }).correct).toBe(true);
  });
  it('accepts variants and reports them as variants', () => {
    const r = checkTyped(['弁護士', 'べんごし'], 'べんごし');
    expect(r.correct).toBe(true);
    expect(r.variant).toBe(true);
  });
  it('classifies small kana, long vowels, look-alikes, missing and extra characters', () => {
    expect(checkTyped(['きって'], 'きつて').mistakes[0]!.kind).toBe('small-kana');
    expect(checkTyped(['おおきい'], 'おうきい').mistakes[0]!.kind).toBe('long-vowel');
    expect(checkTyped(['ラーメン'], 'ラメン').mistakes[0]!.kind).toBe('missing');
    expect(checkTyped(['ラーメン'], 'ラーーメン').mistakes[0]!.kind).toBe('extra');
    expect(checkTyped(['シ'], 'ツ').mistakes[0]!.kind).toBe('confusable');
    expect(checkTyped(['さかな'], 'ちかな').mistakes[0]!.kind).toBe('confusable');
    expect(checkTyped(['あか'], 'あま').mistakes[0]!.kind).toBe('substitution');
  });
  it('treats a blank answer as wrong with no invented diagnosis', () => {
    const r = checkTyped(['ちず'], '   ');
    expect(r.correct).toBe(false);
    expect(r.mistakes).toEqual([]);
  });
  it('explains against the nearest accepted form', () => {
    const r = checkTyped(['弁護士', 'べんごし'], 'へんごし');
    expect(r.closest).toBe('べんごし');
    expect(r.mistakes).toEqual([{ kind: 'dakuten', expected: 'べ', got: 'へ', index: 0 }]);
  });
  it('diffAnswer is empty for equal strings', () => {
    expect(diffAnswer('ちず', 'ちず')).toEqual([]);
  });
});

import { checkRomaji, previewKana } from '../src/domain/romaji';
import { unlockedSkills } from '../src/domain/session';
import { blankWord } from '../src/data/repo';
import type { Skill, SkillState } from '../src/domain/types';

describe('beginner romaji mode (reading only)', () => {
  it('accepts common romaji spellings of a reading', () => {
    expect(checkRomaji('べんごし', 'bengoshi').correct).toBe(true);
    expect(checkRomaji('つくえ', 'tukue').correct).toBe(true);
    expect(checkRomaji('つくえ', 'tsukue').correct).toBe(true);
    expect(checkRomaji('おおきい', 'ookii').correct).toBe(true);
    expect(checkRomaji('がっこう', 'gakkou').correct).toBe(true);
  });
  it('accepts a macron for either long-vowel spelling, and katakana long vowels', () => {
    expect(checkRomaji('こうこう', 'kōkō').correct).toBe(true);
    expect(checkRomaji('ニュース', 'nyuusu').correct).toBe(true);
    expect(checkRomaji('ニュース', 'nyu-su').correct).toBe(true);
  });
  it('still rejects real mistakes and explains them', () => {
    const r = checkRomaji('がくせい', 'kakusei');
    expect(r.correct).toBe(false);
    expect(r.mistakes[0]!.kind).toBe('dakuten');
    expect(checkRomaji('がくせい', '').correct).toBe(false);
  });
  it('previews the kana as you type', () => {
    expect(previewKana('gaku')).toBe('がく');
  });
  it('gives kana-only words a reading skill only in romaji mode', () => {
    const w = blankWord({ text: 'ちず', reading: 'ちず', meaning: 'map' }, 0);
    const m = new Map<Skill, SkillState>([['recognition', { wordId: w.id, skill: 'recognition', box: 2, dueAt: 0, correct: 0, lapses: 0, introducedAt: 0, lastAt: null, lastCorrect: null }]]);
    expect(unlockedSkills(w, m)).not.toContain('reading');
    expect(unlockedSkills(w, m, true)).toContain('reading');
  });
});

describe('wild guesses are not diagnosed', () => {
  it('gives no per-character diagnosis for an answer that is nothing like the target', () => {
    expect(checkTyped(['弁護士'], 'x').mistakes).toEqual([]);
    expect(checkTyped(['べんごし'], 'ねこ').mistakes).toEqual([]);
    expect(checkRomaji('べんごし', 'neko').mistakes).toEqual([]);
  });
  it('still diagnoses a near miss', () => {
    expect(checkTyped(['べんごし'], 'へんごし').mistakes).toHaveLength(1);
  });
});
