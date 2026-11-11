# THE JAPANESE BOOK (単語帳): guide for Claude Code

A vocabulary-focused Japanese-learning PWA for two people (Venko and his girlfriend). Each has an independent account;
only the 104-word starter library is shared. Preact + TypeScript + Vite, IndexedDB (idb), wanakana, Vitest.
Hosted on GitHub Pages from this repo (`Japanese-Book-next`). The old app lives in a different repo (`Japanese-Book`) and must never be touched.

## About the owner
Venko uses only the GitHub website (no terminal, no git CLI). Every instruction to him must be exact click-by-click
GitHub-website steps. He is direct and wants blunt, structured answers: state the risk, then why; no filler.
You (Claude Code) work on branches and open PRs; he merges them in the browser.

## Commands
- `npm ci` install · `npm run typecheck` · `npm test` (78 unit tests) · `npm run build`
- `VITE_BASE=/Japanese-Book-next/ npm run build` builds for the live address
- `npm run e2e` builds, then runs four real-browser suites (headless Chromium, 390x844): main flows, photo import, recognition failure, offline/update.
  Screenshots go to `e2e/out/` (git-ignored). First run needs no extra setup (`@sparticuz/chromium` is a dev dependency).
- Before saying anything is done: typecheck + `npm test` + `npm run e2e` must all pass. Look at screenshots for visual changes.

## Hard rules (do not break; each has a test)
1. Typed spelling never accepts romaji and never strips dakuten/handakuten. Romaji input is allowed only for the *reading* skill in beginner mode (Settings).
2. Only NFKC normalisation is applied to answers. Mistakes are classified by edit-distance diff (dakuten, handakuten, small-kana, long-vowel, script, confusable, substitution, missing, extra). `nearDiff` only diagnoses near misses so random guesses never feed confusion stats.
3. Attempts are append-only (never edited or deleted). Statistics are derived from attempts. A confusion pair is shown only at >=3 occurrences across >=2 words; retention only with >=10 samples.
4. Scheduler: Leitner boxes 0-6, intervals 0,1,2,4,8,16,32 days. Only first-try-correct counts. Daily new-word limit 10. Every plan item has a plain-language reason. A missed new-word flashcard is not a lapse. Extra practice (`promote:false`) never advances the schedule. A missed quiz item gets exactly one extra try at session end.
5. Skill unlocks: recognition first; recall/listening/reading at recognition box >=2; spelling at recall box >=2.
6. Photo import never saves anything unconfirmed. Statuses: confirmed, needs-check, duplicate, removed. Editing never auto-confirms. Duplicates are re-checked at save. The original photo is kept. Drafts survive reloads.
7. Recognition is behind the `Recogniser` interface (`src/recognise/provider.ts`). Today it is a clearly labelled placeholder. No real provider yet: costs money and needs a secret key.
8. No secrets in the repo or the frontend, ever. A real provider key lives only in a Supabase Edge Function.
9. Storage is per account and per base path (`jb:<BASE_URL>:local`). Never read or clear another app's data on the same origin (the old app uses cache `jpbook-v5`, a localStorage prefix and an IndexedDB named `japanese-book`). The service worker only deletes caches with its own prefix.
10. Never ask Venko to run terminal commands. Never push to `main` directly, always branch + PR.

## Layout
`src/domain/` rules (pure, heavily tested) · `src/data/` db, repo, library · `src/import/review.ts` import rules · `src/recognise/` provider interface · `src/app/` state, settings, exercise builder, speech, image · `src/ui/` screens · `src/styles.css` the whole design system · `vite.config.ts` (also generates `sw.js` at build time) · `tests/` unit tests · `e2e/` browser tests · `docs/` architecture, recognition, testing, publishing.

## Design direction
Warm, illustrated, matches the app icon (sakura, red sun, Mount Fuji, indigo). Mobile-first for iPhone 12 Pro. Light and dark themes. Practice: flashcards for new words, quizzes for reviews, rewarding, gentle on wrong answers.

## Publishing
See `docs/PUBLISHING.md`. A push to `main` runs tests and deploys to GitHub Pages through `.github/workflows/deploy.yml`. Pull requests run `ci.yml`.

## Where we are (v0.4.0) and what is next
Done: Today/Notebook/Practice/Progress, topic selection, strict answer checking, scheduler, photo-import workflow, offline PWA with update prompt, warm redesign.
Not yet tested on a real iPhone: camera/picker, touch-drag cropping, keyboard, safe areas, audio, animations.
Next: (1) verify the Pages deploy works, (2) Stage 3: Supabase accounts (email + password), RLS, sync from the outbox, an Edge Function for recognition, (3) compare recognition providers on 3-5 real handwriting photos from Venko, (4) Progress/word-detail polish, (5) cutover of the live app (only with explicit approval). Explain the cost of any paid service before using it. Free tier first.
