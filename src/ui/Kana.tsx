import { useMemo, useState } from 'preact/hooks';
import { useApp } from '../app/state';
import { Blossom, Icon } from '../app/icons';
import { speak } from '../app/speech';
import { KANA_ROWS, STAGE_NAMES, isKanaId, kanaOf, type KanaChar, type KanaRow, type KanaStage, type Script } from '../domain/kanaCourse';
import { LESSON_SIZE, REVIEW_SESSION, learnedKana, lessonStatuses, planKana, type KanaPlan } from '../domain/kanaPlan';
import type { SkillState } from '../domain/types';
import type { KanaMode } from './KanaSession';

export type StartKana = (mode: KanaMode) => void;

export function useKanaPlan(): KanaPlan {
  const { states, settings } = useApp();
  return useMemo(() => planKana(states, { now: Date.now(), newLimit: settings.kanaLimit }), [states, settings.kanaLimit]);
}

/** Steps take about 10 seconds each: 5 kana = 11 steps ≈ 2 minutes. */
const minutes = (steps: number) => `about ${Math.max(1, Math.round(steps / 6))} min`;

/** Today's kana: the next lesson (continued if it was left halfway), the daily goal and due reviews. */
export function KanaToday({ plan, onStart, compact = false }: { plan: KanaPlan; onStart: StartKana; compact?: boolean }) {
  const l = plan.lesson, n = plan.reviews.length;
  const startLesson = () => l && onStart({ kind: 'lesson', row: l.row, index: l.index });
  const startReview = () => onStart({ kind: 'review', items: plan.reviews, title: 'Kana review' });
  const reviewFirst = n > 0 && (plan.held || plan.goalReached);
  return (
    <div class={compact ? 'card kana-today' : 'card pull kana-today'}>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
        <div class="eyebrow" style="margin:0">Today's kana</div>
        <div class="goal" aria-label={`${Math.min(plan.lessonsToday, plan.goal)} of ${plan.goal} lessons today`}>
          {Array.from({ length: plan.goal }, (_, i) => <span key={i} class={i < plan.lessonsToday ? 'on' : ''}><Blossom size={18} /></span>)}
          <small>{Math.min(plan.lessonsToday, plan.goal)}/{plan.goal}</small>
        </div>
      </div>
      {l ? <>
        <div class="m" style="margin-top:8px">{l.started && l.done < l.row.chars.length ? 'Continue where you left off' : plan.goalReached ? 'Daily goal done. One more if you like:' : `Lesson ${l.index + 1} of ${l.total}`}</div>
        <div class="lesson-preview j" lang="ja"><span>{l.row.label}</span></div>
        <div class="m" style="margin:2px 0 14px">{l.row.chars.length} {l.row.script} · {minutes(l.row.chars.length * 2 + 1)} · {l.row.chars.length * 2 + 1} steps{l.started && l.done ? ` · ${l.done} of ${l.row.chars.length} done` : ''}</div>
        {reviewFirst
          ? <><button class="btn primary" onClick={startReview}>Review {Math.min(n, REVIEW_SESSION)} kana first</button>
            <button class="btn" style="width:100%;margin-top:8px" onClick={startLesson}>{l.started ? 'Continue lesson' : 'Start lesson'}</button></>
          : <><button class="btn primary" onClick={startLesson}>{l.started ? 'Continue lesson' : plan.goalReached ? 'One more lesson' : 'Start lesson'}</button>
            {n > 0 && <button class="btn" style="width:100%;margin-top:8px" onClick={startReview}>Review · {n} due</button>}</>}
        {plan.held && <div class="m" style="margin-top:8px">Several kana were missed recently. A short review first makes the next lesson easier.</div>}
      </> : <>
        <div class="big" style="font-size:30px;margin-top:6px">Course complete</div>
        <div class="m" style="margin:4px 0 12px">Every hiragana and katakana is learned. Reviews keep them fresh.</div>
        {n > 0 && <button class="btn primary" onClick={startReview}>Review · {n} due</button>}
      </>}
    </div>
  );
}

const level = (s: SkillState | undefined) => (!s || s.lastAt === null ? 'new' : s.box === 0 ? 'miss' : s.box >= 4 ? 'strong' : 'ok');
const POS: Record<string, number[]> = { y: [0, 2, 4], w: [0, 4, 5] }; // や row and わ row have gaps; ん sits on its own line

function Grid({ rows, stage, rec }: { rows: KanaRow[]; stage: KanaStage; rec: Map<string, SkillState> }) {
  const { settings } = useApp();
  const cols = stage === 'combo' ? 3 : 5;
  const cells: (KanaChar | null)[] = [];
  for (const r of rows) {
    const key = r.id.split('-')[2]!;
    const pos = stage === 'basic' ? POS[key] : undefined;
    const line: (KanaChar | null)[] = Array(pos ? Math.max(...pos) + 1 : r.chars.length).fill(null);
    r.chars.forEach((c, i) => { line[pos ? pos[i]! : i] = c; });
    while (line.length % cols) line.push(null);
    cells.push(...line);
  }
  return (
    <div class="kgrid" style={`grid-template-columns:repeat(${cols},1fr)`}>
      {cells.map((c, i) => c
        ? <button key={c.id} class={`kcell ${level(rec.get(c.id))}`} onClick={() => speak(c.char, settings.speechRate)} aria-label={`${c.char} ${c.romaji}`}><span class="j" lang="ja">{c.char}</span><small>{c.romaji}</small></button>
        : <span key={i} />)}
    </div>
  );
}

/** The course as a path: one stop per lesson, in order. Finished stops show how strong they are and can be practised. */
function Path({ script, onStart }: { script: Script; onStart: StartKana }) {
  const { states, toast } = useApp();
  const all = useMemo(() => lessonStatuses(states), [states]);
  return (
    <div class="path">
      {(['basic', 'voiced', 'combo'] as KanaStage[]).map((stage) => (
        <div key={stage}>
          <div class="eyebrow">{STAGE_NAMES[stage]}</div>
          {all.map((x, index) => ({ ...x, index })).filter((x) => x.row.script === script && x.row.stage === stage).map((x) => (
            <button key={x.row.id} class={`stop ${x.status}`} onClick={() => (x.status === 'locked' ? toast('Finish the lessons before this one first') : onStart({ kind: 'lesson', row: x.row, index: x.index }))}>
              <span class="node" lang="ja">{x.status === 'done' ? '✓' : x.row.chars[0]!.char}</span>
              <span class="stop-text">
                <b>Lesson {x.index + 1}</b> <span class="j" lang="ja">{x.row.label}</span>
                <small>{x.status === 'done' ? 'Tap to practise' : x.status === 'current' ? (x.done ? `${x.done} of ${x.row.chars.length} done · continue` : 'Next up') : 'Locked'}</small>
              </span>
              {x.status === 'done' && <span class="strength" aria-label={`strength ${x.strength} of 3`}>{[1, 2, 3].map((n) => <span key={n} class={n <= x.strength ? 'on' : ''}><Blossom size={14} /></span>)}</span>}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

export function Kana({ onStart, onSettings }: { onStart: StartKana; onSettings: () => void }) {
  const { states, vocabLocked } = useApp();
  const plan = useKanaPlan();
  const [script, setScript] = useState<Script>(() => (plan.lesson?.row.script ?? 'hiragana'));
  const [view, setView] = useState<'path' | 'chart'>('path');
  const rec = useMemo(() => new Map(states.filter((s) => s.skill === 'recognition' && isKanaId(s.wordId)).map((s) => [s.wordId, s])), [states]);
  const learned = learnedKana(states, script), total = kanaOf(script).length;
  const lessonsLeft = Math.ceil((kanaOf('hiragana').length - learnedKana(states, 'hiragana')) / LESSON_SIZE);

  return (
    <div class="screen">
      <div class="head"><h1>Kana</h1><button class="icon-btn ring" aria-label="Settings" onClick={onSettings}><Icon name="gear" size={20} /></button></div>
      {vocabLocked && <p class="m" style="margin:-4px 0 14px">Start here. Vocabulary opens when hiragana is done (about {lessonsLeft} short {lessonsLeft === 1 ? 'lesson' : 'lessons'} to go).</p>}
      <KanaToday plan={plan} onStart={onStart} compact />

      <div class="chips" role="group" aria-label="Script" style="margin-top:20px">
        {(['hiragana', 'katakana'] as Script[]).map((s) => <button key={s} class="chip" aria-pressed={script === s} onClick={() => setScript(s)}>{s === 'hiragana' ? 'Hiragana ひらがな' : 'Katakana カタカナ'}</button>)}
      </div>
      <div class="bar" style="margin:6px 0 6px" role="progressbar" aria-valuenow={learned} aria-valuemin={0} aria-valuemax={total}><i style={`width:${(learned / total) * 100}%`} /></div>
      <div class="m">{learned} of {total} learned</div>

      <div class="seg-toggle" role="group" aria-label="View">
        <button aria-pressed={view === 'path'} onClick={() => setView('path')}>Lessons</button>
        <button aria-pressed={view === 'chart'} onClick={() => setView('chart')}>Chart</button>
      </div>

      {view === 'path' ? <Path script={script} onStart={onStart} /> : <>
        <div class="legend m"><span><i class="kcell new" />not yet</span><span><i class="kcell miss" />missed</span><span><i class="kcell ok" />learned</span><span><i class="kcell strong" />strong</span></div>
        <div class="m" style="margin-top:4px">Tap any kana to hear it.</div>
        {(['basic', 'voiced', 'combo'] as KanaStage[]).map((stage) => (
          <div class="section" key={stage}><h2>{STAGE_NAMES[stage]}</h2>
            <Grid rows={KANA_ROWS.filter((r) => r.script === script && r.stage === stage)} stage={stage} rec={rec} />
          </div>
        ))}
      </>}
    </div>
  );
}
