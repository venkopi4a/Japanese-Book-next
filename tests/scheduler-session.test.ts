import { describe, expect, it } from 'vitest';
import { DAY, applyAnswer, isDue, masteryOf, newState, reasonFor } from '../src/domain/scheduler';
import { planMistakes, planToday, planWeak, unlockedSkills } from '../src/domain/session';
import { blankWord } from '../src/data/repo';
import type { Attempt, Skill, SkillState } from '../src/domain/types';

const NOW = new Date(2026, 10, 6, 10, 0, 0).getTime();
const word = (text: string, reading: string, at = 0) => blankWord({ text, reading, meaning: 'x' }, at);
const st = (wordId: string, skill: Skill, over: Partial<SkillState> = {}): SkillState => ({ ...newState(wordId, skill, NOW - 5 * DAY), ...over });
const att = (over: Partial<Attempt>): Attempt => ({
  id: Math.random().toString(), wordId: 'w', sessionId: 's', ts: NOW, exercise: 'meaning-mc', skill: 'recognition', shown: '', expected: '', submitted: '',
  correct: true, firstTry: true, boxBefore: 0, responseMs: null, mistakes: [], options: null, appVersion: 't', deviceId: 'd', ...over,
});

describe('scheduler', () => {
  it('moves up on a correct first try and schedules by interval', () => {
    const s = applyAnswer(newState('w', 'recognition', NOW), true, true, NOW);
    expect(s.box).toBe(1); expect(s.correct).toBe(1); expect(s.dueAt).toBe(NOW + DAY);
  });
  it('sends a wrong answer to box 0, due now, and counts the lapse', () => {
    const s = applyAnswer({ ...newState('w', 'recognition', NOW), box: 4, correct: 3 }, false, true, NOW);
    expect(s).toMatchObject({ box: 0, dueAt: NOW, lapses: 1, lastCorrect: false });
  });
  it('a correct retry moves the box but does not count as knowing it', () => {
    const missed = applyAnswer(newState('w', 'recognition', NOW), false, true, NOW);
    const retry = applyAnswer(missed, true, false, NOW);
    expect(retry.box).toBe(1); expect(retry.correct).toBe(0);
  });
  it('caps at the top box', () => {
    expect(applyAnswer({ ...newState('w', 'recognition', NOW), box: 6 }, true, true, NOW).box).toBe(6);
  });
  it('treats anything due by the end of today as due', () => {
    expect(isDue(st('w', 'recognition', { dueAt: new Date(2026, 10, 6, 20).getTime() }), NOW)).toBe(true);
    expect(isDue(st('w', 'recognition', { dueAt: new Date(2026, 10, 7, 1).getTime() }), NOW)).toBe(false);
  });
  it('gives a plain reason', () => {
    expect(reasonFor(st('w', 'recognition', { lastCorrect: false }), NOW)).toMatch(/missed/);
    expect(reasonFor(st('w', 'recognition', { dueAt: NOW - 3 * DAY }), NOW)).toBe('Overdue by 3 days');
  });
  it('grades mastery', () => {
    expect(masteryOf([])).toBe('new');
    expect(masteryOf([st('w', 'recognition', { box: 4 }), st('w', 'recall', { box: 3 })])).toBe('known');
    expect(masteryOf([st('w', 'recognition', { box: 4 }), st('w', 'recall', { box: 1 })])).toBe('learning');
  });
});

describe('skills unlock gradually', () => {
  const kanji = word('学生', 'がくせい'), kana = word('ちず', 'ちず');
  it('offers only recognition to a new word', () => {
    expect(unlockedSkills(kanji, new Map())).toEqual(['recognition']);
  });
  it('unlocks recall, listening and reading once recognition is at box 2', () => {
    const m = new Map<Skill, SkillState>([['recognition', st(kanji.id, 'recognition', { box: 2 })]]);
    expect(unlockedSkills(kanji, m)).toEqual(['recognition', 'recall', 'listening', 'reading']);
  });
  it('skips reading for kana-only words and unlocks spelling after recall', () => {
    const m = new Map<Skill, SkillState>([['recognition', st(kana.id, 'recognition', { box: 2 })], ['recall', st(kana.id, 'recall', { box: 2 })]]);
    expect(unlockedSkills(kana, m)).toEqual(['recognition', 'recall', 'listening', 'spelling']);
  });
});

describe('planToday', () => {
  const words = Array.from({ length: 15 }, (_, i) => word(`語${i}`, `ご${i}`, i));
  it('introduces at most the daily limit of new words', () => {
    expect(planToday(words, [], { now: NOW }).news).toHaveLength(10);
    expect(planToday(words, [], { now: NOW, newLimit: 4 }).news).toHaveLength(4);
  });
  it('subtracts words already introduced today', () => {
    expect(planToday(words, [], { now: NOW, introducedToday: 8 }).news).toHaveLength(2);
    expect(planToday(words, [], { now: NOW, introducedToday: 12 }).news).toHaveLength(0);
  });
  it('puts the most overdue reviews first and caps the review count', () => {
    const states = [
      st(words[0]!.id, 'recognition', { dueAt: NOW - 1 * DAY, box: 1 }),
      st(words[1]!.id, 'recognition', { dueAt: NOW - 6 * DAY, box: 1 }),
      st(words[2]!.id, 'recognition', { dueAt: NOW - 3 * DAY, box: 1 }),
    ];
    const p = planToday(words, states, { now: NOW, reviewLimit: 2 });
    expect(p.reviews.map((r) => r.wordId)).toEqual([words[1]!.id, words[2]!.id]);
    expect(p).toMatchObject({ overdue: 3, deferred: 1 });
  });
  it('does not offer a future review, and skips deleted words', () => {
    const w = word('語', 'ご');
    const future = st(w.id, 'recognition', { dueAt: NOW + 3 * DAY });
    expect(planToday([w], [future], { now: NOW }).reviews).toEqual([]);
    expect(planToday([{ ...w, deletedAt: 1 }], [], { now: NOW }).news).toEqual([]);
  });
});

describe('weak and mistakes plans', () => {
  it('flags repeated lapses at a low box', () => {
    const items = planWeak([st('a', 'recall', { lapses: 3, box: 1 }), st('b', 'recall', { lapses: 1, box: 1 })], []);
    expect(items.map((i) => i.wordId)).toEqual(['a']);
  });
  it('flags a poor recent record only with enough evidence', () => {
    const states = [st('a', 'reading', { box: 3 })];
    const two = [att({ wordId: 'a', skill: 'reading', correct: false }), att({ wordId: 'a', skill: 'reading', correct: false })];
    expect(planWeak(states, two)).toEqual([]);
    expect(planWeak(states, [...two, att({ wordId: 'a', skill: 'reading', correct: false })])).toHaveLength(1);
  });
  it('lists skills whose latest answer in the window was not a clean first try', () => {
    const a = [att({ wordId: 'a', ts: NOW - 100, correct: false }), att({ wordId: 'a', ts: NOW - 50, correct: true, firstTry: true }), att({ wordId: 'b', ts: NOW, correct: false })];
    expect(planMistakes(a, NOW - 1000).map((i) => i.wordId)).toEqual(['b']);
  });
});
