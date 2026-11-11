import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Attempt, SkillState, Word } from '../domain/types';
import type { ReviewItem } from '../import/review';

export interface SessionRecord { id: string; startedAt: number; endedAt: number | null; mode: string }
export interface OutboxEntry {
  id?: number;
  table: 'words' | 'skillStates' | 'attempts' | 'sessions';
  op: 'put' | 'delete';
  key: string;
  payload: unknown;
  createdAt: number;
}

export interface PhotoRecord { id: string; blob: Blob; width: number; height: number; createdAt: number }
/** An unfinished photo import, kept so a reload or an interruption never loses the photos or the review. */
export interface ImportDraft { photos: { id: string; blob: Blob; width: number; height: number }[]; items: ReviewItem[]; topic: string; unit: string; savedAt: number }

interface JBSchema extends DBSchema {
  words: { key: string; value: Word; indexes: { 'by-updated': number } };
  skillStates: { key: [string, string]; value: SkillState; indexes: { 'by-due': number } };
  attempts: { key: string; value: Attempt; indexes: { 'by-word': string; 'by-ts': number } };
  sessions: { key: string; value: SessionRecord };
  outbox: { key: number; value: OutboxEntry };
  meta: { key: string; value: unknown };
  photos: { key: string; value: PhotoRecord };
  drafts: { key: string; value: ImportDraft };
}
export type JBDb = IDBPDatabase<JBSchema>;

export const DB_VERSION = 2;

/** One database per base path and per user, so accounts never share local data. */
export const dbName = (base: string, userKey: string) => `jb:${base}:${userKey}`;

export function openUserDb(name: string): Promise<JBDb> {
  return openDB<JBSchema>(name, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore('words', { keyPath: 'id' }).createIndex('by-updated', 'updatedAt');
        db.createObjectStore('skillStates', { keyPath: ['wordId', 'skill'] }).createIndex('by-due', 'dueAt');
        const attempts = db.createObjectStore('attempts', { keyPath: 'id' });
        attempts.createIndex('by-word', 'wordId');
        attempts.createIndex('by-ts', 'ts');
        db.createObjectStore('sessions', { keyPath: 'id' });
        db.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true });
        db.createObjectStore('meta');
      }
      if (oldVersion < 2) { // version 2 only adds stores: nothing that already exists is touched
        db.createObjectStore('photos', { keyPath: 'id' });
        db.createObjectStore('drafts');
      }
    },
  });
}
