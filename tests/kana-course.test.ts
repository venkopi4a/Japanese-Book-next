import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/domain/distractors';
import { KANA, KANA_ROWS, kanaOf, isKanaId } from '../src/domain/kanaCourse';
import { STRUGGLE_LIMIT, kanaIntroducedToday, kanaQuestion, learnedKana, planKana, scriptDone } from '../src/domain/kanaPlan';
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

describe('kana plan', () => {
  it('a beginner gets whole rows up to the daily limit', () => {
    const p = planKana([], { now: NOW, newLimit: 15 });
    expect(p.newRows.map((r) => r.label)).toEqual(['あ い う え お', 'か き く け こ', 'さ し す せ そ']);
    expect(p.reviews).toHaveLength(0);
    expect(planKana([], { now: NOW, newLimit: 12 }).newRows).toHaveLength(2); // never half a row
    expect(planKana([], { now: NOW, newLimit: 3 }).newRows).toHaveLength(1); // but always at least one row when there is room
  });
  it('counts kana introduced today against the limit and skips rows already started', () => {
    const today = hira.slice(0, 5).map((k) => st(k.id, { introducedAt: NOW - 1000, box: 1, dueAt: NOW + DAY }));
    expect(kanaIntroducedToday(today, NOW)).toBe(5);
    const p = planKana(today, { now: NOW, newLimit: 15, introducedToday: 5 });
    expect(p.newRows.map((r) => r.label)).toEqual(['か き く け こ', 'さ し す せ そ']);
  });
  it('due kana come back as reviews with a reason', () => {
    const p = planKana([st(hira[0]!.id, { box: 1, dueAt: NOW - DAY, lastCorrect: true })], { now: NOW });
    expect(p.reviews).toEqual([{ kanaId: hira[0]!.id, skill: 'recognition', reason: 'Overdue by 1 day', promote: true }]);
  });
  it(`holds new rows while ${STRUGGLE_LIMIT} or more kana are back at box 0`, () => {
    const missed = hira.slice(0, STRUGGLE_LIMIT).map((k) => st(k.id, { box: 0, dueAt: NOW, lastCorrect: false }));
    const p = planKana(missed, { now: NOW });
    expect(p.held).toBe(true);
    expect(p.newRows).toHaveLength(0);
    expect(p.reviews.length).toBe(STRUGGLE_LIMIT);
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
