import { useMemo, useState } from 'preact/hooks';
import { toKana } from 'wanakana';
import { useApp } from '../app/state';
import { topicCounts } from '../app/topics';
import { Icon } from '../app/icons';
import { toHiragana } from '../domain/kana';
import { masteryOf } from '../domain/scheduler';
import { planWeak } from '../domain/session';
import { SKILLS, type Skill, type SkillState, type Word } from '../domain/types';

type Filter = 'all' | 'new' | 'learning' | 'known' | 'weak' | 'fav';
type Sort = 'topic' | 'newest' | 'reading';
const FILTERS: [Filter, string][] = [['all', 'All'], ['new', 'New'], ['learning', 'Learning'], ['known', 'Known'], ['weak', 'Weak'], ['fav', 'Favourites']];

export function Squares({ states }: { states: Map<Skill, SkillState> }) {
  return <span aria-label="Skill progress">{SKILLS.map((s) => { const b = states.get(s)?.box; return <i key={s} class={`sq${b === undefined ? '' : b >= 3 ? ' k' : ' s'}`} />; })}</span>;
}

export function Notebook({ onOpen, onAdd, onSettings }: { onOpen: (id: string) => void; onAdd: () => void; onSettings: () => void }) {
  const { words, states, attempts } = useApp();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('topic');
  const [topic, setTopic] = useState('');
  const topics = useMemo(() => topicCounts(words), [words]);

  const byWord = useMemo(() => {
    const m = new Map<string, Map<Skill, SkillState>>();
    for (const s of states) { if (!m.has(s.wordId)) m.set(s.wordId, new Map()); m.get(s.wordId)!.set(s.skill, s); }
    return m;
  }, [states]);
  const weak = useMemo(() => new Set(planWeak(states, attempts).map((i) => i.wordId)), [states, attempts]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const kana = needle ? toHiragana(toKana(needle)) : '';
    let list = words.filter((w) => {
      const m = masteryOf([...(byWord.get(w.id)?.values() ?? [])]);
      if (filter === 'new' && m !== 'new') return false;
      if (filter === 'learning' && m !== 'learning') return false;
      if (filter === 'known' && m !== 'known') return false;
      if (filter === 'weak' && !weak.has(w.id)) return false;
      if (filter === 'fav' && !w.favourite) return false;
      if (topic && w.topic !== topic) return false;
      if (!needle) return true;
      const hay = `${w.text} ${w.reading} ${toHiragana(w.reading)} ${w.meaning} ${w.topic ?? ''} ${w.unit ?? ''} ${w.note ?? ''}`.toLowerCase();
      return hay.includes(needle) || (kana !== '' && hay.includes(kana));
    });
    if (sort === 'newest') list = [...list].sort((a, b) => b.createdAt - a.createdAt);
    if (sort === 'reading') list = [...list].sort((a, b) => toHiragana(a.reading).localeCompare(toHiragana(b.reading), 'ja'));
    return list;
  }, [words, byWord, weak, q, filter, sort, topic]);

  const groups = useMemo(() => {
    if (sort !== 'topic') return [['', shown]] as [string, Word[]][];
    const m = new Map<string, Word[]>();
    for (const w of shown) { const t = w.topic ?? 'No topic'; m.set(t, [...(m.get(t) ?? []), w]); }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [shown, sort]);

  const row = (w: Word) => (
    <button key={w.id} class="row tap" onClick={() => onOpen(w.id)}>
      <span><span class="j" lang="ja" style="font-size:21px">{w.text}</span>{w.reading !== w.text && <> <span class="m" lang="ja">{w.reading}</span></>}</span>
      <span style="text-align:right;flex:none"><span style="font-size:14px;display:block">{w.meaning}</span><Squares states={byWord.get(w.id) ?? new Map()} /></span>
    </button>
  );
  return (
    <div class="screen">
      <div class="head"><h1>Notebook</h1>
        <button class="btn accent" onClick={onAdd} aria-label="Add or import words"><Icon name="plus" size={18} /> Add</button>
        <button class="icon-btn ring" aria-label="Settings" onClick={onSettings}><Icon name="gear" size={20} /></button>
      </div>
      <input class="input" type="search" aria-label="Search" placeholder={`Search ${words.length} words`} value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} enterkeyhint="search" autocapitalize="off" autocorrect="off" />
      <div style="display:flex;gap:8px;margin-top:8px">
        <select class="select" style="flex:1;min-width:0" aria-label="Topic" value={topic} onChange={(e) => setTopic((e.target as HTMLSelectElement).value)}>
          <option value="">All topics</option>{topics.map(([t, n]) => <option key={t} value={t}>{t} ({n})</option>)}
        </select>
        <select class="select" style="width:auto;flex:none" aria-label="Sort" value={sort} onChange={(e) => setSort((e.target as HTMLSelectElement).value as Sort)}>
          <option value="topic">By topic</option><option value="newest">Newest</option><option value="reading">A to Z</option>
        </select>
      </div>
      <div class="chips" style="margin-top:10px">{FILTERS.map(([k, l]) => <button key={k} class="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>)}</div>
      {words.length === 0 ? (
        <div class="empty"><span class="j">単</span>Your notebook is empty.<br />Add a word, or photograph a handwritten list.<div style="margin-top:16px"><button class="btn primary" style="max-width:240px" onClick={onAdd}>Add words</button></div></div>
      ) : shown.length === 0 ? (
        <div class="empty">Nothing matches.</div>
      ) : groups.map(([topic, list]) => (
        <div key={topic}>{topic && <div class="eyebrow">{topic}</div>}<div class="list">{list.map(row)}</div></div>
      ))}
    </div>
  );
}
