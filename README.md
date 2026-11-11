# THE JAPANESE BOOK (単語帳)

Version 0.5.0: one picker for each person on the device, a kana course (hiragana then katakana) that comes before vocabulary, new words taught before they are tested, a voice picker, and a redesigned Progress screen. Also: the working app (Today, Notebook, Practice, Progress, word detail and editing, settings) plus the complete photo import
workflow (take or choose photos, crop, recognise through a labelled placeholder, review, confirm, save). Offline and installable.
Accounts and sync are Stage 3. Nothing here touches your live app.

## Folders
- `src/domain/` the rules: strict Japanese answer checking, spaced repetition, daily plans, near-miss options, evidence-based statistics, beginner romaji mode (reading only).
- `src/data/` local storage (one database per account) and the 104-word starter library.
- `src/import/` the safety rules for photo import: nothing uncertain is saved until you confirm it.
- `src/recognise/` the recognition provider interface and the placeholder (see `docs/RECOGNITION.md`).
- `src/ui/`, `src/app/` the screens and app state. `src/styles.css` is the whole design system.
- `tests/` 105 automated tests. `e2e/` real-browser tests (`npm run e2e`). `docs/` architecture, publishing, testing notes, katakana corrections.
- `.github/workflows/` automatic checks on pull requests and automatic publishing on merge. `CLAUDE.md` is the guide for Claude Code.

## Commands (run by Claude, not by you)
`npm test`, `npm run typecheck`, `npm run e2e`, `VITE_BASE=/Japanese-Book-next/ npm run build`. Publishing: see `docs/PUBLISHING.md`.
