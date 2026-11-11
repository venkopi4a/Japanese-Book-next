import { parseRecognition, type RecognisedEntry } from '../import/review';

/**
 * Recognition providers are kept separate from the app on purpose, so several can be compared on the same
 * handwriting samples (accuracy, speed, cost) before one is chosen. A provider receives one cropped photo and
 * returns an object shaped like { entries: [{ text, reading, meaning, topic?, note?, confidence, issues? }] }.
 * Whatever it returns is validated by parseRecognition; nothing a provider says is trusted.
 */
export interface PhotoInput { blob: Blob; index: number; width: number; height: number }
export interface Recogniser {
  id: string;
  label: string;
  /** True when results are sample data and not read from the photo. The interface says so. */
  isPlaceholder: boolean;
  recognise(photo: PhotoInput, signal?: AbortSignal): Promise<unknown>;
}

export interface RecognitionOutcome { entries: RecognisedEntry[]; warnings: string[]; failed: number[] }

const aborted = () => new DOMException('Cancelled', 'AbortError');

export async function recogniseAll(
  photos: PhotoInput[], recogniser: Recogniser,
  opts: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void } = {},
): Promise<RecognitionOutcome> {
  const out: RecognitionOutcome = { entries: [], warnings: [], failed: [] };
  for (const photo of photos) {
    if (opts.signal?.aborted) throw aborted();
    opts.onProgress?.(photo.index, photos.length);
    try {
      const raw = await recogniser.recognise(photo, opts.signal);
      const { entries, warnings } = parseRecognition(raw);
      out.entries.push(...entries.map((e) => ({ ...e, photo: photo.index })));
      out.warnings.push(...warnings);
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      out.failed.push(photo.index);
    }
  }
  return out;
}

const SAMPLES: unknown[][] = [
  [
    { text: '電車', reading: 'でんしゃ', meaning: 'train', confidence: 'high' },
    { text: '駅', reading: 'えき', meaning: 'station', confidence: 'high' },
    { text: '荷物', reading: 'にもつ', meaning: 'luggage', confidence: 'medium', issues: ['Second character unclear'] },
    { text: '学生', reading: 'がくせい', meaning: 'student', confidence: 'high' },
    { text: '乗り換え', reading: 'のりかえ', meaning: '', confidence: 'medium' },
  ],
  [
    { text: '旅行', reading: 'りょこう', meaning: 'trip', confidence: 'high' },
    { text: '飛行機', reading: 'ひこうき', meaning: 'airplane', confidence: 'high' },
  ],
];

/** Stands in for real recognition. It does NOT read the photo: it returns fixed sample words so the whole workflow can be used and tested. */
export const placeholderRecogniser: Recogniser = {
  id: 'placeholder',
  label: 'Placeholder (sample words, not read from your photo)',
  isPlaceholder: true,
  recognise(photo, signal) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(aborted());
      const t = setTimeout(() => resolve({ entries: SAMPLES[photo.index % SAMPLES.length] }), 1100);
      signal?.addEventListener('abort', () => { clearTimeout(t); reject(aborted()); }, { once: true });
    });
  },
};

/** Used only by the test build (VITE_RECOGNISER=fail) to check the error screen. It is removed from the normal build. */
const failingRecogniser: Recogniser = { id: 'test-fail', label: 'Always fails (tests only)', isPlaceholder: false, recognise: async () => { throw new Error('simulated failure'); } };

/** The recogniser the app uses. Swap this single line when a real provider has been chosen. */
export const activeRecogniser: Recogniser = import.meta.env.VITE_RECOGNISER === 'fail' ? failingRecogniser : placeholderRecogniser;
