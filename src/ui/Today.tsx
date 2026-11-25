import { useMemo } from 'preact/hooks';
import { useApp } from '../app/state';
import { Blossom, Icon } from '../app/icons';
import { topicCounts } from '../app/topics';
import { DAY, startOfDay } from '../domain/scheduler';
import { planMistakes, planToday, planWeak, wordsIntroducedToday } from '../domain/session';
import { KanaToday, useKanaPlan, type StartKana } from './Kana';
import { useWordPath, type StartWordLesson } from './WordPath';
import { streak } from '../domain/stats';
import type { SessionItem } from './Session';

const GOAL = 20;
export const ART = `${import.meta.env.BASE_URL}art-banner.jpg`;
const asSession = (items: { wordId: string; skill: any; kind: 'new' | 'review'; reason: string }[]): SessionItem[] => items.map((i) => ({ ...i, promote: true }));
const greeting = () => { const h = new Date().getHours(); return h < 5 || h >= 18 ? 'こんばんは' : h < 11 ? 'おはよう' : 'こんにちは'; };

export function Today({ onStart, onLesson, onKana, onKanaTab, onAdd, onSettings, onTopic }: { onStart: (title: string, items: SessionItem[]) => void; onLesson: StartWordLesson; onKana: StartKana; onKanaTab: () => void; onAdd: () => void; onSettings: () => void; onTopic: (topic: string) => void }) {
  const { words, states, attempts, settings, profile, kana, hiraganaDone } = useApp();
  const kanaPlan = useKanaPlan();
  const kanaFirst = !hiraganaDone;
  const path = useWordPath();
  const nextLesson = path.next;
  const now = Date.now();
  const d = useMemo(() => {
    const day = startOfDay(now);
    const introducedToday = wordsIntroducedToday(states, day);
    const studied = states.map((s) => s.introducedAt);
    const plan = planToday(words, states, { now, newLimit: settings.newLimit, introducedToday, romaji: settings.readingMode === 'romaji' });
    const week = Array.from({ length: 7 }, (_, i) => { const t = startOfDay(now - (6 - i) * DAY); return { t, on: attempts.some((a) => startOfDay(a.ts) === t) || studied.some((x) => startOfDay(x) === t) }; });
    const wordIds = new Set(words.map((w) => w.id));
    const wordsLearned = states.filter((s) => s.skill === 'recognition' && s.box >= 1 && wordIds.has(s.wordId)).length;
    return { wordsLearned, plan, weak: planWeak(states, attempts), mistakes: planMistakes(attempts, day - DAY), answered: attempts.filter((a) => a.ts >= day).length, streak: streak(attempts, now, studied), week };
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
        <div class="greet"><div class="j" lang="ja">{greeting()}{profile.name ? `、${profile.name}` : ''}</div><div class="m">{new Date().toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'long' })}</div></div>
      </div>

      {(() => {
        // Words and kana are both always open: study whatever you like. Whichever track you are on comes first.
        // Words: the next lesson teaches new words; reviews bring back the ones that are due. Both one tap away.
        const reviews = plan.reviews.length;
        const wordsCard = (
          <div class={`card lesson-card${kanaFirst ? '' : ' pull'}`} key="words">
            <div style="display:flex;justify-content:space-between;align-items:center"><div class="eyebrow" style="margin:0">Words</div><span class="m">{path.sum.learned}/{path.sum.total} learned</span></div>
            {nextLesson ? <>
              <div class="m" style="margin-top:6px">{nextLesson.done ? 'Continue where you left off' : `Next lesson · ${nextLesson.lesson.unit} ${nextLesson.lesson.n} of ${nextLesson.lesson.of}`}</div>
              <div class="lesson-words">{nextLesson.lesson.words.map((w) => <span key={w.id} class="j" lang="ja">{w.text}</span>)}</div>
              <div class="m" style="margin:2px 0 14px">{nextLesson.lesson.words.length} new words · about {Math.max(2, Math.round((nextLesson.lesson.words.length * 2 + 1) / 5))} min</div>
            </> : <div class="big" style="font-size:30px;margin:6px 0 10px">Every lesson done</div>}
            {reviews > 0 && (!nextLesson || plan.overdue > 0)
              ? <><button class="btn primary" onClick={() => onStart('Review', asSession(plan.reviews))}>Review {reviews} {reviews === 1 ? 'word' : 'words'}</button>
                {nextLesson && <button class="btn" style="width:100%;margin-top:8px" onClick={() => onLesson(nextLesson.lesson)}>{nextLesson.done ? 'Continue lesson' : 'Start lesson'}</button>}</>
              : <>{nextLesson && <button class="btn primary" onClick={() => onLesson(nextLesson.lesson)}>{nextLesson.done ? 'Continue lesson' : 'Start lesson'}</button>}
                {reviews > 0 && <button class="btn" style="width:100%;margin-top:8px" onClick={() => onStart('Review', asSession(plan.reviews))}>Review · {reviews} due</button>}</>}
            {weak.length > 0 && <button class="link" style="margin-top:6px" onClick={() => onStart('Weak words', asSession(weak.slice(0, 15)))}>Weak words · {weak.length}</button>}
          </div>
        );
        const kanaCard = (kanaPlan.lesson || kanaPlan.reviews.length > 0) ? <KanaToday key="kana" plan={kanaPlan} onStart={onKana} compact={!kanaFirst} /> : null;
        return kanaFirst ? <>{kanaCard}<div class="section">{wordsCard}</div></> : <>{wordsCard}{kanaCard && <div class="section">{kanaCard}</div>}</>;
      })()}

      <div class="section"><div style="display:flex;justify-content:space-between;align-items:baseline"><h2>Your progress</h2><button class="link" onClick={onKanaTab}>Kana chart</button></div>
        {([['Hiragana', 'hiragana'], ['Katakana', 'katakana']] as const).map(([label, sc]) => (
          <div key={sc} style="margin-top:10px">
            <div style="display:flex;justify-content:space-between"><span>{label}</span><span class="m">{kana.learned[sc]} learned · {kana.mastered[sc]} mastered of {kana.total[sc]}</span></div>
            <div class="bar duo" style="margin-top:4px"><i class="learned" style={`width:${(kana.learned[sc] / kana.total[sc]) * 100}%`} /><i class="mastered" style={`width:${(kana.mastered[sc] / kana.total[sc]) * 100}%`} /></div>
          </div>
        ))}
        <div style="margin-top:10px">
          <div style="display:flex;justify-content:space-between"><span>Words</span><span class="m">{d.wordsLearned} learned of {words.length}</span></div>
          <div class="bar duo" style="margin-top:4px"><i class="learned" style={`width:${(d.wordsLearned / Math.max(1, words.length)) * 100}%`} /></div>
        </div>
        <p class="m" style="margin:8px 0 0">Learned: answered right at least once. Mastered: your last 3 answers were right, on at least 2 different days.</p>
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
