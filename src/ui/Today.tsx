import { useMemo } from 'preact/hooks';
import { useApp } from '../app/state';
import { Blossom, Icon } from '../app/icons';
import { topicCounts } from '../app/topics';
import { DAY, startOfDay } from '../domain/scheduler';
import { planMistakes, planToday, planWeak } from '../domain/session';
import { streak } from '../domain/stats';
import type { SessionItem } from './Session';

const GOAL = 20;
export const ART = `${import.meta.env.BASE_URL}art-banner.jpg`;
const asSession = (items: { wordId: string; skill: any; kind: 'new' | 'review'; reason: string }[]): SessionItem[] => items.map((i) => ({ ...i, promote: true }));
const greeting = () => { const h = new Date().getHours(); return h < 5 || h >= 18 ? 'こんばんは' : h < 11 ? 'おはよう' : 'こんにちは'; };

export function Today({ onStart, onAdd, onSettings, onTopic }: { onStart: (title: string, items: SessionItem[]) => void; onAdd: () => void; onSettings: () => void; onTopic: (topic: string) => void }) {
  const { words, states, attempts, settings } = useApp();
  const now = Date.now();
  const d = useMemo(() => {
    const day = startOfDay(now);
    const introducedToday = states.filter((s) => s.skill === 'recognition' && s.introducedAt >= day).length;
    const plan = planToday(words, states, { now, newLimit: settings.newLimit, introducedToday, romaji: settings.readingMode === 'romaji' });
    const week = Array.from({ length: 7 }, (_, i) => { const t = startOfDay(now - (6 - i) * DAY); return { t, on: attempts.some((a) => startOfDay(a.ts) === t) }; });
    return { plan, weak: planWeak(states, attempts), mistakes: planMistakes(attempts, day - DAY), answered: attempts.filter((a) => a.ts >= day).length, streak: streak(attempts, now), week };
  }, [words, states, attempts, settings.newLimit, settings.readingMode]);
  const topics = useMemo(() => topicCounts(words), [words]);
  const { plan, weak, answered } = d;
  const total = plan.reviews.length + plan.news.length;
  const today = () => onStart('Today', asSession([...plan.reviews, ...plan.news]));
  const next = plan.overdue > 0 ? { text: `${plan.overdue} ${plan.overdue === 1 ? 'review is' : 'reviews are'} overdue. Clear those first.`, run: today }
    : weak.length > 0 ? { text: `${weak.length} ${weak.length === 1 ? 'skill keeps' : 'skills keep'} slipping. A short weak-words session will help.`, run: () => onStart('Weak words', asSession(weak.slice(0, 15))) }
    : plan.news.length > 0 ? { text: `${plan.news.length} new ${plan.news.length === 1 ? 'word is' : 'words are'} ready to learn.`, run: today } : null;
  return (
    <div class="screen" style="padding-top:0">
      <div class="hero">
        <img src={ART} alt="" />
        <div class="hero-top">
          <span class="seal" aria-hidden="true">単</span><span class="grow" />
          <button class="btn accent" style="min-height:44px;padding:0 14px" onClick={onAdd} aria-label="Add or import words"><Icon name="plus" size={18} /> Add</button>
          <button class="icon-btn ring" aria-label="Settings" onClick={onSettings}><Icon name="gear" size={20} /></button>
        </div>
        <div class="greet"><div class="j" lang="ja">{greeting()}</div><div class="m">{new Date().toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'long' })}</div></div>
      </div>

      <div class="card pull">
        <div class="eyebrow" style="margin:0 0 4px">Today</div>
        {total > 0
          ? <div class="big">{total} <span style="font-size:20px">to practise</span></div>
          : <div class="big" style="font-size:34px">All done for today</div>}
        <div class="m" style="margin:4px 0 16px">{total > 0 ? `${plan.reviews.length} ${plan.reviews.length === 1 ? 'review' : 'reviews'}, ${plan.news.length} new ${plan.news.length === 1 ? 'word' : 'words'}${plan.deferred ? `, ${plan.deferred} more waiting` : ''}` : 'Come back tomorrow, or practise something extra.'}</div>
        <button class="btn primary" disabled={total === 0} onClick={today}>Start practice</button>
        <div style="display:flex;gap:10px;margin-top:10px">
          <button class="btn" style="flex:1;padding:0 10px" disabled={weak.length === 0} onClick={() => onStart('Weak words', asSession(weak.slice(0, 15)))}>Weak words · {weak.length}</button>
          <button class="btn" style="flex:1;padding:0 10px" onClick={onAdd}>Add words</button>
        </div>
      </div>

      <div class="section">
        <div style="display:flex;justify-content:space-between;align-items:baseline"><h2>This week</h2><span class="m">{d.streak > 0 ? `${d.streak}-day streak` : 'Practise today to start a streak'}</span></div>
        <div class="blossoms" style="margin-top:8px">{d.week.map((x, i) => <div key={x.t} class={`${x.on ? 'on' : 'off'}${i === 6 ? ' today' : ''}`}><Blossom size={30} /><span>{new Date(x.t).toLocaleDateString('en', { weekday: 'narrow' })}</span></div>)}</div>
        <div class="bar" role="progressbar" aria-valuenow={Math.min(answered, GOAL)} aria-valuemin={0} aria-valuemax={GOAL} style="margin:14px 0 6px"><i style={`width:${Math.min(100, (answered / GOAL) * 100)}%`} /></div>
        <div class="m">{answered} of {GOAL} answers today</div>
      </div>

      {topics.length > 0 && (
        <div class="section"><h2>Practise a topic</h2>
          <div class="chips" style="margin-top:6px">{topics.map(([t, n]) => <button key={t} class="chip" onClick={() => onTopic(t)}>{t}<small>{n}</small></button>)}</div>
        </div>
      )}

      {next && (
        <div class="section"><h2>Study next</h2>
          <div class="row" style="gap:12px"><div>{next.text}</div><button class="btn" onClick={next.run}>Start</button></div>
        </div>
      )}
    </div>
  );
}
