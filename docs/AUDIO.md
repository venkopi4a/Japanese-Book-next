# The app's own voice

iPhones decide which voices a web app may use, and many iOS versions only share the basic, robotic ones.
So the app carries its own recordings: every kana sound, every kana example word and every starter word.
They live in `public/audio/*.m4a` (AAC, mono, about 1.5 MB in total), are listed in `src/data/audio.json`
(key: the spoken text in hiragana, see `src/app/audioKey.ts`) and are precached by the offline worker.

`speak()` (`src/app/speech.ts`) plays the recording when there is one and otherwise uses the phone's voice
(the voice picker in Settings). Settings → Voice: "Natural voice" (default) or "Phone voice".
iPhones only allow sound that starts from a tap, so the first tap anywhere unlocks one shared audio player.

## Voices
- Words: **Kokoro-82M** Japanese voices (Apache-2.0), run with kokoro-onnx and misaki[ja].
- Single kana: **Open JTalk** with the **Mei** voice (`mei_normal.htsvoice`, © Nagoya Institute of Technology, CC BY 3.0).
  Neural voices add stray sounds to a lone syllable (tested: あ came out as "wa", か as "ga", し as "ushi"),
  so single kana use Open JTalk, which always says the exact sound.

## Checked by a listener
Every word take is transcribed by Whisper (faster-whisper, medium) and must be heard as exactly that word;
otherwise it is redone with another Kokoro voice, or from the kanji spelling. The result of every clip is in
`scripts/audio-report.json` (`whisper_heard`). Single kana are calibrated, not judged: Whisper is unreliable on one
syllable even for a perfect clip.

## Adding recordings (Claude, not Venko)
1. `npx rolldown scripts/audio-list.ts --format esm --platform node --file /tmp/audio-list.mjs && node /tmp/audio-list.mjs > items.json`
2. Python 3.12 venv: `pip install kokoro-onnx "misaki[ja]" unidic-lite soundfile faster-whisper pykakasi`
3. Kokoro files from Hugging Face `onnx-community/Kokoro-82M-v1.0-ONNX` (`onnx/model.onnx` and `voices/jf_*.bin`, packed into `voices.npz`).
4. `python scripts/make-audio.py items.json <kokoro dir>`: only missing clips are made; `--only key1,key2` redoes some.
New words added later without a recording simply use the phone voice; `tests/audio.test.ts` fails if a built-in word has no recording.
