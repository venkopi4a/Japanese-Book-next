import type { Attempt, SkillState, Word } from '../domain/types';
import type { PhotoRecord, SessionRecord } from './db';
import type { Repo } from './repo';
import { APP_VERSION } from './repo';

/**
 * A backup is one JSON file with everything a person has on this device: words, answers, skill progress,
 * sessions, the kept photos and the settings. Restoring only ever adds or updates, it never deletes.
 */
export const BACKUP_FORMAT = 'japanese-book-backup';
export const BACKUP_VERSION = 1;

export interface PhotoFile { id: string; width: number; height: number; createdAt: number; type: string; data: string }
export interface Snapshot { words: Word[]; skillStates: SkillState[]; attempts: Attempt[]; sessions: SessionRecord[]; photos: PhotoRecord[]; librarySeen: string[] }
export interface BackupFile {
  format: typeof BACKUP_FORMAT; version: number; app: string; exportedAt: number;
  profile: { name: string };
  settings: Record<string, unknown>;
  data: Omit<Snapshot, 'photos'> & { photos: PhotoFile[] };
}
export interface BackupSummary { words: number; attempts: number; photos: number }
export interface MergeResult { words: number; skillStates: number; attempts: number; sessions: number; photos: number }

const b64 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function buildBackup(repo: Repo, profile: { name: string }, settings: Record<string, unknown>, now = Date.now()): Promise<{ text: string; name: string; summary: BackupSummary }> {
  const snap = await repo.snapshot();
  const photos: PhotoFile[] = [];
  for (const p of snap.photos) photos.push({ id: p.id, width: p.width, height: p.height, createdAt: p.createdAt, type: p.blob.type, data: b64(new Uint8Array(await p.blob.arrayBuffer())) });
  const file: BackupFile = { format: BACKUP_FORMAT, version: BACKUP_VERSION, app: APP_VERSION, exportedAt: now, profile: { name: profile.name }, settings, data: { ...snap, photos } };
  const day = new Date(now).toISOString().slice(0, 10);
  const who = profile.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'backup';
  return { text: JSON.stringify(file), name: `japanese-book-${who}-${day}.json`, summary: { words: snap.words.length, attempts: snap.attempts.length, photos: photos.length } };
}

export class BackupError extends Error {}

const isStr = (v: unknown) => typeof v === 'string';
const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

/** Reads and checks a backup file. Throws a plain-language BackupError and touches nothing if anything is wrong. */
export function parseBackup(text: string): { file: BackupFile; snapshot: Snapshot; summary: BackupSummary } {
  let raw: any;
  try { raw = JSON.parse(text); } catch { throw new BackupError('This is not a backup file from THE JAPANESE BOOK.'); }
  if (!raw || raw.format !== BACKUP_FORMAT) throw new BackupError('This is not a backup file from THE JAPANESE BOOK.');
  if (!isNum(raw.version) || raw.version > BACKUP_VERSION) throw new BackupError('This backup was made by a newer version of the app. Update the app first, then try again.');
  const d = raw.data;
  if (!d || ![d.words, d.skillStates, d.attempts, d.sessions, d.photos, d.librarySeen].every(Array.isArray)) throw new BackupError('This backup file is incomplete, so nothing was changed.');
  const bad =
    d.words.some((w: any) => !w || !isStr(w.id) || !isStr(w.text) || !isStr(w.reading) || !isStr(w.meaning) || !isNum(w.updatedAt) || !isNum(w.createdAt)) ||
    d.skillStates.some((s: any) => !s || !isStr(s.wordId) || !isStr(s.skill) || !isNum(s.box) || !isNum(s.dueAt) || !isNum(s.introducedAt)) ||
    d.attempts.some((a: any) => !a || !isStr(a.id) || !isStr(a.wordId) || !isNum(a.ts)) ||
    d.sessions.some((s: any) => !s || !isStr(s.id)) ||
    d.photos.some((p: any) => !p || !isStr(p.id) || !isStr(p.data) || !isNum(p.width) || !isNum(p.height)) ||
    d.librarySeen.some((x: unknown) => !isStr(x));
  if (bad) throw new BackupError('This backup file is damaged, so nothing was changed.');
  const photos: PhotoRecord[] = d.photos.map((p: PhotoFile) => ({ id: p.id, width: p.width, height: p.height, createdAt: isNum(p.createdAt) ? p.createdAt : 0, blob: new Blob([unb64(p.data)], { type: p.type || 'image/jpeg' }) }));
  const snapshot: Snapshot = { words: d.words, skillStates: d.skillStates, attempts: d.attempts, sessions: d.sessions, photos, librarySeen: d.librarySeen };
  return { file: raw as BackupFile, snapshot, summary: { words: d.words.length, attempts: d.attempts.length, photos: photos.length } };
}

/** Hands the file to the phone's share sheet (Save to Files, AirDrop, Mail) when it can, otherwise downloads it. */
export async function saveBackupFile(text: string, name: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([text], name, { type: 'application/json' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    try { await nav.share({ files: [file], title: name }); return 'shared'; }
    catch (e) { if ((e as DOMException)?.name === 'AbortError') return 'cancelled'; /* fall through to a plain download */ }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'downloaded';
}
