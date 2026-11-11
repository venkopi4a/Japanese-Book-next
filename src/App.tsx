import { useState } from 'preact/hooks';
import { Icon } from './app/icons';
import { AddSheet } from './ui/AddSheet';
import { Notebook } from './ui/Notebook';
import { PhotoFlow } from './ui/PhotoFlow';
import { Practice } from './ui/Practice';
import { Progress } from './ui/Progress';
import { Session, type SessionItem } from './ui/Session';
import { SettingsSheet } from './ui/SettingsSheet';
import { Today } from './ui/Today';
import { WordSheet } from './ui/WordSheet';

type Tab = 'today' | 'notebook' | 'practice' | 'progress';
const TABS: [Tab, string][] = [['today', 'Today'], ['notebook', 'Notebook'], ['practice', 'Practice'], ['progress', 'Progress']];

export function App() {
  const [tab, setTab] = useState<Tab>('today');
  const [session, setSession] = useState<{ title: string; items: SessionItem[]; key: number } | null>(null);
  const [word, setWord] = useState<{ id: string | null } | null>(null);
  const [settings, setSettings] = useState(false);
  const [pTopics, setPTopics] = useState<{ topics: string[]; key: number }>({ topics: [], key: 0 });
  const start = (title: string, items: SessionItem[]) => items.length && setSession({ title, items, key: Date.now() });
  const [addOpen, setAddOpen] = useState(false);
  const [flow, setFlow] = useState<{ files: File[]; resume: boolean; key: number } | null>(null);
  const add = () => setAddOpen(true);
  return (
    <div class="shell">
      {tab === 'today' && <Today onStart={start} onAdd={add} onSettings={() => setSettings(true)} onTopic={(t) => { setPTopics({ topics: [t], key: Date.now() }); setTab('practice'); }} />}
      {tab === 'notebook' && <Notebook onOpen={(id) => setWord({ id })} onAdd={add} onSettings={() => setSettings(true)} />}
      {tab === 'practice' && <Practice key={pTopics.key} initialTopics={pTopics.topics} onStart={start} onAdd={add} onSettings={() => setSettings(true)} />}
      {tab === 'progress' && <Progress onAdd={add} onSettings={() => setSettings(true)} onOpen={(id) => setWord({ id })} />}
      <nav class="tabbar" aria-label="Main">
        {TABS.map(([k, label]) => <button key={k} aria-current={tab === k ? 'page' : undefined} onClick={() => setTab(k)}><Icon name={k} />{label}</button>)}
      </nav>
      {session && <Session key={session.key} title={session.title} items={session.items} onClose={() => setSession(null)} onAgain={(items) => setSession({ title: 'Missed words', items, key: Date.now() })} />}
      {word && <WordSheet key={word.id ?? 'new'} wordId={word.id} onClose={() => setWord(null)} />}
      {addOpen && <AddSheet onClose={() => setAddOpen(false)} onType={() => { setAddOpen(false); setWord({ id: null }); }}
        onPick={(files) => { setAddOpen(false); setFlow({ files, resume: false, key: Date.now() }); }}
        onResume={() => { setAddOpen(false); setFlow({ files: [], resume: true, key: Date.now() }); }} />}
      {flow && <PhotoFlow key={flow.key} files={flow.files} resume={flow.resume} onClose={() => setFlow(null)} onPractise={(items) => start('New words', items)} />}
      {settings && <SettingsSheet onClose={() => setSettings(false)} />}
    </div>
  );
}
