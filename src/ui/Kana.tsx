import { useMemo, useState } from 'preact/hooks';
import { useApp } from '../app/state';
import { Icon } from '../app/icons';
import { speak } from '../app/speech';
import { mulberry32, shuffle } from '../domain/distractors';
import { KANA_ROWS, STAGE_NAMES, isKanaId, kanaOf, type KanaChar, type KanaRow, type KanaStage, type Script } from '../domain/kanaCourse';
import { KANA_SKILLS, kanaIntroducedToday, learnedKana, planKana, type KanaItem, type KanaPlan } from '../domain/kanaPlan';
import { isDue } from '../domain/scheduler';
import type { SkillState } from '../domain/types';

export type StartKana = (title: string, rows: KanaRow[], reviews: KanaItem[]) => void;

export function useKanaPlan(): KanaPlan {
  const { states, settings } = useApp();
  return useMemo(() => { const now = Date.now(); return planKana(states, { now, newLimit: settings.kanaLimit, introducedToday: kanaIntroducedToday(states, now) }); }, [states, settings.kanaLimit]);
}

/** The card that offers today's kana lesson. Used on the Kana tab and on Today. */
export function KanaToday({ plan, onStart, compact = false }: { plan: KanaPlan; onStart: StartKana; compact?: boolean }) {
  const n = plan.reviews.length, chars = plan.newRows.reduce((s, r) => s + r.chars.length, 0);

  const script = plan.newRows[0]?.script;
  return (
    <div class={compact ? 'card' : 'card pull'}>
      <div class="eyebrow" style="margin:0 0 4px">Today's kana</div>
      {n + chars === 0
        ? <><div class="big" style="font-size:30px">{plan.held ? 'Review first' : 'All done for today'}</div><div class="m" style="margin-top:4px">{plan.held ? 'Several kana need another look before new ones arrive.' : 'New kana arrive tomorrow. You can still practise the ones you know.'}</div></>
        : <>
          {chars > 0 && <div class="lesson-preview j" lang="ja">{plan.newRows.map((r) => <span key={r.id}>{r.chars.map((c) => c.char).join(' ')}</span>)}</div>}
          <div class="m" style="margin:4px 0 14px">{[chars ? `${chars} new ${script ?? ''}` : '', n ? `${n} ${n === 1 ? 'review' : 'reviews'}` : ''].filter(Boolean).join(', ')}{plan.held ? '. New kana wait until the missed ones are cleared.' : ''}</div>
          <button class="btn primary" onClick={() => onStart(chars ? 'Kana lesson' : 'Kana review', plan.newRows, plan.reviews)}>{chars ? 'Start lesson' : 'Start review'}</button>
        </>}
    </div>
  );
}

const level = (s: SkillState | undefined) => (!s ? 'new' : s.box === 0 ? 'miss' : s.box >= 4 ? 'strong' : 'ok');
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

export function Kana({ onStart, onSettings }: { onStart: StartKana; onSettings: () => void }) {
  const { states, vocabLocked } = useApp();
  const plan = useKanaPlan();
  const [script, setScript] = useState<Script>(() => (learnedKana(states, 'hiragana') === kanaOf('hiragana').length ? 'katakana' : 'hiragana'));
  const rec = useMemo(() => new Map(states.filter((s) => s.skill === 'recognition' && isKanaId(s.wordId)).map((s) => [s.wordId, s])), [states]);
  const learned = learnedKana(states, script), total = kanaOf(script).length;

  const extra = () => {
    const now = Date.now();
    const items = states.filter((s) => isKanaId(s.wordId) && KANA_SKILLS.includes(s.skill) && kanaOf(script).some((k) => k.id === s.wordId))
      .map((s): KanaItem => ({ kanaId: s.wordId, skill: s.skill, reason: isDue(s, now) ? 'Due today' : 'Extra practice', promote: isDue(s, now) }));
    onStart('Kana practice', [], shuffle(items, mulberry32(now)).slice(0, 15));
  };
  const started = [...rec.keys()].some((id) => kanaOf(script).some((k) => k.id === id));

  return (
    <div class="screen">
      <div class="head"><h1>Kana</h1><button class="icon-btn ring" aria-label="Settings" onClick={onSettings}><Icon name="gear" size={20} /></button></div>
      {vocabLocked && <p class="m" style="margin:-4px 0 14px">Start here. Vocabulary opens once you have learned hiragana: {learnedKana(states, 'hiragana')} of {kanaOf('hiragana').length} so far.</p>}
      <KanaToday plan={plan} onStart={onStart} compact />

      <div class="chips" role="group" aria-label="Script" style="margin-top:20px">
        {(['hiragana', 'katakana'] as Script[]).map((s) => <button key={s} class="chip" aria-pressed={script === s} onClick={() => setScript(s)}>{s === 'hiragana' ? 'Hiragana ひらがな' : 'Katakana カタカナ'}</button>)}
      </div>
      <div class="bar" style="margin:6px 0 6px" role="progressbar" aria-valuenow={learned} aria-valuemin={0} aria-valuemax={total}><i style={`width:${(learned / total) * 100}%`} /></div>
      <div class="m">{learned} of {total} learned · tap any kana to hear it</div>
      <div class="legend m"><span><i class="kcell new" />not yet</span><span><i class="kcell miss" />missed</span><span><i class="kcell ok" />learned</span><span><i class="kcell strong" />strong</span></div>
      {started && <button class="btn" style="width:100%;margin-top:12px" onClick={extra}>Practise learned {script}</button>}

      {(['basic', 'voiced', 'combo'] as KanaStage[]).map((stage) => (
        <div class="section" key={stage}><h2>{STAGE_NAMES[stage]}</h2>
          <Grid rows={KANA_ROWS.filter((r) => r.script === script && r.stage === stage)} stage={stage} rec={rec} />
        </div>
      ))}
    </div>
  );
}
