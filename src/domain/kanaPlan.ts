import { nearMisses, shuffle, type Rng } from './distractors';
import { KANA, KANA_ROWS, isKanaId, kanaOf, type KanaChar, type KanaRow, type Script } from './kanaCourse';
import { isDue, reasonFor, startOfDay } from './scheduler';
import type { Skill, SkillState } from './types';

/** Kana use two skills: see it and pick the sound (recognition), hear it and pick the kana (listening). */
export const KANA_SKILLS: Skill[] = ['recognition', 'listening'];
export const DEFAULT_KANA_LIMIT = 15;
/** No new rows while this many kana are back at box 0: clear the missed ones first. */
export const STRUGGLE_LIMIT = 5;

export interface KanaItem { kanaId: string; skill: Skill; reason: string; promote: boolean }
export interface KanaPlan { reviews: KanaItem[]; newRows: KanaRow[]; held: boolean }

const recState = (states: SkillState[]) => {
  const m = new Map<string, SkillState>();
  for (const s of states) if (s.skill === 'recognition' && isKanaId(s.wordId)) m.set(s.wordId, s);
  return m;
};

/** A kana counts as learned once it is answered right after its lesson (recognition box 1 or higher). */
export const learnedKana = (states: SkillState[], script?: Script) => {
  const rec = recState(states);
  return (script ? kanaOf(script) : KANA).filter((k) => (rec.get(k.id)?.box ?? 0) >= 1).length;
};
export const scriptDone = (states: SkillState[], script: Script) => learnedKana(states, script) === kanaOf(script).length;

/** Kana introduced today, for the daily limit. */
export const kanaIntroducedToday = (states: SkillState[], now: number) =>
  states.filter((s) => s.skill === 'recognition' && isKanaId(s.wordId) && s.introducedAt >= startOfDay(now)).length;

/** Today's kana: due reviews first, then whole new rows in course order, up to the daily limit. */
export function planKana(states: SkillState[], opts: { now: number; newLimit?: number; introducedToday?: number }): KanaPlan {
  const { now } = opts;
  const reviews: KanaItem[] = [];
  for (const s of states) {
    if (!isKanaId(s.wordId) || !KANA_SKILLS.includes(s.skill) || !isDue(s, now)) continue;
    reviews.push({ kanaId: s.wordId, skill: s.skill, reason: reasonFor(s, now), promote: true });
  }
  const order = new Map(KANA.map((k, i) => [k.id, i]));
  reviews.sort((a, b) => order.get(a.kanaId)! - order.get(b.kanaId)! || a.skill.localeCompare(b.skill));
  const rec = recState(states);
  const held = [...rec.values()].filter((s) => s.box === 0).length >= STRUGGLE_LIMIT;
  let room = held ? 0 : Math.max(0, (opts.newLimit ?? DEFAULT_KANA_LIMIT) - (opts.introducedToday ?? 0));
  const newRows: KanaRow[] = [];
  for (const row of KANA_ROWS) {
    if (room <= 0) break;
    const fresh = row.chars.filter((c) => !rec.has(c.id));
    if (!fresh.length) continue;
    if (fresh.length > room && newRows.length) break; // whole rows only, but never zero rows when there is room
    newRows.push({ ...row, chars: fresh });
    room -= fresh.length;
  }
  return { reviews, newRows, held };
}

export interface KanaQuestion { kana: KanaChar; skill: Skill; options: string[]; answer: string }

/**
 * A kana question. Wrong options come from kana already met (the same script), never a character with the same sound,
 * so じ and ぢ never appear together. Look-alikes and same-row kana are preferred because they teach the most.
 */
export function kanaQuestion(kana: KanaChar, skill: Skill, metIds: Set<string>, rng: Rng): KanaQuestion {
  const same = kanaOf(kana.script).filter((k) => k.id !== kana.id && k.romaji !== kana.romaji);
  const met = same.filter((k) => metIds.has(k.id));
  const pool = met.length >= 3 ? met : [...met, ...shuffle(same.filter((k) => !metIds.has(k.id) && k.stage === kana.stage), rng)];
  if (skill === 'listening') {
    // look-alikes (か/が, つ/っ) only when that kana is in the pool, so nothing unseen sneaks in
    const chars = pool.map((k) => k.char);
    const near = shuffle(nearMisses(kana.char).filter((c) => chars.includes(c)), rng);
    const picks: string[] = [];
    for (const c of [...near, ...shuffle(pool.filter((k) => k.row === kana.row), rng).map((k) => k.char), ...shuffle(chars, rng)]) if (!picks.includes(c) && picks.length < 3) picks.push(c);
    return { kana, skill, options: shuffle([kana.char, ...picks], rng), answer: kana.char };
  }
  const row = pool.filter((k) => k.row === kana.row);
  const rest = pool.filter((k) => k.row !== kana.row);
  const picks: string[] = [];
  for (const k of [...shuffle(row, rng), ...shuffle(rest, rng)]) if (!picks.includes(k.romaji) && picks.length < 3) picks.push(k.romaji);
  return { kana, skill, options: shuffle([kana.romaji, ...picks], rng), answer: kana.romaji };
}
