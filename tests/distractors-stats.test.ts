import { describe, expect, it } from 'vitest';
import { mulberry32, nearMisses, pickDistractors } from '../src/domain/distractors';
import { confusionPairs, retention, skillAccuracy, streak } from '../src/domain/stats';
import { gradeTyped } from '../src/domain/grade';
import { blankWord } from '../src/data/repo';
import { DAY } from '../src/domain/scheduler';
import type { Attempt } from '../src/domain/types';

const NOW = new Date(2026, 10, 6, 10).getTime();
const att = (over: Partial<Attempt>): Attempt => ({
  id: Math.random().toString(), wordId: 'w', sessionId: 's', ts: NOW, exercise: 'spelling-type', skill: 'spelling', shown: '', expected: '', submitted: '',
  correct: false, firstTry: true, boxBefore: 3, responseMs: null, mistakes: [], options: null, appVersion: 't', deviceId: 'd', ...over,
});

describe('distractors', () => {
  it('produces near-miss spellings that differ by one meaningful mark', () => {
    const v = nearMisses('がくせい');
    expect(v).toContain('かくせい');
    expect(v).not.toContain('がくせい');
    expect(nearMisses('きって')).toContain('きつて');
  });
  it('fills options with near-misses first, unique and never the answer', () => {
    const pool = ['ちず', 'ざっし', 'みず', 'ほん', 'がっこう'];
    const o = pickDistractors('がくせい', pool, 3, mulberry32(1));
    expect(o).toHaveLength(3);
    expect(new Set(o).size).toBe(3);
    expect(o).not.toContain('がくせい');
    expect(nearMisses('がくせい')).toContain(o[0]);
  });
  it('is repeatable for a given seed', () => {
    const pool = ['ちず', 'ざっし', 'みず'];
    expect(pickDistractors('ほん', pool, 3, mulberry32(7))).toEqual(pickDistractors('ほん', pool, 3, mulberry32(7)));
  });
});

describe('stats', () => {
  const m = (e: string, g: string) => [{ kind: 'confusable' as const, expected: e, got: g, index: 0 }];
  it('reports a confusion only with enough evidence across enough words', () => {
    const few = [att({ wordId: 'a', mistakes: m('シ', 'ツ') }), att({ wordId: 'b', mistakes: m('シ', 'ツ') })];
    expect(confusionPairs(few)).toEqual([]);
    const sameWord = [1, 2, 3].map(() => att({ wordId: 'a', mistakes: m('シ', 'ツ') }));
    expect(confusionPairs(sameWord)).toEqual([]);
    const enough = [att({ wordId: 'a', mistakes: m('シ', 'ツ') }), att({ wordId: 'b', mistakes: m('シ', 'ツ') }), att({ wordId: 'a', mistakes: m('シ', 'ツ') })];
    expect(confusionPairs(enough)).toMatchObject([{ expected: 'シ', got: 'ツ', count: 3, words: 2 }]);
  });
  it('ignores script and spacing mistakes that say nothing about characters', () => {
    const a = [1, 2, 3].flatMap((i) => [att({ wordId: `w${i}`, mistakes: [{ kind: 'script', expected: 'ニ', got: 'に', index: 0 }] })]);
    expect(confusionPairs(a)).toEqual([]);
  });
  it('gives retention only with enough data', () => {
    const ok = Array.from({ length: 10 }, (_, i) => att({ correct: i < 8, boxBefore: 4 }));
    expect(retention(ok)).toBeCloseTo(0.8);
    expect(retention(ok.slice(0, 5))).toBeNull();
  });
  it('computes accuracy per skill only with enough tries', () => {
    const a = Array.from({ length: 5 }, (_, i) => att({ skill: 'reading', correct: i < 4 }));
    expect(skillAccuracy(a, NOW)).toEqual({ reading: 0.8 });
    expect(skillAccuracy(a.slice(0, 3), NOW)).toEqual({});
  });
  it('counts a streak from yesterday if today has no answers yet', () => {
    expect(streak([att({ ts: NOW - DAY }), att({ ts: NOW - 2 * DAY })], NOW)).toBe(2);
    expect(streak([att({ ts: NOW }), att({ ts: NOW - 2 * DAY })], NOW)).toBe(1);
    expect(streak([], NOW)).toBe(0);
  });
});

describe('gradeTyped', () => {
  const kanji = blankWord({ text: '弁護士', reading: 'べんごし', meaning: 'lawyer' }, 0);
  const loan = blankWord({ text: 'ニュース', reading: 'ニュース', meaning: 'news' }, 0);
  it('accepts a kanji word spelled in kana as a variant for spelling', () => {
    expect(gradeTyped(kanji, 'spelling', 'べんごし')).toMatchObject({ correct: true, variant: true });
    expect(gradeTyped(kanji, 'spelling', '弁護士')).toMatchObject({ correct: true, variant: false });
  });
  it('requires katakana for a loanword spelling but ignores script for reading', () => {
    expect(gradeTyped(loan, 'spelling', 'にゅーす').correct).toBe(false);
    expect(gradeTyped(loan, 'reading', 'にゅーす').correct).toBe(true);
  });
  it('does not accept romaji for reading', () => {
    expect(gradeTyped(kanji, 'reading', 'bengoshi').correct).toBe(false);
  });
});
