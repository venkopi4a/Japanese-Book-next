# What has been tested (version 0.4.0, warm redesign)

## Automated rules and data tests: 116 tests, all passing (`npm test`)
data 8, answer checking and romaji 21, scheduler and sessions 17, distractors and statistics 11, review rules 9,
photo import (database upgrade, duplicates, saving, drafts, recognition providers, cancellation) 12.

## Browser tests in real headless Chromium at iPhone size (390 by 844): `npm run e2e`
Four suites in `e2e/`, 92 checks, run by `e2e/run-all.mjs` after building the app:
- `e2e.mjs` (24): first run seeds 10 new words, no sideways scrolling on any tab, notebook grouped by topic, search (including romaji),
  word detail, adding a word by hand, a full practice session (new-word flashcards), attempts and skill states stored in IndexedDB,
  typed spelling that refuses romaji, a typed mistake explained, beginner romaji reading, service worker active, no console errors.
  (Its quick "offline" check uses the browser's offline switch, which does not cover service workers. The real offline proof is `offline.mjs`.)
- `e2e-photo.mjs` (56): the complete photo-import workflow including EXIF-rotated and small photos, review, corrections, duplicates, saving, drafts.
- `e2e-kana.mjs` (43): first launch and naming, the lesson path, a short lesson that is left halfway and continued where it stopped, the matching game, the end screen and Next lesson, (including the letter pad, "Skip for now" and renaming without the phone keyboard), the vocabulary gate, the kana chart, a full kana lesson (learn cards, sight and sound checks, one extra try for a miss), hiragana unlocking vocabulary, teach-first word lessons, reading help on answer options, the new Progress screen, the voice picker and its iPhone help, and two people with separate progress.
- `e2e-fail.mjs` (5): a failed recognition shows a clear error and saves nothing (uses a test-only build, `VITE_RECOGNISER=fail`).
- `offline.mjs` (7): update prompt after a new version is published, and a genuine offline start with the web server stopped.
Known gap: the earlier, wider browser checks for topic choosing and streak behaviour could not be recovered after a lost working copy;
the unit tests still cover the rules behind them. Re-adding browser checks for the topic picker is a good first job.

## NOT tested yet
- Real iPhone Safari and the installed Home Screen app (iOS 18.7.8): camera and photo picker, touch dragging of the crop frame,
  keyboard behaviour, safe areas, install.
- Animation in motion (falling petals, blossom pop) and spoken audio: screenshots cannot show them and headless Chromium has no Japanese voice.
- Real handwriting recognition: not connected. The placeholder returns fixed sample words.
