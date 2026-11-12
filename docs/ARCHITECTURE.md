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

## Added in v0.5
- Profiles: a "Who's studying?" picker. Each person has their own database (`jb:<base>:<profileId>`) and settings key. The first person gets the id `local`, so data from before profiles is kept. One person on a device opens straight in; two or more see the picker on start.
- Kana course (`src/domain/kanaCourse.ts`, `kanaPlan.ts`): hiragana then katakana, each 46 basic + 25 voiced + 33 combinations, taught in whole rows (default 15 kana a day). A lesson shows learn cards, then checks each kana by sight (pick the sound) and by sound (pick the kana); a miss gets one extra try at the end. No new rows while 5 or more kana are back at box 0.
- Vocabulary waits until all hiragana is at recognition box 1 or higher, unless the person ticks "I already read hiragana".
- Teach first: a new word is shown on a lesson card with reading, romaji, meaning and audio. `repo.introduce` starts it at box 0, due tomorrow. No attempt is written, because a lesson is not an answer.
- Questions draw wrong options from words already met when at least three exist. Kanji show their kana until the reading is known (reading box 2+); katakana shows romaji until katakana is learned.
- Voice picker: Japanese voices ranked Premium > Enhanced > default, with a remembered choice and a fallback when the voice disappears.
- Progress: level (everything learned), words ring (learned = recognition box 1+, mastered = known), kana bars, streak with best ever and a 4-week calendar, milestones. Lesson days count for the streak.

## Added in v0.6: bite-sized kana lessons
- A lesson is one row of the chart (at most 5 kana, about 3 minutes): learn card then an immediate check for each kana, a listening round, and a matching game at the end (the game is not recorded).
- Learn cards are saved as they happen (`repo.introduce`). Leaving halfway keeps everything; the lesson continues at the next kana not yet answered and retries the ones missed before leaving.
- Kana only seen on a card are never reviews and never count as struggling. A wrong first answer right after a card is not a lapse.
- The Kana tab shows the course as a path (done with 1-3 blossoms of strength, current, locked), with the chart one tap away. Finished lessons can be practised; practice only moves the schedule for kana that are due.
- The daily goal is kanaLimit / 5 lessons. It is shown as blossoms and never locks the next lesson. Reviews run 10 at a time.

## Planned for later stages
Interface and design system (Stage 2), Supabase accounts, Row Level Security and sync (Stage 3),
photo import through a secure server-side function (Stage 4), progress screens (Stage 5).

## Added in Stage 2A
- Beginner romaji mode (Settings, Reading practice): reading questions accept romaji, converted to kana and compared as kana.
  Spelling practice never accepts romaji. In romaji mode, kana-only words also get a reading skill.
- Extra practice by skill records every answer but does not move a word forward on the schedule unless it was due. A wrong answer still counts.
- A typed answer is only diagnosed character by character when it is a near miss, so wild guesses never feed the confusion statistics.
- The offline worker (`sw.js`) is generated at build time and precaches every built file. Updates show a Reload prompt.
