import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/domain/distractors';
import { KANA, KANA_ROWS, kanaOf, isKanaId } from '../src/domain/kanaCourse';
import { STRUGGLE_LIMIT, kanaIntroducedToday, kanaQuestion, learnedKana, lessonStatuses, lessonSteps, planKana, scriptDone } from '../src/domain/kanaPlan';
import { DAY, newState } from '../src/domain/scheduler';
import type { SkillState } from '../src/domain/types';

const NOW = new Date(2026, 10, 11, 10).getTime();
const st = (id: string, p: Partial<SkillState> = {}, skill: SkillState['skill'] = 'recognition'): SkillState => ({ ...newState(id, skill, NOW - 3 * DAY), ...p });
const hira = kanaOf('hiragana');

describe('kana course', () => {
  it('has 104 hiragana and 104 katakana: 46 basic, 25 voiced, 33 combinations each', () => {
    for (const s of ['hiragana', 'katakana'] as const) {
      const k = kanaOf(s);
      expect(k).toHaveLength(104);
      expect(k.filter((x) => x.stage === 'basic')).toHaveLength(46);
      expect(k.filter((x) => x.stage === 'voiced')).toHaveLength(25);
      expect(k.filter((x) => x.stage === 'combo')).toHaveLength(33);
    }
    expect(new Set(KANA.map((k) => k.id)).size).toBe(KANA.length);
    expect(KANA.every((k) => isKanaId(k.id) && k.romaji && k.hint)).toBe(true);
  });
  it('starts with あいうえお, then か row, and katakana only after all hiragana', () => {
    expect(KANA_ROWS[0]!.chars.map((c) => c.char).join('')).toBe('あいうえお');
    expect(KANA_ROWS[1]!.chars.map((c) => c.romaji)).toEqual(['ka', 'ki', 'ku', 'ke', 'ko']);
    const firstKata = KANA.findIndex((k) => k.script === 'katakana');
    expect(KANA.slice(0, firstKata).every((k) => k.script === 'hiragana')).toBe(true);
    expect(KANA[firstKata]!.char).toBe('ア');
  });
  it('uses standard Hepburn romaji for the tricky ones', () => {
    const r = (c: string) => KANA.find((k) => k.char === c)!.romaji;
    expect([r('し'), r('ち'), r('つ'), r('ふ'), r('を'), r('ん'), r('じゃ'), r('シ')]).toEqual(['shi', 'chi', 'tsu', 'fu', 'wo', 'n', 'ja', 'shi']);
  });
});

describe('kana plan: short lessons that resume', () => {
  const ans = (id: string, p: Partial<SkillState> = {}, skill: SkillState['skill'] = 'recognition') => st(id, { lastAt: NOW - DAY, lastCorrect: true, box: 1, dueAt: NOW + DAY, ...p }, skill);
  it('a lesson is one row: a beginner starts with あ い う え お', () => {
    const p = planKana([], { now: NOW, newLimit: 15 });
    expect(p.lesson?.row.label).toBe('あ い う え お');
    expect(p.lesson).toMatchObject({ index: 0, total: KANA_ROWS.length, done: 0, started: false });
    expect(p.goal).toBe(3);
    expect(p.reviews).toHaveLength(0);
  });
  it('listening for a kana starts in reviews once its sight question was answered', () => {
    const k = hira[0]!.id;
    const shownOnly = [st(k, { dueAt: NOW - 1 }), st(k, { dueAt: NOW - 1 }, 'listening')];
    expect(planKana(shownOnly, { now: NOW }).reviews).toHaveLength(0);
    const answeredSight = [ans(k), st(k, { dueAt: NOW - 1 }, 'listening')];
    expect(planKana(answeredSight, { now: NOW }).reviews).toEqual([{ kanaId: k, skill: 'listening', reason: 'First time by ear', promote: true }]);
  });
  it('a lesson left halfway is continued, and kana only seen on a card are not reviews yet', () => {
    const states = [ans(hira[0]!.id), ans(hira[1]!.id), st(hira[2]!.id, { dueAt: NOW - 1 })]; // う was shown but never answered
    const p = planKana(states, { now: NOW });
    expect(p.lesson?.row.label).toBe('あ い う え お');
    expect(p.lesson).toMatchObject({ done: 2, started: true });
    expect(p.reviews.map((r) => r.kanaId)).not.toContain(hira[2]!.id);
  });
  it('finished lessons count towards the daily goal; the goal never locks the next lesson', () => {
    const today = KANA_ROWS.slice(0, 3).flatMap((r) => r.chars.map((k) => ans(k.id, { introducedAt: NOW - 1000 })));
    expect(kanaIntroducedToday(today, NOW)).toBe(15);
    const p = planKana(today, { now: NOW, newLimit: 15 });
    expect(p.lessonsToday).toBe(3);
    expect(p.goalReached).toBe(true);
    expect(p.lesson?.row.label).toBe('た ち つ て と');
  });
  it('lesson statuses: done, then one current, then locked; strength grows with the boxes', () => {
    const states = [...KANA_ROWS[0]!.chars.map((k) => ans(k.id, { box: 4 })), ...KANA_ROWS[1]!.chars.map((k) => ans(k.id, { box: 1 }))];
    const l = lessonStatuses(states);
    expect(l.slice(0, 4).map((x) => x.status)).toEqual(['done', 'done', 'current', 'locked']);
    expect(l[0]!.strength).toBe(3);
    expect(l[1]!.strength).toBe(1);
  });
  it('due kana come back as reviews with a reason', () => {
    const p = planKana([ans(hira[0]!.id, { dueAt: NOW - DAY })], { now: NOW });
    expect(p.reviews).toEqual([{ kanaId: hira[0]!.id, skill: 'recognition', reason: 'Overdue by 1 day', promote: true }]);
  });
  it(`recommends reviewing first when ${STRUGGLE_LIMIT} or more answered kana are back at box 0`, () => {
    const missed = hira.slice(0, STRUGGLE_LIMIT).map((k) => ans(k.id, { box: 0, dueAt: NOW, lastCorrect: false }));
    expect(planKana(missed, { now: NOW }).held).toBe(true);
    const onlyShown = hira.slice(0, STRUGGLE_LIMIT).map((k) => st(k.id)); // shown on cards, never answered: not struggling
    expect(planKana(onlyShown, { now: NOW }).held).toBe(false);
  });
  it('hiragana is done once every hiragana has been answered right after its lesson', () => {
    const almost = hira.slice(1).map((k) => st(k.id, { box: 1 }));
    expect(learnedKana(almost, 'hiragana')).toBe(103);
    expect(scriptDone(almost, 'hiragana')).toBe(false);
    expect(scriptDone([...almost, st(hira[0]!.id, { box: 0 })], 'hiragana')).toBe(false);
    expect(scriptDone([...almost, st(hira[0]!.id, { box: 2 })], 'hiragana')).toBe(true);
    expect(scriptDone([...almost, st(hira[0]!.id, { box: 2 })], 'katakana')).toBe(false);
  });
});

describe('lesson steps', () => {
  const row = KANA_ROWS[1]!; // か き く け こ
  const opts = (canHear = true) => ({ canHear, now: NOW, rng: mulberry32(7) });
  it('teaches each kana then checks it straight away, then a matching game: 11 steps', () => {
    const s = lessonSteps(row, [], opts());
    expect(s.map((x) => x.kind)).toEqual(['learn', 'quiz', 'learn', 'quiz', 'learn', 'quiz', 'learn', 'quiz', 'learn', 'quiz', 'match']);
    expect(s.some((x) => x.kind === 'quiz' && x.skill === 'listening')).toBe(false); // listening starts in tomorrow's review
  });
  it('resuming skips kana already answered, so nothing is repeated', () => {
    const states = row.chars.slice(0, 3).flatMap((k) => [st(k.id, { lastAt: NOW, box: 1 }), st(k.id, { lastAt: NOW, box: 1 }, 'listening')]);
    const s = lessonSteps(row, states, opts());
    expect(s.filter((x) => x.kind === 'learn').map((x) => (x as { kana: { char: string } }).kana.char)).toEqual(['け', 'こ']);
    expect(s.filter((x) => x.kind === 'quiz')).toHaveLength(2);
  });
  it('continuing a lesson retries the kana of that row that were missed before leaving', () => {
    const states = [st(row.chars[0]!.id, { lastAt: NOW, box: 0, lastCorrect: false })];
    const retry = lessonSteps(row, states, opts()).filter((x) => x.kind === 'quiz' && x.reason === 'Missed earlier');
    expect(retry).toHaveLength(1);
    expect((retry[0] as { kana: { char: string } }).kana.char).toBe('か');
  });
  it('a finished lesson becomes practice that only moves the schedule for due kana', () => {
    const states = row.chars.flatMap((k, i) => [st(k.id, { lastAt: NOW - DAY, box: 2, dueAt: i === 0 ? NOW - DAY : NOW + 3 * DAY }), st(k.id, { lastAt: NOW - DAY, box: 2, dueAt: NOW + 3 * DAY }, 'listening')]);
    const s = lessonSteps(row, states, opts());
    const quiz = s.filter((x) => x.kind === 'quiz') as { kana: { char: string }; promote: boolean; lesson: boolean; skill: string }[];
    expect(quiz).toHaveLength(10);
    expect(quiz.every((q) => !q.lesson)).toBe(true);
    expect(quiz.filter((q) => q.promote).map((q) => q.kana.char + q.skill)).toEqual(['かrecognition']);
  });
  it('three-kana rows (や ゆ よ) also end with the matching game', () => {
    expect(lessonSteps(KANA_ROWS.find((r) => r.chars.length === 3)!, [], opts()).at(-1)?.kind).toBe('match');
  });
});

describe('kana questions', () => {
  it('options never include a different kana with the same sound (じ and ぢ)', () => {
    const ji = KANA.find((k) => k.char === 'じ')!;
    const all = new Set(hira.map((k) => k.id));
    for (let seed = 1; seed < 40; seed++) {
      const q1 = kanaQuestion(ji, 'recognition', all, mulberry32(seed));
      expect(q1.options.filter((o) => o === 'ji')).toHaveLength(1);
      const q2 = kanaQuestion(ji, 'listening', all, mulberry32(seed));
      expect(q2.options).not.toContain('ぢ');
      expect(q2.options).toContain('じ');
    }
  });
  it('wrong options come from kana already met when there are enough', () => {
    const met = new Set(hira.slice(0, 10).map((k) => k.id));
    const ka = hira[5]!;
    for (let seed = 1; seed < 30; seed++) {
      const q = kanaQuestion(ka, 'listening', met, mulberry32(seed));
      expect(q.options).toHaveLength(4);
      expect(q.options.every((o) => hira.slice(0, 10).some((k) => k.char === o))).toBe(true);
      const r = kanaQuestion(ka, 'recognition', met, mulberry32(seed));
      expect(r.options).toHaveLength(4);
      expect(r.options).toContain('ka');
    }
  });
  it('the very first lesson still gets four options', () => {
    const q = kanaQuestion(hira[0]!, 'recognition', new Set([hira[0]!.id]), mulberry32(3));
    expect(q.options).toHaveLength(4);
    expect(new Set(q.options).size).toBe(4);
  });
});
