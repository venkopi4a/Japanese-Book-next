import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { toRomaji } from 'wanakana';
import { useApp } from '../app/state';
import { speak, speechSupported } from '../app/speech';
import { Blossom, Icon } from '../app/icons';
import { mulberry32, shuffle } from '../domain/distractors';
import { KANA_BY_ID, kanaOf, type KanaChar, type KanaRow } from '../domain/kanaCourse';
import { KANA_EXAMPLES } from '../domain/kanaExamples';
import { REVIEW_SESSION, kanaQuestion, learnedKana, lessonSteps, planKana, type KanaItem, type KanaQuestion, type LessonStep } from '../domain/kanaPlan';

/** What a kana session is: a lesson (one row) or a review of due kana. */
export type KanaMode = { kind: 'lesson'; row: KanaRow; index: number } | { kind: 'review'; items: KanaItem[]; title: string };
type Step = LessonStep & { uid: number; firstTry: boolean; second: boolean };

let uid = 0;
const tag = (s: LessonStep): Step => ({ ...s, uid: ++uid, firstTry: true, second: false });

function buildSteps(mode: KanaMode, states: Parameters<typeof lessonSteps>[1], rng: () => number): Step[] {
  if (mode.kind === 'lesson') return lessonSteps(mode.row, states, { canHear: speechSupported(), now: Date.now(), rng }).map(tag);
  return shuffle(mode.items, rng).filter((i) => i.skill !== 'listening' || speechSupported()).slice(0, REVIEW_SESSION).flatMap((i) => {
    const k = KANA_BY_ID.get(i.kanaId);
    return k ? [tag({ kind: 'quiz', kana: k, skill: i.skill, lesson: false, promote: i.promote, reason: i.reason })] : [];
  });
}

export function KanaSession({ mode, onClose, onStart }: { mode: KanaMode; onClose: () => void; onStart: (m: KanaMode) => void }) {
  const { repo, states, settings, reload } = useApp();
  const rng = useRef(mulberry32(Date.now()));
  const [queue, setQueue] = useState<Step[]>(() => buildSteps(mode, states, rng.current));
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [combo, setCombo] = useState(0);
  const [finished, setFinished] = useState(false);
  const total = useRef(queue.length);
  const done = useRef(0);
  const stats = useRef({ learned: 0, answered: 0, firstOk: 0, started: Date.now() });
  const missed = useRef(new Map<string, KanaChar>());
  const session = useRef('');
  const shownAt = useRef(Date.now());
  const timer = useRef(0);
  const met = useRef(new Set(states.filter((s) => s.skill === 'recognition').map((s) => s.wordId)));
  const auto = settings.autoPlay;

  const step = queue[0];
  const question: KanaQuestion | null = useMemo(() => (step?.kind === 'quiz' ? kanaQuestion(step.kana, step.skill, met.current, rng.current) : null), [step?.uid]);

  useEffect(() => { repo.startSession(mode.kind === 'lesson' ? 'kana-lesson' : 'kana-review').then((s) => { session.current = s.id; }); return () => window.clearTimeout(timer.current); }, []);
  useEffect(() => {
    shownAt.current = Date.now(); setPicked(null); setBusy(false);
    if (!step || !auto) return;
    if (step.kind === 'learn' || (step.kind === 'quiz' && step.skill === 'listening')) speak(step.kana.char, settings.speechRate);
  }, [step?.uid]);
  useEffect(() => { if (!step && !finished) { setFinished(true); void reload(); } }, [step, finished]);

  // Leaving early keeps everything done so far: lesson cards and answers are saved as they happen.
  const close = async () => { window.clearTimeout(timer.current); await reload(); onClose(); };

  const advance = (requeue?: Step) => {
    window.clearTimeout(timer.current);
    setQueue((cur) => {
      const rest = cur.slice(1);
      if (requeue) { // one extra try, before the closing game
        const at = rest.findIndex((s) => s.kind === 'match');
        if (at < 0) rest.push(requeue); else rest.splice(at, 0, requeue);
      }
      return rest;
    });
  };

  const learnNext = async () => {
    if (step?.kind !== 'learn' || busy) return;
    setBusy(true);
    await repo.introduce(step.kana.id, 'recognition');
    if (speechSupported()) await repo.introduce(step.kana.id, 'listening'); // first heard in tomorrow's review
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
    setCombo((c) => (correct && step.firstTry ? c + 1 : 0));
    if (correct) {
      done.current++;
      if (auto && step.skill === 'recognition') speak(step.kana.char, settings.speechRate);
      timer.current = window.setTimeout(() => advance(), 650);
    } else if (step.second) done.current++;
    setBusy(false);
  };
  const next = () => {
    if (step?.kind !== 'quiz') return;
    advance(picked !== question?.answer && !step.second ? { ...step, uid: ++uid, firstTry: false, second: true } : undefined);
  };

  const progress = Math.min(100, Math.round((done.current / Math.max(1, total.current)) * 100));
  const stepNo = Math.min(total.current, done.current + 1);
  const phase = !step ? '' : step.kind === 'learn' ? 'New kana' : step.kind === 'match' ? 'Final game' : step.second ? 'One more try' : 'Quick check';

  // ---------- the end ----------
  if (!step) {
    const s = stats.current;
    const pct = s.answered ? Math.round((s.firstOk / s.answered) * 100) : 100;
    const stars = pct === 100 ? 3 : pct >= 80 ? 2 : 1;
    const mins = Math.max(1, Math.round((Date.now() - s.started) / 60000));
    const script = mode.kind === 'lesson' ? mode.row.script : KANA_BY_ID.get(mode.items[0]?.kanaId ?? '')?.script ?? 'hiragana';
    const learned = learnedKana(states, script), all = kanaOf(script).length;
    const plan = planKana(states, { now: Date.now(), newLimit: settings.kanaLimit });
    const nextLesson = plan.lesson && (mode.kind !== 'lesson' || plan.lesson.row.id !== mode.row.id) ? plan.lesson : null;
    return (
      <Overlay>
        <div class="petals" aria-hidden="true">{Array.from({ length: 16 }, (_, i) => <i key={i} class="petal" style={`--x:${(i * 37) % 100}%;--s:${9 + (i % 4) * 3}px;--d:${(i % 7) * 0.4}s;--t:${5 + (i % 5)}s`} />)}</div>
        <div class="topbar" style="justify-content:flex-end;position:relative"><button class="icon-btn ring" aria-label="Close" onClick={close}><Icon name="close" /></button></div>
        <div class="q"><div class="stage" style="text-align:center">
          <div class="stars" aria-label={`${stars} of 3 blossoms`}>{[1, 2, 3].map((n) => <span key={n} class={n <= stars ? 'on' : ''} style={`--i:${n}`}><Blossom size={n === 2 ? 64 : 48} /></span>)}</div>
          <div class="j" style="font-size:30px;margin-top:6px">{mode.kind === 'lesson' ? 'Lesson complete' : 'Review complete'}</div>
          {mode.kind === 'lesson' && <div class="lesson-row j" lang="ja">{mode.row.chars.map((c) => <span key={c.id}>{c.char}</span>)}</div>}
          <div class="m" style="margin-top:4px">{pct === 100 ? 'Every answer right first time.' : pct >= 80 ? 'Great work. The ones you missed come back soon.' : 'Good effort. Missed kana come back tomorrow, that is how they stick.'}</div>
          <div class="card" style="margin-top:16px"><div class="stat" style="justify-content:space-around;gap:8px">
            {s.learned > 0 && <div><div class="big">{s.learned}</div><div class="m">new kana</div></div>}
            <div><div class="big">{pct}%</div><div class="m">first try</div></div>
            <div><div class="big">{mins}</div><div class="m">{mins === 1 ? 'minute' : 'minutes'}</div></div>
          </div>
            <div style="display:flex;justify-content:space-between;margin-top:14px;font-size:14px"><span>{script === 'hiragana' ? 'Hiragana' : 'Katakana'}</span><span class="m">{learned} / {all}</span></div>
            <div class="bar" style="margin-top:4px"><i class="grow" style={`width:${(learned / all) * 100}%`} /></div>
          </div>
          {missed.current.size > 0 && <div class="missed-row">{[...missed.current.values()].map((k) => <span key={k.id}><b lang="ja">{k.char}</b> {k.romaji}</span>)}</div>}
          {nextLesson && <div class="m" style="margin-top:14px">Next: lesson {nextLesson.index + 1} · <span lang="ja">{nextLesson.row.label}</span>{plan.goalReached ? ' · today’s goal is done' : ''}</div>}
        </div></div>
        <div class="foot" style="display:flex;gap:10px">
          {nextLesson
            ? <><button class="btn" style="flex:1;min-height:54px" onClick={close}>Done</button><button class="btn primary" style="flex:2" onClick={() => onStart({ kind: 'lesson', row: nextLesson.row, index: nextLesson.index })}>Next lesson</button></>
            : <button class="btn primary" onClick={close}>Done</button>}
        </div>
      </Overlay>
    );
  }

  const title = mode.kind === 'lesson' ? `Lesson ${mode.index + 1}` : mode.title;
  const top = <Top progress={progress} title={title} phase={phase} count={`${stepNo} of ${total.current}`} combo={combo} onClose={close} />;

  // ---------- learn card ----------
  if (step.kind === 'learn') {
    const k = step.kana, ex = KANA_EXAMPLES[k.char];
    return (
      <Overlay>
        {top}
        <div class="q"><div class="stage">
          <div class="learn" key={step.uid}>
            <span class="pill">New {k.script}</span>
            <button class="kana-disc" lang="ja" aria-label={`${k.char}, play the sound`} onClick={() => speak(k.char, settings.speechRate)}>{k.char}<Icon name="speaker" size={18} /></button>
            <div class="roma-big">{k.romaji}</div>
            {k.hint && <div class="hint-box"><b>Memory hint</b><br />{k.hint}</div>}
            {ex && <button class="example" onClick={() => speak(ex[0], settings.speechRate)}><span class="j" lang="ja">{ex[0]}</span><span class="m">{toRomaji(ex[0])} · {ex[1]}</span><Icon name="speaker" size={18} /></button>}
          </div>
        </div></div>
        <div class="foot"><button class="btn primary" disabled={busy} onClick={learnNext}>Got it</button></div>
      </Overlay>
    );
  }

  // ---------- matching game ----------
  if (step.kind === 'match') return <Overlay>{top}<Match key={step.uid} kanas={step.kanas} rate={settings.speechRate} onDone={() => { done.current++; advance(); }} /></Overlay>;

  // ---------- question ----------
  if (!question) return null;
  const listening = step.skill === 'listening';
  const right = picked !== null && picked === question.answer;
  const wrong = picked !== null && !right;
  return (
    <Overlay>
      {top}
      <div class="q"><div class="stage">
        <div class={`qcard${wrong ? ' shake' : ''}`} key={step.uid}>
          {step.second && <span class="tag">One more try</span>}
          {listening
            ? <button class="btn sound-btn" aria-label="Play audio" onClick={() => speak(step.kana.char, settings.speechRate)}><Icon name="speaker" size={40} /></button>
            : <div class="kana-big" lang="ja">{step.kana.char}</div>}
          <div class="hint">{listening ? 'Listen, then tap the kana you hear' : 'Which sound is this?'}</div>
        </div>
        <div class="opts grid2">
          {question.options.map((o) => {
            const cls = !picked ? '' : o === question.answer ? ' good' : o === picked ? ' bad' : ' dim';
            return <button key={o} class={`opt${listening ? ' ja kana-opt' : ' sound-opt'}${cls}`} lang={listening ? 'ja' : undefined} disabled={!!picked} onClick={() => answer(o)}>{o}{picked && o === question.answer && <span class="bloom"><Blossom size={20} /></span>}</button>;
          })}
        </div>
      </div></div>
      <div class={`answer-bar${right ? ' good show' : wrong ? ' bad show' : ''}`} role="status">
        {right && <><b>{combo >= 3 ? `${combo} in a row!` : ['Nice!', 'Correct!', 'Yes!'][combo % 3]}</b> <span lang="ja">{step.kana.char}</span> = {step.kana.romaji}</>}
        {wrong && <>
          <div><b>Not quite.</b> <span class="j" lang="ja" style="font-size:22px">{step.kana.char}</span> is <b>{step.kana.romaji}</b></div>
          {step.kana.hint && <div class="m" style="margin-top:2px">{step.kana.hint}</div>}
          {!step.second && <div class="m" style="margin-top:2px">It comes back once more before the end.</div>}
          <button class="btn primary" style="width:100%;margin-top:10px" onClick={next}>Continue</button>
        </>}
      </div>
    </Overlay>
  );
}

/** Match each kana to its sound. A quick, low-pressure round at the end of a lesson; it is not recorded. */
function Match({ kanas, rate, onDone }: { kanas: KanaChar[]; rate: number; onDone: () => void }) {
  const rng = useRef(mulberry32(Date.now()));
  const left = useMemo(() => shuffle(kanas, rng.current), []);
  const right = useMemo(() => shuffle(kanas, rng.current), []);
  const [sel, setSel] = useState<{ side: 'l' | 'r'; id: string } | null>(null);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [bad, setBad] = useState<string[]>([]);
  const tap = (side: 'l' | 'r', k: KanaChar) => {
    if (matched.has(k.id)) return;
    if (side === 'l') speak(k.char, rate);
    if (!sel || sel.side === side) { setSel({ side, id: k.id }); return; }
    if (sel.id === k.id) {
      const m = new Set(matched); m.add(k.id); setMatched(m); setSel(null);
      if (m.size === kanas.length) window.setTimeout(onDone, 600);
    } else { setBad([sel.id + sel.side, k.id + side]); setSel(null); window.setTimeout(() => setBad([]), 450); }
  };
  const cls = (side: 'l' | 'r', k: KanaChar) => `mcell${matched.has(k.id) ? ' done' : ''}${sel?.side === side && sel.id === k.id ? ' sel' : ''}${bad.includes(k.id + side) ? ' bad' : ''}`;
  return (
    <div class="q"><div class="stage">
      <div class="j" style="font-size:24px;text-align:center">Match the pairs</div>
      <div class="m" style="text-align:center;margin-top:2px">Tap a kana, then its sound</div>
      <div class="match">
        <div>{left.map((k) => <button key={k.id} class={cls('l', k) + ' j'} lang="ja" onClick={() => tap('l', k)}>{k.char}</button>)}</div>
        <div>{right.map((k) => <button key={k.id} class={cls('r', k)} onClick={() => tap('r', k)}>{k.romaji}</button>)}</div>
      </div>
    </div></div>
  );
}

function Overlay({ children }: { children: preact.ComponentChildren }) {
  return <div class="overlay kana-session" role="dialog" aria-modal="true"><div class="inner">{children}</div></div>;
}
function Top({ progress, title, phase, count, combo, onClose }: { progress: number; title: string; phase: string; count: string; combo: number; onClose: () => void }) {
  return (
    <div class="topbar">
      <button class="icon-btn" aria-label="End session" onClick={onClose}><Icon name="close" /></button>
      <div style="flex:1">
        <div class="track" role="progressbar" aria-label={title} aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><i style={`width:${progress}%`}>{progress > 0 && <span class="tip"><Blossom size={22} /></span>}</i></div>
        <div class="m step-line"><span>{title} · {phase}</span>{combo >= 3 && <span class="combo-mini"><Blossom size={12} /> {combo}</span>}<b class="step-count">{count}</b></div>
      </div>
      <span style="width:8px" />
    </div>
  );
}
