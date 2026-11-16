# THE JAPANESE BOOK (単語帳): guide for Claude Code

A vocabulary-focused Japanese-learning PWA for two people (Venko and his girlfriend). Each has an independent profile
("Who's studying?" picker, local to the device until Stage 3 accounts); only the 104-word starter library is shared. Preact + TypeScript + Vite, IndexedDB (idb), wanakana, Vitest.
Hosted on GitHub Pages from this repo (`Japanese-Book-next`). The old app lives in a different repo (`Japanese-Book`) and must never be touched.

## About the owner
Venko uses only the GitHub website (no terminal, no git CLI). Every instruction to him must be exact click-by-click
GitHub-website steps. He is direct and wants blunt, structured answers: state the risk, then why; no filler.
You (Claude Code) work on branches and open PRs; he merges them in the browser.

## Commands
- `npm ci` install · `npm run typecheck` · `npm test` (143 unit tests) · `npm run build`
- `VITE_BASE=/Japanese-Book-next/ npm run build` builds for the live address
- `npm run e2e` builds, then runs seven real-browser suites (headless Chromium, 390x844): main flows, kana course + profiles + progress, writing help, backup and restore, photo import, recognition failure, offline/update.
  Screenshots go to `e2e/out/` (git-ignored). First run needs no extra setup (`@sparticuz/chromium` is a dev dependency).
- Before saying anything is done: typecheck + `npm test` + `npm run e2e` must all pass. Look at screenshots for visual changes.

## Hard rules (do not break; each has a test)
1. Typed spelling never accepts romaji and never strips dakuten/handakuten. Romaji input is allowed only for the *reading* skill in beginner mode (Settings).
2. Only NFKC normalisation is applied to answers. Mistakes are classified by edit-distance diff (dakuten, handakuten, small-kana, long-vowel, script, confusable, substitution, missing, extra). `nearDiff` only diagnoses near misses so random guesses never feed confusion stats.
3. Attempts are append-only (never edited or deleted). Statistics are derived from attempts. A confusion pair is shown only at >=3 occurrences across >=2 words; retention only with >=10 samples.
4. Scheduler: Leitner boxes 0-6, intervals 0,1,2,4,8,16,32 days. Only first-try-correct counts. Daily new-word limit 10. Every plan item has a plain-language reason. New words are taught first on a lesson card (reading, romaji, meaning, audio all visible; `repo.introduce`, no attempt written) and first quizzed the next day. Extra practice (`promote:false`) never advances the schedule. A missed quiz item gets exactly one extra try at session end.
5. Skill unlocks: recognition first; recall/listening/reading at recognition box >=2; spelling at recall box >=2.
   Kana first: vocabulary is locked until every hiragana (104) is at recognition box >=1, unless the person ticks "I already read hiragana" (`kanaSkip`).
   Questions use only words/kana already met when enough exist. Kanji show their kana until the word's reading skill is box >=2; katakana shows romaji until katakana is learned.
   Kana progress uses normal skill states and attempts with ids `kana:<h|k>:<char>`; vocabulary planners, limits and stats must ignore them (`isKanaId`).
   Kana lessons are one chart row (≤5 kana, 11 steps, ~2 min, with a visible "step N of M"): learn card → check, per kana, then a matching game (not recorded). Listening starts in the next day's review. Learn cards are saved at once (`repo.introduce`), so leaving keeps progress and the lesson resumes at the next unseen kana. The daily goal (kanaLimit/5 lessons) is a recommendation, never a lock.
6. Photo import never saves anything unconfirmed. Statuses: confirmed, needs-check, duplicate, removed. Editing never auto-confirms. Duplicates are re-checked at save. The original photo is kept. Drafts survive reloads.
7. Recognition is behind the `Recogniser` interface (`src/recognise/provider.ts`). Today it is a clearly labelled placeholder. No real provider yet: costs money and needs a secret key.
8. No secrets in the repo or the frontend, ever. A real provider key lives only in a Supabase Edge Function.
9. Storage is per profile and per base path (`jb:<BASE_URL>:<profileId>`; the first profile is `local`, so pre-profile data carries over). Never read or clear another app's data on the same origin (the old app uses cache `jpbook-v5`, a localStorage prefix and an IndexedDB named `japanese-book`). The service worker only deletes caches with its own prefix.
10. Pronunciation: the app's own recordings first (`public/audio`, `src/data/audio.json`, `docs/AUDIO.md`; Kokoro for words, Open JTalk Mei for single kana, every word take Whisper-checked; Settings "Natural voice", the default). Reason: iOS gives web apps only Kyoko and the robotic Eloquence voices, never Enhanced/Premium ones (verified on Venko's iPhone, O-ren Enhanced downloaded but not offered). The phone voice is the fallback for words without a recording: Eloquence voices rank last, the choice is saved by id and name, the list is polled for 10 s. Every built-in kana and word must have a recording (`tests/audio.test.ts`).
11. Never ask Venko to run terminal commands. Never push to `main` directly, always branch + PR.

12. Writing help: every single kana has animated stroke order (`src/data/strokes.json`, generated by `scripts/make-strokes.py` from KanjiVG, CC BY-SA 3.0, credited in Settings) and every basic hiragana has an origin explanation (`src/domain/kanaOrigins.ts`). Shown on the kana learn card and in the chart's kana sheet. Katakana origins are not written yet. "Try writing it" (`src/ui/TraceKana.tsx`, rules in `src/domain/trace.ts`) lets the learner trace each stroke with a finger: each stroke is judged on start, direction and rough path only, with gentle hints, and nothing is saved or graded (it is not handwriting recognition). Notebook rows and the word sheet show romaji (`romajiOf(reading)`).

## Layout
`src/domain/` rules (pure, heavily tested) · `src/data/` db, repo, library · `src/import/review.ts` import rules · `src/recognise/` provider interface · `src/app/` state, profiles, settings, exercise builder, speech (recordings first, phone voice fallback), image · `scripts/make-audio.py` makes the recordings · `src/domain/kanaCourse.ts` + `kanaPlan.ts` kana course · `src/domain/levels.ts` levels and milestones · `src/ui/` screens · `src/styles.css` the whole design system · `vite.config.ts` (also generates `sw.js` at build time) · `tests/` unit tests · `e2e/` browser tests · `docs/` architecture, recognition, testing, publishing.

## Design direction
Warm, illustrated, matches the app icon (sakura, red sun, Mount Fuji, indigo). Mobile-first for iPhone 12 Pro. Light and dark themes. Practice: flashcards for new words, quizzes for reviews, rewarding, gentle on wrong answers.

## Publishing
See `docs/PUBLISHING.md`. A push to `main` runs tests and deploys to GitHub Pages through `.github/workflows/deploy.yml`. Pull requests run `ci.yml`.

## Where we are (v0.10.0) and what is next
Done: backup and restore (Settings > Backup: one JSON file with words, answers, skills, sessions, kept photos and settings; restore only merges, never deletes; built-in words are matched by library id so a new phone gets no duplicates; `src/data/backup.ts`, `Repo.snapshot/mergeSnapshot`), finger-tracing practice, stroke order + origin for every kana, romaji in the Notebook, the app's own natural voice (recordings) with a reliable phone-voice fallback, bite-sized resumable kana lessons with a lesson path, profiles ("Who's studying?"), kana course (hiragana then katakana, chart, lessons), teach-first new words, reading help, voice picker, redesigned Progress (level, milestones, streak calendar), Today/Notebook/Practice/Progress, topic selection, strict answer checking, scheduler, photo-import workflow, offline PWA with update prompt, warm redesign.
Not yet tested on a real iPhone: camera/picker, touch-drag cropping, keyboard, safe areas, audio, animations.
Next: (1) verify the Pages deploy works, (2) Stage 3 (Supabase accounts and sync) is DROPPED: Venko decided on 2026-11-16 that the per-phone profiles are enough and chose a backup file instead. The outbox is still written but nothing reads it. Do not propose accounts again unless he does. (3) Handwriting recognition: Venko said skip for now; needs a server-side key if ever done, (4) Progress/word-detail polish, (5) cutover of the live app (only with explicit approval). Explain the cost of any paid service before using it. Free tier first.
