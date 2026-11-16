"""Builds src/data/strokes.json (stroke order for every kana in the course) from the KanjiVG project.
KanjiVG is (c) Ulrich Apel, licensed CC BY-SA 3.0, http://kanjivg.tagaini.net. The credit is shown in Settings.
Run from the repository root (needs network):  python3 scripts/make-strokes.py
Output: { "あ": { "p": ["M31.01,33c...", ...], "n": [[22.5,35], ...] }, ... }  p = stroke paths in order, n = where each stroke number sits."""
import json, re, sys, urllib.request
sys.path.insert(0, '.')
CHARS = []
for lo, hi in ((0x3041, 0x3096), (0x30A1, 0x30F6)):
    CHARS += [chr(c) for c in range(lo, hi + 1)]
out = {}
for ch in CHARS:
    code = '%05x' % ord(ch)
    svg = urllib.request.urlopen(f'https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/{code}.svg', timeout=30).read().decode()
    paths = re.findall(r'<path id="kvg:%s-s\d+"[^>]* d="([^"]+)"' % code, svg)
    nums = [[float(m.group(1)), float(m.group(2))] for m in re.finditer(r'<text transform="matrix\(1 0 0 1 ([\d.]+) ([\d.]+)\)">', svg)]
    assert paths and len(paths) == len(nums), (ch, len(paths), len(nums))
    out[ch] = {'p': paths, 'n': nums}
json.dump(out, open('src/data/strokes.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(len(out), 'characters')
