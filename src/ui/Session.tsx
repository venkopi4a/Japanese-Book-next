import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useApp } from '../app/state';
import { buildExercise, explainMistakes, romajiOf, type Exercise, type Known } from '../app/exercise';
import { speak, speechSupported } from '../app/speech';
import { Blossom, Icon } from '../app/icons';
import { nearDiff } from '../domain/answer';
import { mulberry32 } from '../domain/distractors';
import { gradeTyped } from '../domain/grade';
import { checkRomaji, previewKana } from '../domain/romaji';
import type { PlanItem } from '../domain/session';
import { streak } from '../domain/stats';
import type { MistakeDetail, Skill } from '../domain/types';
import { ART } from './Today';

export interface SessionItem extends PlanItem { promote: boolean }
/** flash: a new word, taught with a lesson card (no test). second: the one extra try a missed item gets at the end of the session. */
interface Q extends SessionItem { uid: number; firstTry: boolean; flash: boolean; second: boolean }
interface Feedback { correct: boolean; mistakes: MistakeDetail[]; variantNote: string | null; picked: string | null }

let uid = 0;
function initialQueue(items: SessionItem[]): Q[] {
  const mk = (it: SessionItem, flash: boolean): Q => ({ ...it, uid: ++uid, firstTry: true, flash, second: false });
  return [...items.filter((i) => i.kind === 'review').map((i) => mk(i, false)), ...items.filter((i) => i.kind === 'new').map((i) => mk(i, true))];
}

export function Session({ title, items, onClose, onAgain }: { title: string; items: SessionItem[]; onClose: () => void; onAgain: (items: SessionItem[]) => void }) {
  const { repo, words, states, attempts, settings, reload, katakanaDone } = useApp();
  const usable = useMemo(() => items.filter((i) => i.skill !== 'listening' || speechSupported()), [items]);
  const [queue, setQueue] = useState<Q[]>(() => initialQueue(usable));
  const [fb, setFb] = useState<Feedback | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [combo, setCombo] = useState(0);
  const total = useRef(queue.length);
  const resolved = useRef(0);
  const stats = useRef({ answered: 0, firstOk: 0, learned: 0 });
  const missed = useRef(new Map<string, SessionItem>());
  const session = useRef('');
  const shownAt = useRef(Date.now());
  const rng = useRef(mulberry32(Date.now()));
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef(0);

  const q = queue[0];
  const word = q ? words.find((w) => w.id === q.wordId) : undefined;
  const known = useMemo<Known>(() => ({
    met: new Set(states.filter((s) => s.skill === 'recognition').map((s) => s.wordId)),
    readingKnown: new Set(states.filter((s) => s.skill === 'reading' && s.box >= 2).map((s) => s.wordId)),
    katakanaDone,
  }), [q?.uid]);
  const ex: Exercise | null = useMemo(() => (q && word && !q.flash ? buildExercise(word, q.skill, words, settings, rng.current, known) : null), [q?.uid]);

  useEffect(() => { repo.startSession('practice').then((s) => { session.current = s.id; }); return () => window.clearTimeout(timer.current); }, []);
  useEffect(() => {
    shownAt.current = Date.now();
    setTyped(''); setFb(null); setBusy(false);
    if (q && word && settings.autoPlay && (ex?.type === 'listening-mc' || q.flash)) speak(word.reading || word.text, settings.speechRate);
    if (ex?.typed) setTimeout(() => inputRef.current?.focus(), 60);
  }, [q?.uid]);

  const advance = (requeue?: Q) => {
    window.clearTimeout(timer.current);
    setQueue((cur) => {
      const rest = cur.slice(1);
      if (requeue) rest.push(requeue); // a missed item gets one more try at the end, not an immediate loop
      if (!rest.length) void reload();
      return rest;
    });
  };
  const again = (item: Q): Q | undefined => (item.second ? undefined : { ...item, uid: ++uid, firstTry: false, second: true });

  // ---- a new word: a lesson card with everything visible, no test. The first quiz comes tomorrow. ----
  const learn = async () => {
    if (!q || !word || busy) return;
    setBusy(true);
    await repo.introduce(word.id, 'recognition');
    stats.current.learned++; resolved.current++; advance();
  };

  // ---- a review: a quiz question ----
  const submit = async (value: string) => {
    if (!q || !word || !ex || busy || fb) return;
    setBusy(true);
    let correct = false, mistakes: MistakeDetail[] = [], variantNote: string | null = null;
    if (ex.type === 'flashcard') correct = value === 'yes';
    else if (ex.typed === 'romaji') { const r = checkRomaji(word.reading, value); correct = r.correct; mistakes = r.mistakes; }
    else if (ex.typed) {
      const r = gradeTyped(word, q.skill, value); correct = r.correct; mistakes = r.mistakes;
      if (r.correct && r.variant) variantNote = `Usual spelling: ${word.text}`;
    } else {
      correct = value === ex.answer;
      if (!correct && q.skill === 'reading') mistakes = nearDiff(ex.answer, value);
    }
    const submitted = ex.typed === 'romaji' ? `${value} (${previewKana(value)})` : value;
    await repo.recordAnswer({
      word, skill: q.skill, exercise: ex.type === 'flashcard' ? 'flashcard' : ex.type, shown: ex.prompt || word.reading, expected: ex.answer, submitted,
      correct, firstTry: q.firstTry, responseMs: Date.now() - shownAt.current, mistakes, options: ex.options.length ? ex.options : null,
      sessionId: session.current, promote: q.promote,
    });
    if (q.firstTry) { stats.current.answered++; if (correct) stats.current.firstOk++; else missed.current.set(`${q.wordId}|${q.skill}`, { wordId: q.wordId, skill: q.skill, kind: 'review', reason: 'Worth another look', promote: true }); }
    setCombo((c) => (correct && q.firstTry ? c + 1 : correct ? c : 0));
    setFb({ correct, mistakes, variantNote, picked: value });
    if (correct) {
      resolved.current++;
      if (!mistakes.length) timer.current = window.setTimeout(() => advance(), variantNote ? 1500 : 800);
    } else if (!again(q)) resolved.current++;
  };
  const next = () => advance(fb && !fb.correct && q ? again(q) : undefined);

  // ---- the end ----
  if (!q) {
    const s = stats.current;
    const days = streak(attempts, Date.now(), [...states.map((x) => x.introducedAt), ...(s.learned ? [Date.now()] : [])]);
    const pct = s.answered ? Math.round((s.firstOk / s.answered) * 100) : null;
    const done = s.answered + s.learned > 0;
    return (
      <Overlay>
        <div class="hero-end"><img src={ART} alt="" /><div class="petals" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <i key={i} class="petal" style={`--x:${(i * 37) % 100}%;--s:${9 + (i % 4) * 3}px;--d:${(i % 7) * 0.45}s;--t:${5 + (i % 5)}s`} />)}</div></div>
        <div class="topbar" style="position:absolute;right:0;left:0;top:0;justify-content:flex-end"><button class="icon-btn ring" aria-label="Close" onClick={onClose}><Icon name="close" /></button></div>
        <div class="q" style="margin-top:-34px">
          <div style="text-align:center">
            <div class="j" style="font-size:34px;line-height:1.2">{done ? 'Session complete' : 'Nothing to practise'}</div>
            {done && <div class="m" style="margin-top:6px">{pct === 100 ? 'Every answer right first time. Beautiful.' : pct !== null && pct >= 70 ? 'Well done. That is how words stay.' : 'Good work. The tricky ones come back soon, and that is how they stick.'}</div>}
          </div>
          {done && (
            <div class="card" style="margin-top:18px"><div class="stat" style="justify-content:space-around;text-align:center;gap:8px">
              {s.learned > 0 && <div><div class="big" style="font-size:34px">{s.learned}</div><div class="m">new {s.learned === 1 ? 'word' : 'words'}</div></div>}
              {s.answered > 0 && <div><div class="big" style="font-size:34px">{s.answered}</div><div class="m">reviewed</div></div>}
              {pct !== null && <div><div class="big" style="font-size:34px">{pct}%</div><div class="m">right first time</div></div>}
              <div><div class="big" style="font-size:34px">{days}</div><div class="m">day streak</div></div>
            </div></div>
          )}
          {missed.current.size > 0 && (
            <div class="section"><h2>Worth another look</h2>
              {[...missed.current.values()].map((m) => { const w = words.find((x) => x.id === m.wordId)!; return <div class="row" key={m.wordId + m.skill}><span><span class="j" lang="ja" style="font-size:20px">{w.text}</span> <span class="m" lang="ja">{w.reading}</span></span><span class="m">{w.meaning}</span></div>; })}
            </div>
          )}
        </div>
        <div class="foot">
          {missed.current.size > 0 && <button class="btn primary" onClick={() => onAgain([...missed.current.values()])}>Practise these again</button>}
          <button class={`btn ${missed.current.size > 0 ? 'accent' : 'primary'}`} style={missed.current.size > 0 ? 'width:100%;margin-top:6px' : ''} onClick={onClose}>Done</button>
        </div>
      </Overlay>
    );
  }
  if (!word) return null;
  const progress = Math.min(100, Math.round((resolved.current / Math.max(1, total.current)) * 100));
  const count = `${Math.min(resolved.current + 1, total.current)} / ${total.current}`;

  // new word: lesson card
  if (q.flash) {
    const roma = romajiOf(word.reading || word.text);
    return (
      <Overlay>
        <Top progress={progress} count={count} onClose={onClose} label="New word" />
        <div class="q"><div class="stage">
          <div class="qcard lesson" key={q.uid}>
            <span class="tag">New word</span>
            <div class="ja" lang="ja" style="margin-top:14px">{word.text}</div>
            {word.reading && word.reading !== word.text && <div class="reading" lang="ja">{word.reading}</div>}
            <div class="roma">{roma}</div>
            <div class="en" style="font-size:28px;margin-top:6px">{word.meaning}</div>
            {word.note && <div class="hint">{word.note}</div>}
            {speechSupported() && <button class="btn" style="margin-top:14px" onClick={() => speak(word.reading || word.text, settings.speechRate)}><Icon name="speaker" /> Listen</button>}
            <div class="hint" style="margin-top:12px">Take a good look. You will be asked about it tomorrow.</div>
          </div>
        </div></div>
        <div class="foot"><button class="btn primary" disabled={busy} onClick={learn}>Got it</button></div>
      </Overlay>
    );
  }
  if (!ex) return null;

  const showKana = ex.typed === 'romaji' && typed ? previewKana(typed) : '';
  const needsNext = !!fb && (!fb.correct || fb.mistakes.length > 0);
  return (
    <Overlay>
      <Top progress={progress} count={count} onClose={onClose} label={q.second ? 'One more try' : q.reason} />
      <div class="q"><div class="stage">
        {combo >= 3 && <div style="text-align:center;margin-bottom:8px"><span class="combo" key={combo}><Blossom size={16} /> {combo} in a row</span></div>}
        <div class="qcard" key={q.uid}>
          {q.second && <span class="tag">One more try</span>}
          {ex.promptKind === 'audio'
            ? <button class="btn" style="min-height:96px;min-width:96px;border-radius:50%" aria-label="Play audio" onClick={() => speak(word.reading || word.text, settings.speechRate)}><Icon name="speaker" size={36} /></button>
            : <div class={ex.promptKind === 'ja' ? 'ja' : 'en'} lang={ex.promptKind === 'ja' ? 'ja' : undefined}>{ex.prompt}</div>}
          {ex.help && <div class="reading help" lang="ja">{ex.help}</div>}
          <div class="hint">{ex.hint}</div>
        </div>

        {ex.type === 'flashcard' && !fb && <div class="opts"><button class="opt" onClick={() => submit('yes')}>I knew it</button><button class="opt" onClick={() => submit('no')}>I didn’t</button></div>}
        {ex.options.length > 0 && (
          <div class="opts">
            {ex.options.map((o) => {
              const cls = !fb ? '' : o === ex.answer ? ' good' : o === fb.picked ? ' bad' : ' dim';
              return <button key={o} class={`opt${ex.optionsJa ? ' ja' : ''}${cls}`} lang={ex.optionsJa ? 'ja' : undefined} disabled={!!fb} onClick={() => submit(o)}>{o}{ex.optionHelp[o] && <small class="ohelp" lang="ja">{ex.optionHelp[o]}</small>}{fb && o === ex.answer && <span class="bloom"><Blossom size={22} /></span>}</button>;
            })}
          </div>
        )}
        {ex.typed && (
          <form class="opts" onSubmit={(e) => { e.preventDefault(); if (typed.trim()) void submit(typed); }}>
            <input ref={inputRef} class={`input${ex.typed === 'romaji' ? '' : ' ja'}`} lang={ex.typed === 'romaji' ? 'en' : 'ja'} value={typed} disabled={!!fb} autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck={false} enterkeyhint="done"
              aria-label="Your answer" placeholder={ex.typed === 'romaji' ? 'romaji' : 'Japanese'} onInput={(e) => setTyped((e.target as HTMLInputElement).value)} />
            {showKana && <div class="m" lang="ja">{showKana}</div>}
            {!fb && ex.typed !== 'romaji' && <div class="m">Use the Japanese keyboard. Romaji is not accepted here.</div>}
            {!fb && <button class="btn primary" type="submit" disabled={!typed.trim() || busy}>Check</button>}
          </form>
        )}

        {fb && (
          <div class={`feedback ${fb.correct ? 'good' : 'bad'}`} role="status">
            <b>{fb.correct ? (fb.mistakes.length ? 'Correct' : 'Lovely') : 'Not quite'}</b>
            {!fb.correct && ex.typed && <div style="margin-top:4px">Answer: <span class="j" lang="ja" style="font-size:20px">{ex.answer}</span></div>}
            {fb.mistakes.length > 0 && explainMistakes(fb.mistakes).map((l) => <div class="m" key={l} style="margin-top:2px">{l}</div>)}
            {fb.variantNote && <div class="m" style="margin-top:2px">{fb.variantNote}</div>}
            <div class="m" style="margin-top:6px"><span lang="ja">{word.text}</span> · <span lang="ja">{word.reading}</span> · {romajiOf(word.reading || word.text)} · {word.meaning}</div>
            {!fb.correct && !q.second && <div class="m" style="margin-top:6px">It will come back once more at the end.</div>}
          </div>
        )}
      </div></div>
      <div class="foot">{needsNext && <button class="btn primary" onClick={next}>Next</button>}</div>
    </Overlay>
  );
}

function Overlay({ children }: { children: preact.ComponentChildren }) {
  return <div class="overlay" role="dialog" aria-modal="true"><div class="inner">{children}</div></div>;
}
function Top({ progress, count, onClose, label }: { progress: number; count: string; onClose: () => void; label: string }) {
  return (
    <div class="topbar">
      <button class="icon-btn" aria-label="End session" onClick={onClose}><Icon name="close" /></button>
      <div style="flex:1">
        <div class="track" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><i style={`width:${progress}%`}>{progress > 0 && <span class="tip"><Blossom size={22} /></span>}</i></div>
        <div class="m" style="margin-top:8px;font-size:12px;display:flex;justify-content:space-between"><span>{label}</span><span>{count}</span></div>
      </div>
      <span style="width:8px" />
    </div>
  );
}
export type { Skill };
