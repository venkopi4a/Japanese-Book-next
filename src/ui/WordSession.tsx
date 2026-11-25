import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useApp } from '../app/state';
import { buildExercise, readingHelp, romajiOf, type Exercise, type Known } from '../app/exercise';
import { speak } from '../app/speech';
import { Blossom, Icon } from '../app/icons';
import { mulberry32, shuffle } from '../domain/distractors';
import { isDue } from '../domain/scheduler';
import { wordLessonInfo, wordLessonSteps, wordSummary, wordUnits, type WordLesson, type WordStep } from '../domain/wordPath';
import type { Word } from '../domain/types';

type Step = WordStep & { uid: number; firstTry: boolean; second: boolean };
let uid = 0;
const tag = (s: WordStep): Step => ({ ...s, uid: ++uid, firstTry: true, second: false });

/**
 * A word lesson: learn card → quick check for each new word, then "match the pairs". The same flow and look as the
 * kana lessons. Lesson cards are saved as they happen (repo.introduce), so leaving keeps progress.
 */
export function WordSession({ lesson, onClose, onStart }: { lesson: WordLesson; onClose: () => void; onStart: (l: WordLesson) => void }) {
  const { repo, words, states, attempts, settings, reload, katakanaDone } = useApp();
  const rng = useRef(mulberry32(Date.now()));
  const levels = useMemo(() => wordSummary(words, states, attempts).levels, []);
  const [queue, setQueue] = useState<Step[]>(() => wordLessonSteps(lesson, levels).map(tag));
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [combo, setCombo] = useState(0);
  const [finished, setFinished] = useState(false);
  const total = useRef(queue.length);
  const done = useRef(0);
  const stats = useRef({ learned: 0, answered: 0, firstOk: 0, started: Date.now() });
  const missed = useRef(new Map<string, Word>());
  const session = useRef('');
  const shownAt = useRef(Date.now());
  const timer = useRef(0);
  const met = useRef(new Set(states.filter((s) => s.skill === 'recognition').map((s) => s.wordId)));
  const auto = settings.autoPlay;

  const step = queue[0];
  const known = (): Known => ({ met: met.current, readingKnown: new Set(states.filter((s) => s.skill === 'reading' && s.box >= 2).map((s) => s.wordId)), katakanaDone });
  const ex: Exercise | null = useMemo(() => (step?.kind === 'quiz' ? buildExercise(step.word, 'recognition', words, settings, rng.current, known()) : null), [step?.uid]);
  const due = (w: Word) => { const s = states.find((x) => x.wordId === w.id && x.skill === 'recognition'); return !s || isDue(s, Date.now()); };

  useEffect(() => { repo.startSession('word-lesson').then((s) => { session.current = s.id; }); return () => window.clearTimeout(timer.current); }, []);
  useEffect(() => {
    shownAt.current = Date.now(); setPicked(null); setBusy(false);
    if (step && auto && step.kind !== 'match') speak(step.word.reading || step.word.text, settings.speechRate);
  }, [step?.uid]);
  useEffect(() => { if (!step && !finished) { setFinished(true); void reload(); } }, [step, finished]);

  const close = async () => { window.clearTimeout(timer.current); await reload(); onClose(); };
  const advance = (requeue?: Step) => {
    window.clearTimeout(timer.current);
    setQueue((cur) => {
      const rest = cur.slice(1);
      if (requeue) { const at = rest.findIndex((s) => s.kind === 'match'); if (at < 0) rest.push(requeue); else rest.splice(at, 0, requeue); }
      return rest;
    });
  };
  const learnNext = async () => {
    if (step?.kind !== 'learn' || busy) return;
    setBusy(true);
    await repo.introduce(step.word.id, 'recognition');
    met.current.add(step.word.id);
    stats.current.learned++; done.current++; advance();
  };
  const answer = async (value: string) => {
    if (step?.kind !== 'quiz' || !ex || busy || picked) return;
    setBusy(true); setPicked(value);
    const correct = value === ex.answer;
    const lessonCheck = step.reason === 'Just learned';
    await repo.recordAnswer({
      word: step.word, skill: 'recognition', exercise: ex.type === 'flashcard' ? 'flashcard' : ex.type, shown: ex.prompt, expected: ex.answer, submitted: value,
      correct, firstTry: step.firstTry, responseMs: Date.now() - shownAt.current, options: ex.options.length ? ex.options : null,
      sessionId: session.current, promote: lessonCheck || due(step.word), learning: lessonCheck,
    });
    if (step.firstTry) { stats.current.answered++; if (correct) stats.current.firstOk++; else missed.current.set(step.word.id, step.word); }
    setCombo((c) => (correct && step.firstTry ? c + 1 : 0));
    if (correct) { done.current++; timer.current = window.setTimeout(() => advance(), 750); }
    else if (step.second) done.current++;
    setBusy(false);
  };
  const next = () => {
    if (step?.kind !== 'quiz') return;
    advance(picked !== ex?.answer && !step.second ? { ...step, uid: ++uid, firstTry: false, second: true } : undefined);
  };

  const progress = Math.min(100, Math.round((done.current / Math.max(1, total.current)) * 100));
  const title = `${lesson.unit} ${lesson.n}`;

  // ---------- the end ----------
  if (!step) {
    const s = stats.current;
    const pct = s.answered ? Math.round((s.firstOk / s.answered) * 100) : 100;
    const stars = pct === 100 ? 3 : pct >= 80 ? 2 : 1;
    const mins = Math.max(1, Math.round((Date.now() - s.started) / 60000));
    const sum = wordSummary(words, states, attempts);
    const info = wordLessonInfo(wordUnits(words), sum.levels);
    const nextLesson = info.find((x) => x.status === 'current' && x.lesson.id !== lesson.id)?.lesson;
    return (
      <Overlay>
        <div class="petals" aria-hidden="true">{Array.from({ length: 16 }, (_, i) => <i key={i} class="petal" style={`--x:${(i * 37) % 100}%;--s:${9 + (i % 4) * 3}px;--d:${(i % 7) * 0.4}s;--t:${5 + (i % 5)}s`} />)}</div>
        <div class="topbar" style="justify-content:flex-end;position:relative"><button class="icon-btn ring" aria-label="Close" onClick={close}><Icon name="close" /></button></div>
        <div class="q"><div class="stage" style="text-align:center">
          <div class="stars" aria-label={`${stars} of 3 blossoms`}>{[1, 2, 3].map((n) => <span key={n} class={n <= stars ? 'on' : ''} style={`--i:${n}`}><Blossom size={n === 2 ? 64 : 48} /></span>)}</div>
          <div class="j" style="font-size:30px;margin-top:6px">Lesson complete</div>
          <div class="m" style="margin-top:2px">{title}</div>
          <div class="word-chips">{lesson.words.map((w) => <span key={w.id}><b class="j" lang="ja">{w.text}</b><small>{w.meaning}</small></span>)}</div>
          <div class="m" style="margin-top:8px">{pct === 100 ? 'Every answer right first time.' : pct >= 80 ? 'Great work. Missed words come back soon.' : 'Good effort. Missed words come back tomorrow, that is how they stick.'}</div>
          <div class="card" style="margin-top:14px"><div class="stat" style="justify-content:space-around;gap:8px">
            {s.learned > 0 && <div><div class="big">{s.learned}</div><div class="m">new words</div></div>}
            <div><div class="big">{pct}%</div><div class="m">first try</div></div>
            <div><div class="big">{mins}</div><div class="m">{mins === 1 ? 'minute' : 'minutes'}</div></div>
          </div>
            <div style="display:flex;justify-content:space-between;margin-top:14px;font-size:14px"><span>Words</span><span class="m">{sum.learned} learned · {sum.mastered} mastered of {sum.total}</span></div>
            <div class="bar duo" style="margin-top:4px"><i class="learned grow" style={`width:${(sum.learned / Math.max(1, sum.total)) * 100}%`} /><i class="mastered" style={`width:${(sum.mastered / Math.max(1, sum.total)) * 100}%`} /></div>
          </div>
          {missed.current.size > 0 && <div class="missed-row">{[...missed.current.values()].map((w) => <span key={w.id}><b lang="ja">{w.text}</b> {w.meaning}</span>)}</div>}
          {nextLesson && <div class="m" style="margin-top:14px">Next: {nextLesson.unit} {nextLesson.n} · {nextLesson.words.length} words</div>}
        </div></div>
        <div class="foot" style="display:flex;gap:10px">
          {nextLesson
            ? <><button class="btn" style="flex:1;min-height:54px" onClick={close}>Done</button><button class="btn primary" style="flex:2" onClick={() => onStart(nextLesson)}>Next lesson</button></>
            : <button class="btn primary" onClick={close}>Done</button>}
        </div>
      </Overlay>
    );
  }

  const phase = step.kind === 'learn' ? 'New word' : step.kind === 'match' ? 'Final game' : step.second ? 'One more try' : 'Quick check';
  const top = <Top progress={progress} title={title} phase={phase} count={`${Math.min(total.current, done.current + 1)} of ${total.current}`} combo={combo} onClose={close} />;

  // ---------- learn card ----------
  if (step.kind === 'learn') {
    const w = step.word;
    const ex0 = w.examples[0];
    return (
      <Overlay>
        {top}
        <div class="q"><div class="stage">
          <div class="learn" key={step.uid}>
            <span class="pill">New word{w.topic ? ` · ${w.topic}` : ''}</span>
            <button class="word-disc" lang="ja" aria-label={`${w.text}, play the sound`} onClick={() => speak(w.reading || w.text, settings.speechRate)}>
              <span class="j">{w.text}</span><Icon name="speaker" size={18} />
            </button>
            {w.reading && w.reading !== w.text && <div class="word-reading j" lang="ja">{w.reading}</div>}
            <div class="roma-big">{romajiOf(w.reading || w.text, w.meaning)}</div>
            <div class="word-meaning j">{w.meaning}</div>
            {w.note && <div class="hint-box"><b>Note</b><br />{w.note}</div>}
            {ex0 && <button class="example" onClick={() => speak(ex0.ja, settings.speechRate)}><span class="j" lang="ja">{ex0.ja}</span><span class="m">{ex0.en}</span><Icon name="speaker" size={18} /></button>}
          </div>
        </div></div>
        <div class="foot"><button class="btn primary" disabled={busy} onClick={learnNext}>Got it</button></div>
      </Overlay>
    );
  }

  // ---------- matching game ----------
  if (step.kind === 'match') return <Overlay>{top}<MatchWords key={step.uid} words={step.words} rate={settings.speechRate} k={known()} onDone={() => { done.current++; advance(); }} /></Overlay>;

  // ---------- quick check ----------
  if (!ex) return null;
  const right = picked !== null && picked === ex.answer;
  const wrong = picked !== null && !right;
  const w = step.word;
  return (
    <Overlay>
      {top}
      <div class="q"><div class="stage">
        <div class={`qcard${wrong ? ' shake' : ''}`} key={step.uid}>
          {step.second && <span class="tag">One more try</span>}
          <button class="say" aria-label="Play the word" onClick={() => speak(w.reading || w.text, settings.speechRate)}><Icon name="speaker" size={18} /></button>
          <div class="ja" lang="ja">{ex.prompt}</div>
          {ex.help && <div class="reading help" lang="ja">{ex.help}</div>}
          <div class="hint">{ex.hint}</div>
        </div>
        {ex.type === 'flashcard'
          ? <div class="opts grid2"><button class="opt" disabled={!!picked} onClick={() => answer(ex.answer)}>I knew it</button><button class="opt" disabled={!!picked} onClick={() => answer('')}>I didn't</button></div>
          : <div class="opts">{ex.options.map((o) => {
            const cls = !picked ? '' : o === ex.answer ? ' good' : o === picked ? ' bad' : ' dim';
            return <button key={o} class={`opt${cls}`} disabled={!!picked} onClick={() => answer(o)}>{o}{picked && o === ex.answer && <span class="bloom"><Blossom size={20} /></span>}</button>;
          })}</div>}
      </div></div>
      <div class={`answer-bar${right ? ' good show' : wrong ? ' bad show' : ''}`} role="status">
        {right && <><b>{combo >= 3 ? `${combo} in a row!` : ['Nice!', 'Correct!', 'Yes!'][combo % 3]}</b> <span lang="ja">{w.text}</span> = {w.meaning}</>}
        {wrong && <>
          <div><b>Not quite.</b> <span class="j" lang="ja" style="font-size:22px">{w.text}</span> means <b>{w.meaning}</b></div>
          <div class="m" style="margin-top:2px" lang="ja">{w.reading} · {romajiOf(w.reading || w.text, w.meaning)}</div>
          {!step.second && <div class="m" style="margin-top:2px">It comes back once more before the end.</div>}
          <button class="btn primary" style="width:100%;margin-top:10px" onClick={next}>Continue</button>
        </>}
      </div>
    </Overlay>
  );
}

/** Match each word to its meaning. A quick, low-pressure round at the end of a lesson; it is not recorded. */
function MatchWords({ words, rate, k, onDone }: { words: Word[]; rate: number; k: Known; onDone: () => void }) {
  const rng = useRef(mulberry32(Date.now()));
  const left = useMemo(() => shuffle(words, rng.current), []);
  const right = useMemo(() => shuffle(words, rng.current), []);
  const [sel, setSel] = useState<{ side: 'l' | 'r'; id: string } | null>(null);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [bad, setBad] = useState<string[]>([]);
  const tap = (side: 'l' | 'r', w: Word) => {
    if (matched.has(w.id)) return;
    if (side === 'l') speak(w.reading || w.text, rate);
    if (!sel || sel.side === side) { setSel({ side, id: w.id }); return; }
    if (sel.id === w.id) {
      const m = new Set(matched); m.add(w.id); setMatched(m); setSel(null);
      if (m.size === words.length) window.setTimeout(onDone, 600);
    } else { setBad([sel.id + sel.side, w.id + side]); setSel(null); window.setTimeout(() => setBad([]), 450); }
  };
  const cls = (side: 'l' | 'r', w: Word) => `mcell${matched.has(w.id) ? ' done' : ''}${sel?.side === side && sel.id === w.id ? ' sel' : ''}${bad.includes(w.id + side) ? ' bad' : ''}`;
  return (
    <div class="q"><div class="stage">
      <div class="j" style="font-size:24px;text-align:center">Match the pairs</div>
      <div class="m" style="text-align:center;margin-top:2px">Tap a word, then its meaning</div>
      <div class="match words">
        <div>{left.map((w) => { const h = readingHelp(w, k); return <button key={w.id} class={cls('l', w) + ' j'} lang="ja" onClick={() => tap('l', w)}>{w.text}{h && <small>{h}</small>}</button>; })}</div>
        <div>{right.map((w) => <button key={w.id} class={cls('r', w)} onClick={() => tap('r', w)}>{w.meaning}</button>)}</div>
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
