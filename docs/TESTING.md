# What has been tested (version 0.4.0, warm redesign)

## Automated rules and data tests: 122 tests, all passing (`npm test`)
data 8, answer checking and romaji 21, scheduler and sessions 17, distractors and statistics 11, review rules 9,
photo import (database upgrade, duplicates, saving, drafts, recognition providers, cancellation) 12.

## Browser tests in real headless Chromium at iPhone size (390 by 844): `npm run e2e`
Four suites in `e2e/`, 92 checks, run by `e2e/run-all.mjs` after building the app:
- `e2e.mjs` (24): first run seeds 10 new words, no sideways scrolling on any tab, notebook grouped by topic, search (including romaji),
  word detail, adding a word by hand, a full practice session (new-word flashcards), attempts and skill states stored in IndexedDB,
  typed spelling that refuses romaji, a typed mistake explained, beginner romaji reading, service worker active, no console errors.
  (Its quick "offline" check uses the browser's offline switch, which does not cover service workers. The real offline proof is `offline.mjs`.)
- `e2e-photo.mjs` (56): the complete photo-import workflow including EXIF-rotated and small photos, review, corrections, duplicates, saving, drafts.
- `e2e-kana.mjs` (48): first launch and naming, the lesson path, a short lesson that is left halfway and continued where it stopped, the matching game, the end screen and Next lesson, (including the letter pad, "Skip for now" and renaming without the phone keyboard), the vocabulary gate, the kana chart, a full kana lesson (learn cards, sight and sound checks, one extra try for a miss), hiragana unlocking vocabulary, teach-first word lessons, reading help on answer options, the new Progress screen, the voice picker and its iPhone help, and two people with separate progress.
- `e2e-fail.mjs` (5): a failed recognition shows a clear error and saves nothing (uses a test-only build, `VITE_RECOGNISER=fail`).
- `offline.mjs` (7): update prompt after a new version is published, and a genuine offline start with the web server stopped.
Known gap: the earlier, wider browser checks for topic choosing and streak behaviour could not be recovered after a lost working copy;
the unit tests still cover the rules behind them. Re-adding browser checks for the topic picker is a good first job.

## NOT tested yet
- Real iPhone Safari and the installed Home Screen app (iOS 18.7.8): camera and photo picker, touch dragging of the crop frame,
  keyboard behaviour, safe areas, install.
- Animation in motion (falling petals, blossom pop) and spoken audio: screenshots cannot show them and headless Chromium has no Japanese voice.
- Real handwriting recognition: not connected. The placeholder returns fixed sample words.

## Writing help (v0.8.0)
- Unit tests (`tests/writing.test.ts`): stroke data exists for every course kana with one number per stroke, stroke counts of known kana (い 2, あ 3, し 1, が = か + 2, ぱ = は + 1), an origin for each of the 46 basic hiragana, romaji spelling.
- Browser suite `e2e/e2e-writing.mjs`: the lesson card draws あ in 3 numbered strokes and explains 安, Step and Play work, the kana sheet from the chart (い, ふ, が, a combination, katakana), romaji on all 104 Notebook rows and in the word sheet.
- Not tested: drawing with a finger (tracing practice does not exist yet), and how the animation looks in motion on a real iPhone.
- Tracing (`tests/trace.test.ts`, `tests/traceAll.test.ts`): the stroke judge accepts a shaky offset copy of every stroke of every course kana, refuses backwards or far-off strokes and shortcuts. Browser suite: real mouse drags along the strokes of あ (refused from the wrong place, backwards, as a straight shortcut; accepted with a wobble; well done; from memory; nothing written to the history).
- Not tested: tracing with a real finger on a real iPhone (touch-action, palm, scroll conflicts).

## Backup and restore (v0.10.0)
- Unit tests (`tests/backup.test.ts`): a full round trip onto a brand new phone (its own freshly seeded built-in words are matched by library id, so there are no duplicates and progress attaches to them; a deleted built-in word stays deleted; photos survive byte for byte); restoring twice changes nothing and never overwrites newer local work or touches existing attempts; two phones merge; wrong, newer, incomplete and damaged files are refused with a plain message and nothing is written.
- Browser suite `e2e/e2e-backup.mjs`: make a backup in Settings (the file name and counts are shown), delete the person's data, add them again, restore (everything is back, 104 words, no duplicates), restore again (nothing changes), a wrong file is refused.
- Not tested: the iPhone share sheet (Save to Files, AirDrop), reading a file from the Files app, and a backup with many large photos on a real phone. Without a share sheet the app downloads the file instead.

## Word lookup (v0.11.0)
- Unit tests (`tests/lookup.test.ts`): on the real dictionary, 38 everyday English words each find the right Japanese word in the top 3 (cat 猫, dog 犬, station 駅, to drink 飲む, thank you ありがとう...), the clearest eight are first; "to eat" prefers verbs; meanings are short with notes removed; nested notes and diacritics are normalised; empty, one-letter and nonsense queries are safe; Japanese queries work; lookups take well under 200 ms.
- Browser suite `e2e/e2e-lookup.mjs`: Add > Look up a word, type cat, 猫 first with reading and romaji, add it (saved with reading, meaning, kind), add a verb in the same visit, a word already in the notebook shows "In notebook" and cannot be added twice, no-match message, the by-hand fallback opens, and the dictionary works with the network off.
- Not tested: typing with the iPhone keyboard, and whether the right word is first for every English word. The ranking is a heuristic (word frequency plus how well the English matches); the person always sees several choices.
- Romaji (v0.12.0): 30 romaji spellings each find the right word in the top 3 (neko, tsukue/tukue, gakkou/gakkō, ookii/ōkii, konnichiwa/konnichiha...); the exact spelling is first for clear words; a partial word (nek) finds 猫; English still wins for cat, dog, water; spelling variants fold together; the browser suite adds a word from romaji (tsukue -> 机) and checks "In notebook" for a built-in one.

