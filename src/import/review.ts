import { isKanaOnly, normaliseAnswer } from '../domain/kana';
import type { Word } from '../domain/types';

export type Confidence = 'high' | 'medium' | 'low';

export interface RecognisedEntry {
  text: string; reading: string; meaning: string;
  topic: string | null; note: string | null; confidence: Confidence; issues: string[];
  /** Index of the photo it was read from (null for words typed by hand). */
  photo: number | null;
}

export const MAX_ENTRIES = 300;
const clean = (v: unknown, max = 200) =>
  typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().normalize('NFC').slice(0, max) : '';

/**
 * Validates what a recognition service returned. Nothing is trusted: strings are cleaned and capped,
 * a missing or unknown confidence counts as low, and entries are flagged rather than silently dropped.
 */
export function parseRecognition(raw: unknown): { entries: RecognisedEntry[]; warnings: string[] } {
  const warnings: string[] = [];
  const list = raw && typeof raw === 'object' && Array.isArray((raw as { entries?: unknown }).entries) ? (raw as { entries: unknown[] }).entries : null;
  if (!list) return { entries: [], warnings: ['The recognition result had no entries.'] };
  if (list.length > MAX_ENTRIES) warnings.push(`Only the first ${MAX_ENTRIES} entries were read.`);
  const entries: RecognisedEntry[] = [];
  for (const item of list.slice(0, MAX_ENTRIES)) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const text = clean(o.text);
    if (!text) continue;
    const conf = o.confidence === 'high' || o.confidence === 'medium' ? o.confidence : 'low';
    const issues = Array.isArray(o.issues) ? o.issues.map((i) => clean(i, 120)).filter(Boolean).slice(0, 5) : [];
    entries.push({ text, reading: clean(o.reading), meaning: clean(o.meaning), topic: clean(o.topic, 60) || null, note: clean(o.note, 300) || null, confidence: conf, issues, photo: Number.isInteger(o.photo) && (o.photo as number) >= 0 ? (o.photo as number) : null });
  }
  return { entries, warnings };
}

export type ReviewStatus = 'confirmed' | 'needs-check' | 'duplicate' | 'removed';
export interface ReviewItem { key: string; entry: RecognisedEntry; status: ReviewStatus; duplicateOf: string | null; reasons: string[]; origin: 'recognised' | 'manual' }

const dupKey = (text: string, reading: string) => `${normaliseAnswer(text)}|${normaliseAnswer(reading)}`;

/** Builds the review list. Anything uncertain starts as needs-check and never saves until the person confirms it. */
function reasonsFor(entry: RecognisedEntry): string[] {
  const reasons: string[] = [];
  if (entry.confidence !== 'high') reasons.push('Handwriting was not clear');
  if (!entry.meaning) reasons.push('No meaning found');
  if (!entry.reading) reasons.push('No reading found');
  else if (!isKanaOnly(entry.reading)) reasons.push('Reading is not kana');
  for (const issue of entry.issues) reasons.push(issue);
  return reasons;
}

/** Builds the review list. Anything uncertain starts as needs-check and never saves until the person confirms it. */
export function buildReview(entries: RecognisedEntry[], existing: Word[]): ReviewItem[] {
  const items: ReviewItem[] = entries.map((entry, i) => {
    const reasons = reasonsFor(entry);
    return { key: `r${i}`, entry, status: reasons.length ? 'needs-check' : 'confirmed', duplicateOf: null, reasons, origin: 'recognised' };
  });
  return refreshDuplicates(items, existing);
}

/**
 * Re-checks every item for duplicates after any change. A word already in the notebook, or repeated earlier in the batch, is a duplicate.
 * An item that stops being a duplicate because it was edited goes back to needs-check: an edit is not a confirmation.
 */
export function refreshDuplicates(items: ReviewItem[], existing: Word[]): ReviewItem[] {
  const known = new Map(existing.filter((w) => !w.deletedAt).map((w) => [dupKey(w.text, w.reading), w.id]));
  return items.map((item, i) => {
    if (item.status === 'removed') return item;
    const k = dupKey(item.entry.text, item.entry.reading);
    const dupOf = k === '|' ? null : known.get(k) ?? null;
    if (!dupOf && k !== '|') known.set(k, `batch:${i}`);
    if (dupOf) return { ...item, status: 'duplicate' as const, duplicateOf: dupOf };
    if (item.status === 'duplicate') return { ...item, status: 'needs-check' as const, duplicateOf: null, reasons: ['Edited: please check it', ...reasonsFor(item.entry)] };
    return { ...item, duplicateOf: null };
  });
}

/** A word the person typed in by hand while reviewing. Typing it is their own confirmation. */
export function manualItem(key: string, entry: Pick<RecognisedEntry, 'text' | 'reading' | 'meaning'> & Partial<RecognisedEntry>): ReviewItem {
  return { key, origin: 'manual', status: 'confirmed', duplicateOf: null, reasons: [], entry: { topic: null, note: null, confidence: 'high', issues: [], photo: null, ...entry } };
}

export function summarise(items: ReviewItem[]) {
  const ready = readyToSave(items);
  return { ready: ready.save.length, needsCheck: ready.blocked.length, duplicates: items.filter((i) => i.status === 'duplicate').length, removed: items.filter((i) => i.status === 'removed').length };
}

export const confirmItem = (item: ReviewItem): ReviewItem => ({ ...item, status: 'confirmed', reasons: [] });
export const removeItem = (item: ReviewItem): ReviewItem => ({ ...item, status: 'removed' });
export const editItem = (item: ReviewItem, patch: Partial<Pick<RecognisedEntry, 'text' | 'reading' | 'meaning' | 'topic' | 'note'>>): ReviewItem =>
  ({ ...item, entry: { ...item.entry, ...patch } }); // editing alone never confirms an item

/** Only confirmed items save. Items still needing a check are reported back, never saved quietly. */
export function readyToSave(items: ReviewItem[]) {
  return {
    save: items.filter((i) => i.status === 'confirmed' && i.entry.text && i.entry.meaning && i.entry.reading),
    blocked: items.filter((i) => i.status === 'needs-check'),
  };
}
