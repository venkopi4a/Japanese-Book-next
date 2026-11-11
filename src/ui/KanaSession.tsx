import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useApp } from '../app/state';
import { speak, speechSupported } from '../app/speech';
import { Blossom, Icon } from '../app/icons';
import { mulberry32, shuffle } from '../domain/distractors';
import { KANA_BY_ID, kanaOf, type KanaChar, type KanaRow } from '../domain/kanaCourse';
import { kanaQuestion, learnedKana, type KanaItem, type KanaQuestion } from '../domain/kanaPlan';
import type { Skill } from '../domain/types';

type Step =
  | { kind: 'learn'; uid: number; kana: KanaChar }
  | { kind: 'quiz'; uid: number; kana: KanaChar; skill: Skill; promote: boolean; firstTry: boolean; second: boolean; lesson: boolean; reason: string };

let uid = 0;
const canHear = () => speechSupported();

/** Builds the session: reviews first, then each new row is taught (learn cards) and checked straight away. */
export function kanaSteps(rows: KanaRow[], reviews: KanaItem[], rng: () => number): Step[] {
  const out: Step[] = [];
  const quiz = (kana: KanaChar, skill: Skill, promote: boolean, lesson: boolean, reason: string): Step => ({ kind: 'quiz', uid: ++uid, kana, skill, promote, firstTry: true, second: false, lesson, reason });
  for (const r of shuffle(reviews, rng)) {
    const k = KANA_BY_ID.get(r.kanaId);
    if (k && (r.skill !== 'listening' || canHear())) out.push(quiz(k, r.skill, r.promote, false, r.reason));
  }
  for (const row of rows) {
    for (const k of row.chars) out.push({ kind: 'learn', uid: ++uid, kana: k });
    const checks = row.chars.flatMap((k) => [quiz(k, 'recognition', true, true, 'Just learned'), ...(canHear() ? [quiz(k, 'listening', true, true, 'Just learned')] : [])]);
    out.push(...shuffle(checks, rng));
  }
  return out;
}

export function KanaSession({ rows, reviews, title, onClose }: { rows: KanaRow[]; reviews: KanaItem[]; title: string; onClose: () => void }) {
  const { repo, states, settings, reload } = useApp();
  const rng = useRef(mulberry32(Date.now()));
  const [queue, setQueue] = useState<Step[]>(() => kanaSteps(rows, reviews, rng.current));
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const total = useRef(queue.length);
  const done = useRef(0);
  const stats = useRef({ learned: 0, answered: 0, firstOk: 0 });
  const missed = useRef(new Map<string, KanaChar>());
  const session = useRef('');
  const shownAt = useRef(Date.now());
  const timer = useRef(0);
  const met = useRef(new Set(states.filter((s) => s.skill === 'recognition').map((s) => s.wordId)));

  const step = queue[0];
  const question: KanaQuestion | null = useMemo(() => (step?.kind === 'quiz' ? kanaQuestion(step.kana, step.skill, met.current, rng.current) : null), [step?.uid]);

  useEffect(() => { repo.startSession('kana').then((s) => { session.current = s.id; }); return () => window.clearTimeout(timer.current); }, []);
  useEffect(() => {
    shownAt.current = Date.now(); setPicked(null); setBusy(false);
    if (!step || !settings.autoPlay) return;
    if (step.kind === 'learn' || step.skill === 'listening') speak(step.kana.char, settings.speechRate);
  }, [step?.uid]);

  const advance = (requeue?: Step) => {
    window.clearTimeout(timer.current);
    setQueue((cur) => { const rest = cur.slice(1); if (requeue) rest.push(requeue); if (!rest.length) void reload(); return rest; });
  };

  const learnNext = () => {
    if (step?.kind !== 'learn') return;
    met.current.add(step.kana.id);
    stats.current.learned++; done.current++; advance();
  };

  const answer = async (value: string) => {
    if (step?.kind !== 'quiz' || !question || busy || picked) return;
    setBusy(true); setPicked(value);
    const correct = value === question.answer;
    await repo.recordAnswer({
      word: { id: step.kana.id }, skill: step.skill, exercise: step.skill === 'listening' ? 'kana-listen-mc' : 'kana-sound-mc',
      shown: step.skill === 'listening' ? `(audio) ${step.kana.char}` : step.kana.char, expected: question.answer, submitted: value,
      correct, firstTry: step.firstTry, responseMs: Date.now() - shownAt.current, options: question.options,
      sessionId: session.current, promote: step.promote, learning: step.lesson,
    });
    if (step.firstTry) { stats.current.answered++; if (correct) stats.current.firstOk++; else missed.current.set(step.kana.id, step.kana); }
    if (correct) { done.current++; timer.current = window.setTimeout(() => advance(), 750); }
    else if (step.second) done.current++;
    setBusy(false);
  };
  const next = () => {
    if (step?.kind !== 'quiz') return;
    advance(picked !== question?.answer && !step.second ? { ...step, uid: ++uid, firstTry: false, second: true } : undefined);
  };

  if (!step) {
    const s = stats.current;
    const pct = s.answered ? Math.round((s.firstOk / s.answered) * 100) : null;
    const script = rows[0]?.script ?? (reviews[0] ? KANA_BY_ID.get(reviews[0].kanaId)?.script : undefined) ?? 'hiragana';
    return (
      <Overlay>
        <div class="topbar" style="justify-content:flex-end"><button class="icon-btn ring" aria-label="Close" onClick={onClose}><Icon name="close" /></button></div>
        <div class="q"><div style="text-align:center;margin-top:30px">
          <div style="color:var(--sk);display:flex;justify-content:center"><Blossom size={64} /></div>
          <div class="j" style="font-size:32px;margin-top:10px">Kana lesson complete</div>
          <div class="m" style="margin-top:6px">{pct === 100 ? 'Every answer right first time.' : 'The ones you missed come back soon. That is how they stick.'}</div>
          <div class="card" style="margin-top:18px"><div class="stat" style="justify-content:space-around;gap:8px">
            {s.learned > 0 && <div><div class="big">{s.learned}</div><div class="m">new kana</div></div>}
            {pct !== null && <div><div class="big">{pct}%</div><div class="m">right first time</div></div>}
            <div><div class="big">{learnedKana(states, script)}<span style="font-size:18px">/{kanaOf(script).length}</span></div><div class="m">{script} learned</div></div>
          </div></div>
          {missed.current.size > 0 && <div class="section" style="text-align:left"><h2>Worth another look</h2>
            {[...missed.current.values()].map((k) => <div class="row" key={k.id}><span class="j" lang="ja" style="font-size:26px">{k.char}</span><span class="m">{k.romaji}</span></div>)}
          </div>}
        </div></div>
        <div class="foot"><button class="btn primary" onClick={onClose}>Done</button></div>
      </Overlay>
    );
  }

  const progress = Math.min(100, Math.round((done.current / Math.max(1, total.current)) * 100));
  const label = step.kind === 'learn' ? 'New kana' : step.second ? 'One more try' : step.reason;

  if (step.kind === 'learn') {
    const k = step.kana;
    return (
      <Overlay>
        <Top progress={progress} label={label} title={title} onClose={onClose} />
        <div class="q"><div class="stage">
          <div class="qcard lesson" key={step.uid}>
            <span class="tag">New {k.script}</span>
            <div class="kana-big" lang="ja">{k.char}</div>
            <div class="roma" style="font-size:30px;font-weight:700">{k.romaji}</div>
            {k.hint && <div class="hint" style="font-size:16px;margin-top:10px">{k.hint}</div>}
            {speechSupported() && <button class="btn" style="margin-top:14px" onClick={() => speak(k.char, settings.speechRate)}><Icon name="speaker" /> Listen</button>}
          </div>
        </div></div>
        <div class="foot"><button class="btn primary" onClick={learnNext}>Next</button></div>
      </Overlay>
    );
  }

  if (!question) return null;
  const listening = step.skill === 'listening';
  const wrong = picked !== null && picked !== question.answer;
  return (
    <Overlay>
      <Top progress={progress} label={label} title={title} onClose={onClose} />
      <div class="q"><div class="stage">
        <div class="qcard" key={step.uid}>
          {step.second && <span class="tag">One more try</span>}
          {listening
            ? <button class="btn" style="min-height:96px;min-width:96px;border-radius:50%" aria-label="Play audio" onClick={() => speak(step.kana.char, settings.speechRate)}><Icon name="speaker" size={36} /></button>
            : <div class="kana-big" lang="ja">{step.kana.char}</div>}
          <div class="hint">{listening ? 'Listen, then pick the kana' : 'Which sound is this?'}</div>
        </div>
        <div class={`opts${listening ? ' grid2' : ''}`}>
          {question.options.map((o) => {
            const cls = !picked ? '' : o === question.answer ? ' good' : o === picked ? ' bad' : ' dim';
            return <button key={o} class={`opt${listening ? ' ja kana-opt' : ''}${cls}`} lang={listening ? 'ja' : undefined} disabled={!!picked} onClick={() => answer(o)}>{o}</button>;
          })}
        </div>
        {wrong && (
          <div class="feedback bad" role="status">
            <b>Not quite</b>
            <div style="margin-top:4px"><span class="j" lang="ja" style="font-size:24px">{step.kana.char}</span> is <b>{step.kana.romaji}</b>{step.kana.hint && <span class="m"> · {step.kana.hint}</span>}</div>
            {!step.second && <div class="m" style="margin-top:6px">It will come back once more at the end.</div>}
          </div>
        )}
      </div></div>
      <div class="foot">{wrong && <button class="btn primary" onClick={next}>Next</button>}</div>
    </Overlay>
  );
}

function Overlay({ children }: { children: preact.ComponentChildren }) {
  return <div class="overlay" role="dialog" aria-modal="true"><div class="inner">{children}</div></div>;
}
function Top({ progress, label, title, onClose }: { progress: number; label: string; title: string; onClose: () => void }) {
  return (
    <div class="topbar">
      <button class="icon-btn" aria-label="End session" onClick={onClose}><Icon name="close" /></button>
      <div style="flex:1">
        <div class="track" role="progressbar" aria-label={title} aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><i style={`width:${progress}%`}>{progress > 0 && <span class="tip"><Blossom size={22} /></span>}</i></div>
        <div class="m" style="margin-top:8px;font-size:12px">{label}</div>
      </div>
      <span style="width:8px" />
    </div>
  );
}
