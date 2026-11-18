import { DAY, applyAnswer, newState, startOfDay } from '../domain/scheduler';
import { wordsIntroducedToday } from '../domain/session';
import type { Attempt, ExerciseType, MistakeDetail, Skill, SkillState, Word } from '../domain/types';
import { normaliseAnswer } from '../domain/kana';
import type { ReviewItem } from '../import/review';
import type { MergeResult, Snapshot } from './backup';
import type { ImportDraft, JBDb, OutboxEntry, PhotoRecord, SessionRecord } from './db';
import type { LibraryWord } from './library';

export const APP_VERSION = '0.11.0';
const uuid = () => globalThis.crypto.randomUUID();

export type NewWord = Partial<Word> & Pick<Word, 'text' | 'reading' | 'meaning'>;

export interface AnswerInput {
  /** Only the id is used, so kana (which are not notebook words) can be recorded too. */
  word: Pick<Word, 'id'>; skill: Skill; exercise: ExerciseType;
  shown: string; expected: string; submitted: string;
  correct: boolean; firstTry: boolean;
  responseMs?: number | null; mistakes?: MistakeDetail[]; options?: string[] | null;
  sessionId: string; now?: number;
  /** false: a right answer is recorded but does not move the schedule (extra practice on items that are not due). */
  promote?: boolean;
  /** true right after a lesson: missing an item that was never answered before is not a lapse. */
  learning?: boolean;
}

export class Repo {
  constructor(private db: JBDb) {}

  private async meta<T>(key: string, fallback: T): Promise<T> {
    return ((await this.db.get('meta', key)) as T | undefined) ?? fallback;
  }

  async deviceId(): Promise<string> {
    let id = await this.db.get('meta', 'deviceId') as string | undefined;
    if (!id) { id = uuid(); await this.db.put('meta', id, 'deviceId'); }
    return id;
  }

  /** Adds starter words this account has not received yet. Deleted starter words never come back. */
  async seedLibrary(library: LibraryWord[], now = Date.now()): Promise<number> {
    const seen = new Set(await this.meta<string[]>('librarySeen', []));
    const fresh = library.filter((l) => !seen.has(l.id));
    if (!fresh.length) return 0;
    const tx = this.db.transaction(['words', 'meta', 'outbox'], 'readwrite');
    fresh.forEach((l, i) => {
      const w = blankWord({ text: l.text, reading: l.reading, meaning: l.meaning, topic: l.topic, source: 'library', libraryId: l.id }, now + i);
      tx.objectStore('words').put(w);
      tx.objectStore('outbox').add({ table: 'words', op: 'put', key: w.id, payload: w, createdAt: now });
      seen.add(l.id);
    });
    tx.objectStore('meta').put([...seen], 'librarySeen');
    await tx.done;
    return fresh.length;
  }

  async addWords(input: NewWord[], now = Date.now()): Promise<Word[]> {
    const words = input.map((w, i) => blankWord(w, now + i));
    const tx = this.db.transaction(['words', 'outbox'], 'readwrite');
    for (const w of words) {
      tx.objectStore('words').put(w);
      tx.objectStore('outbox').add({ table: 'words', op: 'put', key: w.id, payload: w, createdAt: now });
    }
    await tx.done;
    return words;
  }

  async listWords(includeDeleted = false): Promise<Word[]> {
    const all = await this.db.getAll('words');
    return includeDeleted ? all : all.filter((w) => !w.deletedAt);
  }

  async updateWord(id: string, patch: Partial<Omit<Word, 'id'>>, now = Date.now()): Promise<Word> {
    const tx = this.db.transaction(['words', 'outbox'], 'readwrite');
    const cur = await tx.objectStore('words').get(id);
    if (!cur) throw new Error(`No word ${id}`);
    const next = { ...cur, ...patch, id, updatedAt: now };
    await tx.objectStore('words').put(next);
    await tx.objectStore('outbox').add({ table: 'words', op: 'put', key: id, payload: next, createdAt: now });
    await tx.done;
    return next;
  }

  /** Soft delete: the word and its history stay recoverable. */
  deleteWord(id: string, now = Date.now()) { return this.updateWord(id, { deletedAt: now }, now); }

  getStates(): Promise<SkillState[]> { return this.db.getAll('skillStates'); }

  async attemptsSince(ts: number): Promise<Attempt[]> {
    return this.db.getAllFromIndex('attempts', 'by-ts', IDBKeyRange.lowerBound(ts));
  }

  /** Counts words whose first skill started today, for the daily new-word limit. Kana are counted separately. */
  async introducedToday(now = Date.now()): Promise<number> {
    return wordsIntroducedToday(await this.getStates(), startOfDay(now));
  }

  /**
   * Teaches a new item: its skill starts at box 0, first due tomorrow. This is a lesson, not an answer,
   * so no attempt is written (statistics only ever come from real answers).
   */
  async introduce(wordId: string, skill: Skill, now = Date.now()): Promise<SkillState> {
    const tx = this.db.transaction(['skillStates', 'outbox'], 'readwrite');
    const existing = await tx.objectStore('skillStates').get([wordId, skill]);
    if (existing) { await tx.done; return existing; }
    const state = { ...newState(wordId, skill, now), dueAt: startOfDay(now) + DAY };
    await tx.objectStore('skillStates').put(state);
    await tx.objectStore('outbox').add({ table: 'skillStates', op: 'put', key: `${wordId}|${skill}`, payload: state, createdAt: now });
    await tx.done;
    return state;
  }

  /** Records one answer. The attempt, the new skill state and the sync queue entries are written together or not at all. */
  async recordAnswer(a: AnswerInput): Promise<{ attempt: Attempt; state: SkillState }> {
    const now = a.now ?? Date.now();
    const deviceId = await this.deviceId();
    const tx = this.db.transaction(['skillStates', 'attempts', 'outbox'], 'readwrite');
    const existing = await tx.objectStore('skillStates').get([a.word.id, a.skill]);
    const base = existing ?? newState(a.word.id, a.skill, now);
    const keep = a.promote === false && a.correct && existing;
    let state = keep ? existing : applyAnswer(base, a.correct, a.firstTry, now);
    // not knowing something that was only just taught (never answered before) is not a lapse
    if (a.learning && !a.correct && (!existing || existing.lastAt === null)) state = { ...state, lapses: base.lapses };
    const attempt: Attempt = {
      id: uuid(), wordId: a.word.id, sessionId: a.sessionId, ts: now, exercise: a.exercise, skill: a.skill,
      shown: a.shown, expected: a.expected, submitted: a.submitted, correct: a.correct, firstTry: a.firstTry,
      boxBefore: existing ? existing.box : null, responseMs: a.responseMs ?? null, mistakes: a.mistakes ?? [],
      options: a.options ?? null, appVersion: APP_VERSION, deviceId,
    };
    await tx.objectStore('attempts').add(attempt);
    const out: Omit<OutboxEntry, 'id'>[] = [{ table: 'attempts', op: 'put', key: attempt.id, payload: attempt, createdAt: now }];
    if (!keep) {
      await tx.objectStore('skillStates').put(state);
      out.push({ table: 'skillStates', op: 'put', key: `${state.wordId}|${state.skill}`, payload: state, createdAt: now });
    }
    for (const e of out) await tx.objectStore('outbox').add(e);
    await tx.done;
    return { attempt, state };
  }

  async startSession(mode: string, now = Date.now()): Promise<SessionRecord> {
    const s: SessionRecord = { id: uuid(), startedAt: now, endedAt: null, mode };
    await this.db.put('sessions', s);
    return s;
  }

  outboxSize(): Promise<number> { return this.db.count('outbox'); }

  // ---- photo import ----
  async savePhotos(photos: { id: string; blob: Blob; width: number; height: number }[], now = Date.now()): Promise<void> {
    const tx = this.db.transaction('photos', 'readwrite');
    for (const p of photos) tx.store.put({ ...p, createdAt: now });
    await tx.done;
  }
  getPhoto(id: string): Promise<PhotoRecord | undefined> { return this.db.get('photos', id); }
  saveDraft(d: ImportDraft) { return this.db.put('drafts', d, 'photo-import'); }
  loadDraft(): Promise<ImportDraft | undefined> { return this.db.get('drafts', 'photo-import'); }
  clearDraft() { return this.db.delete('drafts', 'photo-import'); }

  /**
   * Saves a reviewed batch. Only confirmed items are saved, and each one is checked against the notebook again
   * at this moment, so a duplicate can never slip in even if the notebook changed during the review.
   */
  async addPhotoBatch(items: ReviewItem[], opts: { topic: string | null; unit: string | null; photoIds: (string | null)[]; now?: number }): Promise<{ added: Word[]; skipped: ReviewItem[] }> {
    const now = opts.now ?? Date.now();
    const key = (t: string, r: string) => `${normaliseAnswer(t)}|${normaliseAnswer(r)}`;
    const known = new Set((await this.listWords()).map((w) => key(w.text, w.reading)));
    const toAdd: NewWord[] = [];
    const skipped: ReviewItem[] = [];
    for (const it of items) {
      if (it.status !== 'confirmed' || !it.entry.text || !it.entry.reading || !it.entry.meaning) continue;
      const k = key(it.entry.text, it.entry.reading);
      if (known.has(k)) { skipped.push(it); continue; }
      known.add(k);
      toAdd.push({ text: it.entry.text, reading: it.entry.reading, meaning: it.entry.meaning, topic: opts.topic ?? it.entry.topic, unit: opts.unit, note: it.entry.note, source: 'photo', photoId: it.entry.photo !== null ? opts.photoIds[it.entry.photo] ?? null : null });
    }
    return { added: toAdd.length ? await this.addWords(toAdd, now) : [], skipped };
  }

  // ---- backup ----
  async snapshot(): Promise<Snapshot> {
    const [words, skillStates, attempts, sessions, photos, librarySeen] = await Promise.all([
      this.db.getAll('words'), this.db.getAll('skillStates'), this.db.getAll('attempts'), this.db.getAll('sessions'), this.db.getAll('photos'),
      this.meta<string[]>('librarySeen', []),
    ]);
    return { words, skillStates, attempts, sessions, photos, librarySeen };
  }
  lastBackupAt(): Promise<number | null> { return this.meta<number | null>('lastBackupAt', null); }
  markBackedUp(now = Date.now()) { return this.db.put('meta', now, 'lastBackupAt'); }

  /**
   * Restores a backup by merging it in. Nothing is ever deleted and no existing answer is touched:
   * answers, sessions and photos are added when missing; a word or skill is replaced only by a more recent copy.
   * Built-in words get a fresh random id on every device, so a backup's built-in word is matched to this device's
   * copy by its library id and its answers are attached to that copy (no duplicates).
   * Everything is written in one transaction: it all happens or none of it does.
   */
  async mergeSnapshot(s: Snapshot): Promise<MergeResult> {
    const tx = this.db.transaction(['words', 'skillStates', 'attempts', 'sessions', 'photos', 'meta'], 'readwrite');
    const res: MergeResult = { words: 0, skillStates: 0, attempts: 0, sessions: 0, photos: 0 };
    const words = tx.objectStore('words');
    const local = await words.getAll();
    const localById = new Map(local.map((w) => [w.id, w]));
    const libraryTwin = new Map(local.filter((w) => w.libraryId).map((w) => [w.libraryId!, w.id]));
    const idMap = new Map<string, string>();
    for (const w of s.words) idMap.set(w.id, (w.libraryId && libraryTwin.get(w.libraryId)) || w.id);
    const mapId = (id: string) => idMap.get(id) ?? id;

    for (const w of s.words) {
      const id = mapId(w.id);
      const cur = localById.get(id);
      // a built-in word this device never touched is only a fresh copy: the backup's version (edits, favourite, deleted) wins
      const untouched = !!cur && cur.updatedAt === cur.createdAt && cur.deletedAt === null;
      const backupEdited = w.updatedAt !== w.createdAt;
      if (!cur || w.updatedAt > cur.updatedAt || (untouched && backupEdited)) { words.put({ ...w, id }); res.words++; }
    }

    const states = tx.objectStore('skillStates');
    const have = new Map((await states.getAll()).map((x) => [`${x.wordId}|${x.skill}`, x]));
    const when = (x: SkillState) => x.lastAt ?? x.introducedAt;
    for (const st of s.skillStates) {
      const next = { ...st, wordId: mapId(st.wordId) };
      const cur = have.get(`${next.wordId}|${next.skill}`);
      if (!cur || when(next) > when(cur)) { states.put(next); res.skillStates++; }
    }

    const attempts = tx.objectStore('attempts');
    const attemptIds = new Set(await attempts.getAllKeys());
    for (const a of s.attempts) if (!attemptIds.has(a.id)) { attempts.add({ ...a, wordId: mapId(a.wordId) }); res.attempts++; }

    const sessions = tx.objectStore('sessions');
    const sessionIds = new Set(await sessions.getAllKeys());
    for (const x of s.sessions) if (!sessionIds.has(x.id)) { sessions.add(x); res.sessions++; }

    const photos = tx.objectStore('photos');
    const photoIds = new Set(await photos.getAllKeys());
    for (const p of s.photos) if (!photoIds.has(p.id)) { photos.add(p); res.photos++; }

    const meta = tx.objectStore('meta');
    const seen = new Set<string>(((await meta.get('librarySeen')) as string[] | undefined) ?? []);
    s.librarySeen.forEach((x) => seen.add(x));
    meta.put([...seen], 'librarySeen');
    await tx.done;
    return res;
  }

  /** Clears everything this account stored on this device (used when signing out). */
  async wipe(): Promise<void> {
    const names = ['words', 'skillStates', 'attempts', 'sessions', 'outbox', 'meta', 'photos', 'drafts'] as const;
    const tx = this.db.transaction([...names], 'readwrite');
    await Promise.all(names.map((n) => tx.objectStore(n).clear()));
    await tx.done;
  }
}

export function blankWord(w: NewWord, now: number): Word {
  return {
    id: w.id ?? uuid(), kind: w.kind ?? 'word', text: w.text, reading: w.reading, meaning: w.meaning,
    topic: w.topic ?? null, unit: w.unit ?? null, note: w.note ?? null, examples: w.examples ?? [],
    accepted: w.accepted ?? [], source: w.source ?? 'user', libraryId: w.libraryId ?? null, photoId: w.photoId ?? null,
    favourite: w.favourite ?? false, createdAt: now, updatedAt: now, deletedAt: null,
  };
}
