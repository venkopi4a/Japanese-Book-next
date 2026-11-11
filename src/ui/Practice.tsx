import { useMemo, useState } from 'preact/hooks';
import { useApp } from '../app/state';
import { Icon } from '../app/icons';
import { inSelection, topicCounts, unitCounts } from '../app/topics';
import { mulberry32, shuffle } from '../domain/distractors';
import { DAY, isDue, startOfDay } from '../domain/scheduler';
import { planMistakes, planToday, planWeak, unlockedSkills, wordsIntroducedToday } from '../domain/session';
import { learnedKana } from '../domain/kanaPlan';
import { kanaOf } from '../domain/kanaCourse';
import type { Skill, SkillState } from '../domain/types';
import type { SessionItem } from './Session';

const SKILLS: [Skill, string, string][] = [
  ['recognition', 'Recognition', 'See the Japanese, choose the meaning'],
  ['recall', 'Recall', 'See the meaning, choose the Japanese'],
  ['reading', 'Reading', 'See the word, give its reading'],
  ['listening', 'Listening', 'Hear it, choose the meaning'],
  ['spelling', 'Spelling', 'Type the Japanese yourself'],
];
const wrap = (items: { wordId: string; skill: Skill; kind: 'new' | 'review'; reason: string }[]): SessionItem[] => items.map((i) => ({ ...i, promote: true }));

export function Practice({ onStart, onAdd, onSettings, initialTopics }: { onStart: (title: string, items: SessionItem[]) => void; onAdd: () => void; onSettings: () => void; initialTopics: string[] }) {
  const { words, states, attempts, settings, vocabLocked } = useApp();
  const [topics, setTopics] = useState<string[]>(initialTopics);
  const [units, setUnits] = useState<string[]>([]);
  const now = Date.now();
  const allTopics = useMemo(() => topicCounts(words), [words]);
  const allUnits = useMemo(() => unitCounts(words), [words]);
  const toggle = (list: string[], set: (l: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const d = useMemo(() => {
    const day = startOfDay(now);
    const pool = words.filter((w) => inSelection(w, topics, units));
    const ids = new Set(pool.map((w) => w.id));
    const mine = <T extends { wordId: string }>(l: T[]) => l.filter((i) => ids.has(i.wordId));
    const introducedToday = wordsIntroducedToday(states, day);
    const plan = planToday(pool, states, { now, newLimit: settings.newLimit, introducedToday, romaji: settings.readingMode === 'romaji' });
    const byWord = new Map<string, Map<Skill, SkillState>>();
    for (const s of states) { if (!byWord.has(s.wordId)) byWord.set(s.wordId, new Map()); byWord.get(s.wordId)!.set(s.skill, s); }
    const free = (skill: Skill): SessionItem[] => {
      const out: SessionItem[] = [];
      for (const w of pool) {
        const m = byWord.get(w.id);
        if (!m?.has('recognition') || !unlockedSkills(w, m, settings.readingMode === 'romaji').includes(skill)) continue;
        const st = m.get(skill);
        out.push({ wordId: w.id, skill, kind: 'review', reason: st && isDue(st, now) ? 'Due today' : 'Extra practice', promote: !st || isDue(st, now) });
      }
      return shuffle(out, mulberry32(Math.floor(now / 60000))).slice(0, 10);
    };
    return { size: pool.length, plan, weak: mine(planWeak(states, attempts)), mistakes: mine(planMistakes(attempts, day - DAY)), free };
  }, [words, states, attempts, settings.newLimit, settings.readingMode, topics, units]);
  const today = [...d.plan.reviews, ...d.plan.news];
  const picked = topics.length + units.length > 0;

  const mode = (title: string, sub: string, items: SessionItem[]) => (
    <button class="row tap" disabled={items.length === 0 || vocabLocked} style={items.length === 0 || vocabLocked ? 'opacity:.5' : ''} onClick={() => onStart(title, items)}>
      <span><b style="font-weight:700">{title}</b><br /><span class="m">{sub}</span></span><span class="m">{items.length}</span>
    </button>
  );
  return (
    <div class="screen">
      <div class="head"><h1>Practice</h1>
        <button class="btn accent" onClick={onAdd} aria-label="Add or import words"><Icon name="plus" size={18} /> Add</button>
        <button class="icon-btn ring" aria-label="Settings" onClick={onSettings}><Icon name="gear" size={20} /></button>
      </div>
      {vocabLocked && <div class="card" style="margin:4px 0 16px"><b>Vocabulary opens after hiragana</b><div class="m" style="margin-top:4px">{learnedKana(states, 'hiragana')} of {kanaOf('hiragana').length} hiragana learned. Keep going on the Kana tab. Already read hiragana? Settings → Kana → "I already read hiragana".</div></div>}
      <div class="eyebrow" style="margin-top:6px">Topic</div>
      <div class="chips" role="group" aria-label="Topics">
        <button class="chip" aria-pressed={topics.length === 0} onClick={() => setTopics([])}>All topics</button>
        {allTopics.map(([t, n]) => <button key={t} class="chip" aria-pressed={topics.includes(t)} onClick={() => toggle(topics, setTopics, t)}>{t}<small>{n}</small></button>)}
      </div>
      {allUnits.length > 0 && <>
        <div class="eyebrow">Lesson or unit</div>
        <div class="chips" role="group" aria-label="Units">
          <button class="chip" aria-pressed={units.length === 0} onClick={() => setUnits([])}>All</button>
          {allUnits.map(([u, n]) => <button key={u} class="chip" aria-pressed={units.includes(u)} onClick={() => toggle(units, setUnits, u)}>{u}<small>{n}</small></button>)}
        </div>
      </>}
      <div class="m" style="margin:8px 0 6px">{picked ? `${d.size} ${d.size === 1 ? 'word' : 'words'} in your selection` : `All ${d.size} words`}</div>
      <div class="list">
        {mode('Today', 'Reviews that are due, plus new words', wrap(today))}
        {mode('Weak words', 'Skills that keep slipping', wrap(d.weak.slice(0, 15)))}
        {mode('Mistakes', 'What you missed yesterday and today', wrap(d.mistakes.slice(0, 15)))}
      </div>
      <div class="eyebrow" style="margin-top:26px">Practise a skill</div>
      <div class="list">
        {SKILLS.map(([skill, name, sub]) => mode(name, sub, d.free(skill)))}
      </div>
      <p class="m" style="margin-top:14px">Extra practice never moves a word’s schedule forward when it is not due. A wrong answer still counts.</p>
    </div>
  );
}
