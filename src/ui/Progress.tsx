import { useMemo } from 'preact/hooks';
import { useApp } from '../app/state';
import { Blossom, Icon } from '../app/icons';
import { kanaOf } from '../domain/kanaCourse';
import { learnedKana } from '../domain/kanaPlan';
import { levelFor, milestones } from '../domain/levels';
import { DAY, masteryOf, startOfDay } from '../domain/scheduler';
import { planWeak } from '../domain/session';
import { bestStreak, confusionPairs, retention, skillAccuracy, streak } from '../domain/stats';
import { isKanaId } from '../domain/kanaCourse';
import type { Skill, SkillState } from '../domain/types';
import type { SessionItem } from './Session';

const SKILL_INFO: Record<Skill, [string, string]> = {
  recognition: ['Recognition', 'see Japanese, pick the meaning'],
  recall: ['Recall', 'see English, pick the Japanese'],
  reading: ['Reading', 'see kanji, give the reading'],
  listening: ['Listening', 'hear it, pick the meaning'],
  spelling: ['Spelling', 'type it in Japanese'],
};

function Ring({ mastered, learned, total }: { mastered: number; learned: number; total: number }) {
  const r = 52, c = 2 * Math.PI * r, t = Math.max(1, total);
  const a = (mastered / t) * c, b = (learned / t) * c;
  return (
    <svg width="132" height="132" viewBox="0 0 132 132" role="img" aria-label={`${mastered + learned} of ${total} words learned`}>
      <circle cx="66" cy="66" r={r} fill="none" stroke="var(--ru)" stroke-width="13" />
      <circle cx="66" cy="66" r={r} fill="none" stroke="var(--sk)" stroke-width="13" stroke-linecap="round" stroke-dasharray={`${a + b} ${c}`} transform="rotate(-90 66 66)" style={a + b ? '' : 'display:none'} />
      <circle cx="66" cy="66" r={r} fill="none" stroke="var(--ok)" stroke-width="13" stroke-linecap="round" stroke-dasharray={`${a} ${c}`} transform="rotate(-90 66 66)" style={a ? '' : 'display:none'} />
      <text x="66" y="64" text-anchor="middle" font-size="30" font-weight="700" fill="var(--ink)" style="font-family:var(--serif)">{mastered + learned}</text>
      <text x="66" y="84" text-anchor="middle" font-size="13" fill="var(--mu)">of {total} words</text>
    </svg>
  );
}

export function Progress({ onStart, onAdd, onSettings, onOpen }: { onStart: (title: string, items: SessionItem[]) => void; onAdd: () => void; onSettings: () => void; onOpen: (id: string) => void }) {
  const { words, states, attempts, profile } = useApp();
  const now = Date.now();
  const d = useMemo(() => {
    const vocabStates = states.filter((s) => !isKanaId(s.wordId));
    const vocabAttempts = attempts.filter((a) => !isKanaId(a.wordId));
    const by = new Map<string, SkillState[]>();
    for (const s of vocabStates) by.set(s.wordId, [...(by.get(s.wordId) ?? []), s]);
    let mastered = 0, learned = 0, started = 0;
    for (const w of words) {
      const ws = by.get(w.id) ?? [];
      const rec = ws.find((s) => s.skill === 'recognition');
      if (!rec) continue;
      if (masteryOf(ws) === 'known') mastered++; else if (rec.box >= 1) learned++; else started++;
    }
    const studied = states.map((s) => s.introducedAt);
    const dayCount = (t: number) => attempts.filter((a) => startOfDay(a.ts) === t).length + studied.filter((x) => startOfDay(x) === t).length;
    const today = startOfDay(now);
    const weekday = (new Date(today).getDay() + 6) % 7; // Monday first
    const firstDay = startOfDay(today - (21 + weekday) * DAY + 3_600_000);
    const calendar = Array.from({ length: 28 }, (_, i) => { const t = startOfDay(firstDay + i * DAY + 3_600_000); return { t, n: t > today ? -1 : dayCount(t) }; });
    const hira = learnedKana(states, 'hiragana'), kata = learnedKana(states, 'katakana');
    const best = bestStreak(attempts, studied);
    return {
      mastered, learned, started, hira, kata, calendar, best,
      streak: streak(attempts, now, studied),
      level: levelFor(mastered + learned + hira + kata),
      miles: milestones({ words: mastered + learned, hiragana: hira, hiraganaTotal: kanaOf('hiragana').length, katakana: kata, katakanaTotal: kanaOf('katakana').length, bestStreak: best, anyStudy: states.length > 0 }),
      ret: retention(vocabAttempts), acc: skillAccuracy(vocabAttempts, now), conf: confusionPairs(vocabAttempts).slice(0, 5), weak: planWeak(states, attempts),
    };
  }, [words, states, attempts]);
  const lv = d.level;
  const toNext = lv.to === null ? 0 : lv.to - (d.mastered + d.learned + d.hira + d.kata);
  const maxDay = Math.max(1, ...d.calendar.map((x) => x.n));

  return (
    <div class="screen">
      <div class="head"><h1>Progress</h1>
        <button class="btn accent" onClick={onAdd}><Icon name="plus" size={18} /> Add</button>
        <button class="icon-btn ring" aria-label="Settings" onClick={onSettings}><Icon name="gear" size={20} /></button>
      </div>

      <div class="card level-card">
        <div class="level-badge"><Blossom size={46} /></div>
        <div style="flex:1;min-width:0">
          <div class="eyebrow" style="margin:0">{profile.name} · level {lv.n}</div>
          <div class="j" style="font-size:26px;line-height:1.2">{lv.name}</div>
          {lv.to !== null && <>
            <div class="bar" style="margin:8px 0 4px"><i style={`width:${((d.mastered + d.learned + d.hira + d.kata - lv.from) / (lv.to - lv.from)) * 100}%`} /></div>
            <div class="m" style="font-size:13px">Learn {toNext} more to reach {lv.nextName}</div>
          </>}
        </div>
      </div>
      <p class="m" style="margin:8px 2px 0;font-size:13px">Your level counts every word and kana you have learned.</p>

      <div class="section"><h2>Words</h2>
        <div class="ring-row">
          <Ring mastered={d.mastered} learned={d.learned} total={words.length} />
          <div class="legend-list">
            <div><i style="background:var(--ok)" /><b>{d.mastered}</b> mastered<br /><span class="m">you know it well in every skill</span></div>
            <div><i style="background:var(--sk)" /><b>{d.learned}</b> learned<br /><span class="m">answered right in a quiz</span></div>
            <div><i style="background:var(--ru)" /><b>{words.length - d.mastered - d.learned}</b> to go{d.started ? ` (${d.started} just taught)` : ''}</div>
          </div>
        </div>
      </div>

      <div class="section"><h2>Kana</h2>
        {([['Hiragana', d.hira, kanaOf('hiragana').length], ['Katakana', d.kata, kanaOf('katakana').length]] as const).map(([n, v, t]) => (
          <div key={n} style="margin-top:10px"><div style="display:flex;justify-content:space-between"><span>{n}</span><span class="m">{v} / {t}</span></div>
            <div class="bar" style="margin-top:4px"><i style={`width:${(v / t) * 100}%;background:var(--ind)`} /></div></div>
        ))}
      </div>

      <div class="section"><h2>Streak</h2>
        <div class="stat" style="margin-top:4px">
          <div><div class="big">{d.streak}</div><div class="m">{d.streak === 1 ? 'day in a row' : 'days in a row'}</div></div>
          <div><div class="big">{d.best}</div><div class="m">best ever</div></div>
        </div>
        <div class="cal" role="img" aria-label="Days studied in the last four weeks">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((x, i) => <span key={'h' + i} class="cal-h">{x}</span>)}
          {d.calendar.map((x) => <span key={x.t} class={`cal-d${x.n < 0 ? ' future' : x.n === 0 ? ' off' : ''}${x.t === startOfDay(now) ? ' today' : ''}`} style={x.n > 0 ? `opacity:${0.45 + 0.55 * (x.n / maxDay)}` : ''} title={new Date(x.t).toLocaleDateString()}>{x.n > 0 ? <Blossom size={18} /> : null}</span>)}
        </div>
      </div>

      <div class="section"><h2>Milestones</h2>
        <div class="miles">{d.miles.map((m) => <div key={m.id} class={`mile${m.done ? ' done' : ''}`}><Blossom size={26} /><b>{m.label}</b><span class="m">{m.done ? 'Done' : m.progress}</span></div>)}</div>
      </div>

      <div class="section"><h2>How each skill is going</h2>
        <p class="m" style="margin:0 0 6px;font-size:13px">Right first time, last 2 weeks</p>
        {Object.keys(d.acc).length === 0 ? <div class="m">Shows up after 5 answers in a skill.</div> : (Object.entries(d.acc) as [Skill, number][]).map(([s, v]) => (
          <div key={s} style="margin-top:10px"><div style="display:flex;justify-content:space-between;gap:10px"><span><b>{SKILL_INFO[s][0]}</b> <span class="m">· {SKILL_INFO[s][1]}</span></span><span class="m">{Math.round(v * 100)}%</span></div>
            <div class="bar" style="margin-top:4px"><i style={`width:${v * 100}%;background:${v >= 0.8 ? 'var(--ok)' : v >= 0.6 ? 'var(--sk)' : 'var(--warn)'}`} /></div></div>
        ))}
      </div>

      <div class="section"><h2>Words to work on</h2>
        {d.weak.length === 0 ? <div class="m">Nothing is slipping right now.</div> : <>
          {d.weak.slice(0, 5).map((i) => { const w = words.find((x) => x.id === i.wordId); return w ? <button class="row tap" key={i.wordId + i.skill} onClick={() => onOpen(w.id)}><span><span class="j" lang="ja" style="font-size:21px">{w.text}</span> <span class="m" lang="ja">{w.reading}</span></span><span class="m">{SKILL_INFO[i.skill][0]}</span></button> : null; })}
          <button class="btn primary" style="width:100%;margin-top:12px" onClick={() => onStart('Weak words', d.weak.slice(0, 15).map((i) => ({ ...i, promote: true })))}>Practise these</button>
        </>}
      </div>

      {d.ret !== null && <div class="section"><h2>Remembered after a break</h2>
        <div class="big" style="font-size:34px">{Math.round(d.ret * 100)}%</div>
        <div class="m">Of words you had not seen for 4 or more days, this is how many you still got right.</div></div>}

      {d.conf.length > 0 && <div class="section"><h2>Kana you mix up</h2>
        {d.conf.map((c) => <div class="row" key={c.expected + c.got}><span class="j" lang="ja" style="font-size:21px">{c.expected} → {c.got}</span><span class="m">{c.count} times in {c.words} words</span></div>)}</div>}
    </div>
  );
}
