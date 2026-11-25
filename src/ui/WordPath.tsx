import { useMemo, useState } from 'preact/hooks';
import { useApp } from '../app/state';
import { Blossom } from '../app/icons';
import { wordLessonInfo, wordSummary, wordUnits, type LessonInfo, type WordLesson } from '../domain/wordPath';

export type StartWordLesson = (l: WordLesson) => void;

export function useWordPath() {
  const { words, states, attempts } = useApp();
  return useMemo(() => {
    const sum = wordSummary(words, states, attempts);
    const units = wordUnits(words);
    const info = wordLessonInfo(units, sum.levels);
    return { sum, units, info, next: info.find((x) => x.status === 'current') ?? null };
  }, [words, states, attempts]);
}

const minutes = (n: number) => `about ${Math.max(2, Math.round((n * 2 + 1) / 5))} min`;

/** The suggested next word lesson, for Today and the top of the path. */
export function WordLessonCard({ next, onStart, pull = false }: { next: LessonInfo | null; onStart: StartWordLesson; pull?: boolean }) {
  if (!next) return null;
  const l = next.lesson;
  const resumed = next.done > 0;
  return (
    <div class={`card lesson-card${pull ? ' pull' : ''}`}>
      <div class="eyebrow" style="margin:0">Next word lesson</div>
      <div class="m" style="margin-top:6px">{resumed ? 'Continue where you left off' : `${l.unit} · lesson ${l.n} of ${l.of}`}</div>
      <div class="lesson-words">{l.words.map((w) => <span key={w.id} class="j" lang="ja">{w.text}</span>)}</div>
      <div class="m" style="margin:2px 0 14px">{l.words.length} words · {minutes(l.words.length)}{resumed ? ` · ${next.done} of ${l.words.length} done` : ''}</div>
      <button class="btn primary" onClick={() => onStart(l)}>{resumed ? 'Continue lesson' : 'Start lesson'}</button>
    </div>
  );
}

/** Every unit (topic) with its lessons. Nothing is locked: any lesson can be started, finished ones become practice. */
export function WordPath({ onStart }: { onStart: StartWordLesson }) {
  const { sum, units, info } = useWordPath();
  const byId = new Map(info.map((x) => [x.lesson.id, x]));
  const [open, setOpen] = useState<string | null>(() => info.find((x) => x.status === 'current')?.lesson.unit ?? units[0]?.name ?? null);
  return (
    <div class="wpath">
      <div class="m" style="margin:4px 0 8px">{sum.learned} of {sum.total} words learned · {sum.mastered} mastered</div>
      {units.map((u) => {
        const ls = u.lessons.map((l) => byId.get(l.id)!);
        const learnedN = u.lessons.reduce((n, l) => n + l.words.filter((w) => ['learned', 'mastered'].includes(sum.levels.get(w.id) ?? '')).length, 0);
        const all = u.lessons.reduce((n, l) => n + l.words.length, 0);
        const masteredN = u.lessons.reduce((n, l) => n + l.words.filter((w) => sum.levels.get(w.id) === 'mastered').length, 0);
        const isOpen = open === u.name;
        return (
          <div class={`unit${isOpen ? ' open' : ''}`} key={u.name}>
            <button class="unit-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : u.name)}>
              <span class="unit-ring" style={`--p:${(learnedN / Math.max(1, all)) * 100}%;--q:${(masteredN / Math.max(1, all)) * 100}%`}><span>{learnedN === all && all ? '✓' : `${learnedN}`}</span></span>
              <span class="unit-text"><b>{u.name}</b><small>{learnedN} of {all} learned · {u.lessons.length} {u.lessons.length === 1 ? 'lesson' : 'lessons'}</small></span>
              <span class="chev" aria-hidden="true">{isOpen ? '−' : '+'}</span>
            </button>
            {isOpen && ls.map((x) => (
              <button key={x.lesson.id} class={`stop ${x.status === 'open' ? 'locked open-lesson' : x.status}`} onClick={() => onStart(x.lesson)}>
                <span class="node" lang="ja">{x.status === 'done' ? '✓' : x.lesson.words[0]!.text.slice(0, 1)}</span>
                <span class="stop-text">
                  <b>Lesson {x.lesson.n}</b> <span class="j" lang="ja">{x.lesson.words.map((w) => w.text).join('・')}</span>
                  <small>{x.status === 'done' ? 'Tap to practise' : x.status === 'current' ? (x.done ? `${x.done} of ${x.lesson.words.length} done · continue` : 'Next up') : `${x.lesson.words.length} words · start any time`}</small>
                </span>
                {x.status === 'done' && <span class="strength" aria-label={`strength ${x.strength} of 3`}>{[1, 2, 3].map((n) => <span key={n} class={n <= x.strength ? 'on' : ''}><Blossom size={14} /></span>)}</span>}
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}
