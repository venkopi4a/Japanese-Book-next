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
- A lesson is one row of the chart (at most 5 kana, 11 steps, about 2 minutes, with "step N of M" always shown): learn card then an immediate check for each kana, and a matching game at the end (the game is not recorded). A kana's listening skill starts in the next day's review, once its sight question has been answered.
- Learn cards are saved as they happen (`repo.introduce`). Leaving halfway keeps everything; the lesson continues at the next kana not yet answered and retries the ones missed before leaving.
- Kana only seen on a card are never reviews and never count as struggling. A wrong first answer right after a card is not a lapse.
- The Kana tab shows the course as a path (done with 1-3 blossoms of strength, current, locked), with the chart one tap away. Finished lessons can be practised; practice only moves the schedule for kana that are due.
- The daily goal is kanaLimit / 5 lessons. It is shown as blossoms and never locks the next lesson. Reviews run 10 at a time.

## v0.7: voice
The app's own recordings are played first (see `docs/AUDIO.md`). They were removed once and brought back after Venko's iPhone showed that iOS offers web apps only Kyoko and the robotic Eloquence voices, never Enhanced ones. For words without a recording the phone voice is used: the choice is saved by id and name and matched by name after a restart, Eloquence voices (Eddy, Flo, Grandma …) rank last so "Best available" is Kyoko, the voice list is polled for 10 seconds, voices seen once in a visit are remembered, and the first tap unlocks speech on iPhone.

## v0.10: backup
Settings > Backup writes one JSON file (`japanese-book-<name>-<date>.json`): words, skill states, attempts, sessions, kept photos (base64) and settings. It goes to the phone's share sheet (Save to Files, AirDrop, Mail), or downloads. Restore merges into the current person and never deletes: attempts, sessions and photos are added when their id is missing; a word or skill is replaced only by a more recent copy; built-in words are matched by library id (every device seeds its own copies with random ids) and their answers are attached to this device's copy. It is one transaction. Files from a newer app version, or damaged files, are refused before anything is written.
Accounts and sync (Stage 3) were considered and dropped on 2026-11-16: two people, one phone each, nothing to sync.

## v0.11: word lookup
Add > Look up a word searches `src/data/dictionary.json` (31,000 everyday words from JMdict, a 2021 snapshot via the `jamdict-data` PyPI package, ranked by the wordfreq list; regenerate with `scripts/make-dictionary.py`). It is a lazy-loaded chunk (about 1 MB compressed) and is precached for offline use. `src/domain/lookup.ts` builds an index of English glosses and scores matches: log of commonness, plus penalties for partial matches, later glosses and minor senses, suffixes/prefixes/counters, and non-verbs when the query starts with "to". The same letters are also tried as romaji: each entry's reading is turned into Hepburn romaji once (warmed up when the sheet opens, about 150 ms) and compared exactly, then with spelling variants folded (ou/oo/ō, shi/si, tsu/tu, fu/hu, ji/zi...), then as a prefix; a final は/へ also matches "wa"/"e". English matches win ties. JMdict's own priority marks choose the main written form (a rare alternative form can borrow a common word's rank: 机 'desk' also writes 案) and add common words the frequency list misses; words whose main sense is "usually written in kana" are shown in kana. A saved word gets the matched sense's short meaning, its kind from the part of speech, and source `user`.

## Planned for later stages
Interface and design system (Stage 2), Supabase accounts, Row Level Security and sync (Stage 3),
photo import through a secure server-side function (Stage 4), progress screens (Stage 5).

## Added in Stage 2A
- Beginner romaji mode (Settings, Reading practice): reading questions accept romaji, converted to kana and compared as kana.
  Spelling practice never accepts romaji. In romaji mode, kana-only words also get a reading skill.
- Extra practice by skill records every answer but does not move a word forward on the schedule unless it was due. A wrong answer still counts.
- A typed answer is only diagnosed character by character when it is a near miss, so wild guesses never feed the confusion statistics.
- The offline worker (`sw.js`) is generated at build time and precaches every built file. Updates show a Reload prompt.

## v0.13: honest kana counts, nothing locked
- Kana levels are derived from answers (`kanaSummary` in `kanaPlan.ts`): learned = right at least once (a later miss does not undo it; before, one missed review dropped a kana back to "not learned" and re-locked vocabulary, so a finished hiragana course showed 98 of 104); mastered = last 3 first-try answers right on at least 2 days.
- The vocabulary lock and the "I already read hiragana" setting are gone: words and kana are always open.
- Today shows both tracks (kana first until hiragana is learned) and a progress block with learned and mastered per script.

## v0.14: word lessons
- The Words tab (was Practice) has Lessons and Practise. Lessons: units by topic in a beginner order (Greetings, People … Grammar; new topics follow alphabetically), each split evenly into lessons of 3-5 words. A lesson is learn card → quick check per word, then a matching game; it is saved as it goes and resumes without repeating. Nothing is locked; the first unfinished lesson is suggested.
- Word levels use the kana rule (learned: right once; mastered: last 3 first-try answers right on 2+ days) for unit rings, lesson blossoms and counts.
- Today: a Words card with the next lesson and reviews, a Kana card, and a progress block.
- Romaji follows pronunciation (particle は = wa, を = o). The starter word お名前は was misspelled おはまえは; fixed, and repaired on phones where it was never edited.
