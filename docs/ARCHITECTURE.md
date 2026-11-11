# Architecture

## Skills (tracked separately per word)
- recognition: see the Japanese, choose the meaning
- recall: see the meaning, choose the Japanese
- reading: see the kanji, give the kana reading (only for words containing kanji)
- listening: hear it, choose the meaning
- spelling: produce the correct Japanese spelling by typing (romaji is never accepted)

Recognition comes first. The other skills unlock when recognition reaches box 2. Spelling unlocks after recall reaches box 2.

## Scheduling
Boxes 0 to 6 with intervals 0, 1, 2, 4, 8, 16, 32 days. A wrong answer returns the skill to box 0. A right answer moves it up one box.
Only first-try right answers count as "correct". Each plan item carries a plain-language reason.
Daily plan: due and overdue reviews first (most overdue first), then new words up to the daily limit (default 10).

## Attempts
Every answer is saved as an append-only attempt: word, skill, exercise, what was shown, expected and submitted answers,
correct, first try, box before, response time, mistake details (per character), device and app version.
Attempts are never edited or deleted. Statistics are computed from them.

## Local storage and accounts
One IndexedDB database per base path and per account (`jb:<base>:<user>`). Every write also queues an outbox entry for sync.
Signing out wipes that account's local data. Two accounts never share a local database.

## Planned for later stages
Interface and design system (Stage 2), Supabase accounts, Row Level Security and sync (Stage 3),
photo import through a secure server-side function (Stage 4), progress screens (Stage 5).

## Added in Stage 2A
- Beginner romaji mode (Settings, Reading practice): reading questions accept romaji, converted to kana and compared as kana.
  Spelling practice never accepts romaji. In romaji mode, kana-only words also get a reading skill.
- Extra practice by skill records every answer but does not move a word forward on the schedule unless it was due. A wrong answer still counts.
- A typed answer is only diagnosed character by character when it is a near miss, so wild guesses never feed the confusion statistics.
- The offline worker (`sw.js`) is generated at build time and precaches every built file. Updates show a Reload prompt.
