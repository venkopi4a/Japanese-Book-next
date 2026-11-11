import { useMemo } from 'preact/hooks';
import { useApp } from '../app/state';
import { Blossom, Icon } from '../app/icons';
import { DAY, masteryOf, startOfDay } from '../domain/scheduler';
import { planWeak } from '../domain/session';
import { confusionPairs, retention, skillAccuracy, streak } from '../domain/stats';
import type { Skill, SkillState } from '../domain/types';

const NAMES: Record<Skill, string> = { recognition: 'Recognition', recall: 'Recall', reading: 'Reading', listening: 'Listening', spelling: 'Spelling' };

export function Progress({ onAdd, onSettings, onOpen }: { onAdd: () => void; onSettings: () => void; onOpen: (id: string) => void }) {
  const { words, states, attempts } = useApp();
  const now = Date.now();
  const d = useMemo(() => {
    const by = new Map<string, SkillState[]>();
    for (const s of states) by.set(s.wordId, [...(by.get(s.wordId) ?? []), s]);
    const m = { new: 0, learning: 0, known: 0 };
    for (const w of words) m[masteryOf(by.get(w.id) ?? [])]++;
    const days = Array.from({ length: 7 }, (_, i) => { const t = startOfDay(now - (6 - i) * DAY); return { t, n: attempts.filter((a) => startOfDay(a.ts) === t).length }; });
    return { m, days, ret: retention(attempts), acc: skillAccuracy(attempts, now), conf: confusionPairs(attempts).slice(0, 5), weak: planWeak(states, attempts).slice(0, 5), streak: streak(attempts, now) };
  }, [words, states, attempts]);
  const max = Math.max(1, ...d.days.map((x) => x.n));
  const total = Math.max(1, words.length);
  return (
    <div class="screen">
      <div class="head"><h1>Progress</h1>
        <button class="btn accent" onClick={onAdd}><Icon name="plus" size={18} /> Add</button>
        <button class="icon-btn ring" aria-label="Settings" onClick={onSettings}><Icon name="gear" size={20} /></button>
      </div>
      <div class="seg" role="img" aria-label={`${d.m.known} known, ${d.m.learning} learning, ${d.m.new} new`}>
        <i style={`flex:${d.m.known};background:var(--ok)`} /><i style={`flex:${d.m.learning};background:var(--sk)`} /><i style={`flex:${Math.max(d.m.new, d.m.known + d.m.learning === 0 ? total : 0)};background:var(--ru)`} />
      </div>
      <div class="m" style="margin-top:8px">{d.m.known} known · {d.m.learning} learning · {d.m.new} new</div>
      <div class="stat" style="margin-top:18px">
        <div><div class="big">{d.ret === null ? '–' : `${Math.round(d.ret * 100)}%`}</div><div class="m">{d.ret === null ? 'Retention: not enough data yet' : 'Retention'}</div></div>
        <div><div class="big">{d.streak}</div><div class="m">Day streak</div></div>
      </div>
      <div class="section"><h2>This week</h2>
        <div class="blossoms" style="margin-top:8px" role="img" aria-label="Days practised in the last seven days">{d.days.map((x, i) => <div key={x.t} class={`${x.n ? 'on' : 'off'}${i === 6 ? ' today' : ''}`}><Blossom size={30} /><span>{new Date(x.t).toLocaleDateString('en', { weekday: 'narrow' })}</span></div>)}</div>
        <div class="m" style="margin-top:10px">{d.days.reduce((s, x) => s + x.n, 0)} answers this week</div>
      </div>
      <div class="section"><h2>Skills, last 14 days</h2>
        {Object.keys(d.acc).length === 0 ? <div class="m">Not enough answers yet. Each skill needs at least 5.</div> : (Object.entries(d.acc) as [Skill, number][]).map(([s, v]) => <div class="row" key={s}><span>{NAMES[s]}</span><span class="m">{Math.round(v * 100)}% right first time</span></div>)}
      </div>
      <div class="section"><h2>Mixed up most</h2>
        {d.conf.length === 0 ? <div class="m">No pattern yet. A pair shows up here only after it has happened at least 3 times across 2 different words.</div> : d.conf.map((c) => <div class="row" key={c.expected + c.got}><span class="j" lang="ja" style="font-size:21px">{c.expected} → {c.got}</span><span class="m">{c.count} times, {c.words} words</span></div>)}
      </div>
      <div class="section"><h2>Weak words</h2>
        {d.weak.length === 0 ? <div class="m">Nothing is slipping right now.</div> : d.weak.map((i) => { const w = words.find((x) => x.id === i.wordId); return w ? <button class="row tap" key={i.wordId + i.skill} onClick={() => onOpen(w.id)}><span><span class="j" lang="ja" style="font-size:21px">{w.text}</span> <span class="m" lang="ja">{w.reading}</span></span><span class="m">{NAMES[i.skill]}</span></button> : null; })}
      </div>
    </div>
  );
}
