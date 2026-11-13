"""
Makes the app's recorded voice: one natural-sounding clip per kana sound and per built-in word.
Run by Claude, never by the app. Nothing here ships except the finished clips and src/data/audio.json.

Voice: Kokoro-82M (Apache-2.0), Japanese voices, via kokoro-onnx + misaki[ja].
Words: Kokoro, and every take is checked by Whisper (faster-whisper): the word must be heard exactly, otherwise it
is redone with another voice (and from the kanji or the kana spelling). Single kana: Open JTalk's Mei voice, because
neural voices add stray sounds to a lone syllable (tested: あ→"wa", か→"ga"), while Open JTalk says the exact sound.

Usage (python 3.12 venv with kokoro-onnx misaki[ja] unidic-lite soundfile faster-whisper pykakasi):
  python scripts/make-audio.py <items.json> <kokoro dir with model.onnx + voices.npz> [--only key1,key2]
items.json comes from scripts/audio-list.ts (bundled with rolldown, run with node).
"""
import hashlib, json, os, re, subprocess, sys, tempfile
import numpy as np, soundfile as sf
import pykakasi, pyopenjtalk
from faster_whisper import WhisperModel
from kokoro_onnx import Kokoro
from misaki import ja

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_BASE = os.environ.get('AUDIO_OUT', ROOT)  # where results go (default: the repo)
OUT_DIR = os.path.join(OUT_BASE, 'public', 'audio')
MANIFEST = os.path.join(OUT_BASE, 'src', 'data', 'audio.json')
REPORT = os.path.join(OUT_BASE, 'scripts', 'audio-report.json')
WORD_VOICES = ['jf_alpha', 'jf_tebukuro', 'jf_nezumi', 'jf_gongitsune']
KANA_TRIES = [(v, suffix, speed) for suffix, speed in [('ː', 0.9), ('', 0.9), ('ː.', 0.85), ('.', 0.85)] for v in ['jf_tebukuro', 'jf_alpha', 'jf_nezumi', 'jf_gongitsune']]

kks = pykakasi.kakasi()

def romaji(text):
    """Comparable romaji: hepburn, no punctuation, long vowels collapsed, を as o."""
    r = ''.join(x['hepburn'] for x in kks.convert(text)).lower()
    r = re.sub(r'[^a-z]', '', r)
    r = r.replace('ou', 'o').replace('wo', 'o')
    return re.sub(r'([aeiou])\1+', r'\1', r)

def load16k(audio, sr):
    with tempfile.NamedTemporaryFile(suffix='.wav') as f:
        sf.write(f.name, audio, sr)
        raw = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', f.name, '-f', 's16le', '-ac', '1', '-ar', '16000', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0

def heard(whisper, audio, sr, times=1):
    a = load16k(audio, sr)
    gap = np.zeros(6400, np.float32)
    parts = [gap]
    for _ in range(times): parts += [a, gap]
    segs, _ = whisper.transcribe(np.concatenate(parts), language='ja', beam_size=5, vad_filter=False,
                                 initial_prompt='ひらがなの発音練習。' if times > 1 else None)
    return ''.join(s.text for s in segs).strip()

def kana_ok(transcript, expected):
    exp = romaji(expected)
    tokens = [romaji(t) for t in re.split(r'[\s、。,.!?！？・…]+', transcript) if romaji(t)]
    joined = romaji(transcript)
    return joined in (exp * 3, exp * 2) or sum(t == exp for t in tokens) >= 2

def word_ok(transcript, reading):
    return romaji(transcript) == romaji(reading)

def trim(audio, sr):
    """Cut leading and trailing silence, keeping a short natural margin."""
    env = np.abs(audio)
    thr = 0.02 * env.max()
    idx = np.where(env > thr)[0]
    if not len(idx): return audio
    s = max(0, idx[0] - int(0.04 * sr)); e = min(len(audio), idx[-1] + int(0.12 * sr))
    return audio[s:e]

def encode(audio, sr, path):
    with tempfile.NamedTemporaryFile(suffix='.wav') as f:
        sf.write(f.name, audio, sr)
        subprocess.run(['ffmpeg', '-v', 'quiet', '-y', '-i', f.name, '-ac', '1', '-ar', '24000', '-c:a', 'aac', '-b:a', '48k', '-movflags', '+faststart', path], check=True)

def main():
    items = json.load(open(sys.argv[1]))
    kdir = sys.argv[2]
    only = set(sys.argv[sys.argv.index('--only') + 1].split(',')) if '--only' in sys.argv else None
    kokoro = Kokoro(os.path.join(kdir, 'model.onnx'), os.path.join(kdir, 'voices.npz'))
    g2p = ja.JAG2P()
    whisper = WhisperModel(os.environ.get('WHISPER', 'medium'), device='cpu', compute_type='int8')
    os.makedirs(OUT_DIR, exist_ok=True)
    manifest = json.load(open(MANIFEST)) if os.path.exists(MANIFEST) else {}
    report = json.load(open(REPORT)) if os.path.exists(REPORT) else {}
    for n, it in enumerate(items):
        key = it['key']
        if only and key not in only: continue
        if not only and key in manifest and os.path.exists(os.path.join(OUT_DIR, manifest[key])): continue
        chosen = None
        if it['kind'] == 'kana':
            # A lone syllable is where neural voices slip (tests: あ came out as "wa", か as "ga", し as "ushi").
            # Open JTalk's Mei voice says the exact sound every time, and keeps every kana in one consistent voice.
            x, sr = pyopenjtalk.tts(it['reading'], speed=0.9)
            audio = trim((x / 32768.0).astype(np.float32), sr)
            chosen = (audio, sr, 'openjtalk mei', heard(whisper, audio, sr, times=3))
        else:
            sources = [it['text'], it['reading']] if it['text'] != it['reading'] else [it['reading']]
            # a full stop gives short words a clean, finished ending (without it: えき was heard as "eki-e")
            for suffix in ['.', '']:
                for voice in WORD_VOICES:
                    for src in sources:
                        ph = g2p(src)[0]
                        audio, sr = kokoro.create(ph + suffix, voice=voice, speed=0.9, lang='ja', is_phonemes=True)
                        audio = trim(audio, sr)
                        t = heard(whisper, audio, sr)
                        if word_ok(t, it['reading']):
                            chosen = (audio, sr, f'kokoro {voice}' + (' from kanji' if src != it['reading'] else ''), t); break
                    if chosen: break
                if chosen: break
            if not chosen:
                # no natural take was heard correctly: Open JTalk Mei always says the exact reading, so nothing wrong ships
                x, sr = pyopenjtalk.tts(it['reading'], speed=0.9)
                audio = trim((x / 32768.0).astype(np.float32), sr)
                chosen = (audio, sr, 'openjtalk mei (fallback)', heard(whisper, audio, sr))
        audio, sr, how, t = chosen
        name = hashlib.sha1(key.encode()).hexdigest()[:10] + '.m4a'
        encode(audio, sr, os.path.join(OUT_DIR, name))
        manifest[key] = name
        report[key] = {'kind': it['kind'], 'reading': it['reading'], 'voice': how, 'whisper_heard': t}
        print(f'[{n + 1}/{len(items)}] {key}: {how} | heard {t}', flush=True)
        if (n + 1) % 10 == 0:
            json.dump(dict(sorted(manifest.items())), open(MANIFEST, 'w'), ensure_ascii=False, indent=0)
            json.dump(report, open(REPORT, 'w'), ensure_ascii=False, indent=1)
    json.dump(dict(sorted(manifest.items())), open(MANIFEST, 'w'), ensure_ascii=False, indent=0)
    json.dump(report, open(REPORT, 'w'), ensure_ascii=False, indent=1)
    print('done', len(manifest))

if __name__ == '__main__':
    main()
