#!/usr/bin/env python3
"""Builds src/data/dictionary.json, the offline English -> Japanese lookup used by "Add a word".

Sources (both free, both CC BY-SA 4.0, credited in Settings):
  - JMdict (EDRDG, with its own 'common word' marks), via the `jamdict-data` package on PyPI (a 2021 snapshot, plenty for everyday words)
  - wordfreq (Robyn Speer et al.): how common each Japanese word is, used only to rank results

Usage (nothing to install except wordfreq):
  pip download jamdict-data --no-deps -d /tmp/jd && tar -xzf /tmp/jd/jamdict_data-*.tar.gz -C /tmp/jd
  xz -dk -c /tmp/jd/jamdict_data-*/jamdict_data/jamdict.db.xz > /tmp/jamdict.db
  pip install wordfreq && python3 scripts/make-dictionary.py /tmp/jamdict.db

Output: a JSON array of [word, reading, pos, rank, senses] where senses is a list of lists of English glosses.
An entry is kept only if one of its written forms is among the top MAX_RANK words of everyday Japanese.
"""
import json, re, sqlite3, sys
from wordfreq import top_n_list

MAX_RANK = 40000
db = sqlite3.connect(sys.argv[1] if len(sys.argv) > 1 else '/tmp/jamdict.db')
rank = {}
for i, w in enumerate(top_n_list('ja', 60000)):
    rank.setdefault(w, i)

def group(sql):
    out = {}
    for k, v in db.execute(sql): out.setdefault(k, []).append(v)
    return out

kanji_rows = list(db.execute('select idseq, ID, text from Kanji order by ID'))
kana_rows = list(db.execute('select idseq, ID, text from Kana order by ID'))
kanji = {}
for i, _, t in kanji_rows: kanji.setdefault(i, []).append(t)
kana = {}
for i, _, t in kana_rows: kana.setdefault(i, []).append(t)
kj_info = group('select kid, text from KJI')     # per written form: 'out-dated kanji', 'rarely used', 'irregular'...
kj_pri = group('select kid, text from KJP')      # JMdict priority marks (ichi1, news1, spec1, gai1, nf01...)
kn_pri = group('select kid, text from KNP')
BAD_FORM = re.compile(r'out-dated|rarely used|irregular|search-only|outdated|ateji')
STRONG = {'ichi1', 'news1', 'spec1', 'gai1'}
bad_form, pri_form, strong_entry = set(), set(), set()
for i, kid, t in kanji_rows:
    if any(BAD_FORM.search(x) for x in kj_info.get(kid, [])): bad_form.add((i, t))
    if kj_pri.get(kid): pri_form.add((i, t))
    if STRONG & set(kj_pri.get(kid, [])): strong_entry.add(i)
for i, kid, t in kana_rows:
    if kn_pri.get(kid): pri_form.add((i, t))
    if STRONG & set(kn_pri.get(kid, [])): strong_entry.add(i)
senses = group('select idseq, ID from Sense order by ID')
glosses = group("select sid, text from SenseGloss where lang='eng' order by rowid")
pos = group('select sid, text from pos')
misc = group('select sid, text from misc')
stagk = group('select sid, text from stagk')
stagr = group('select sid, text from stagr')
field = group('select sid, text from field')

POS = [
    ('Godan verb', 'verb'), ('Ichidan verb', 'verb'), ('transitive verb', 'verb'), ('intransitive verb', 'verb'), ('suru verb', 'verb'),
    ('adjectival nouns', 'na-adjective'), ('adjective (keiyoushi)', 'i-adjective'), ('adverb', 'adverb'),
    ('expressions', 'expression'), ('interjection', 'interjection'), ('particle', 'particle'), ('conjunction', 'conjunction'),
    ('pronoun', 'pronoun'), ('counter', 'counter'), ('suffix', 'suffix'), ('prefix', 'prefix'), ('noun', 'noun'),
]
def short_pos(tags):
    for t in tags:
        for needle, label in POS:
            if needle in t: return label
    return ''

SKIP_MISC = {'obscure term', 'archaism', 'obsolete term', 'rare', 'vulgar', 'derogatory', 'sensitive'}
out = []
for idseq, sids in senses.items():
    kj, kn = kanji.get(idseq, []), kana.get(idseq, [])
    if not kn: continue
    uk = any('usually written using kana alone' in m for sid in sids for m in misc.get(sid, []))
    if any(m in SKIP_MISC for sid in sids[:1] for m in misc.get(sid, [])): continue
    # written forms that count for ranking: kanji forms, plus kana forms only when the word is normally written in kana
    forms = [f for f in kj if (idseq, f) not in bad_form] + (list(kn) if (uk or not kj) else [])
    if not forms: continue
    ranks = [(rank[f], f) for f in forms if f in rank and rank[f] < MAX_RANK]
    if not ranks and idseq not in strong_entry: continue   # not in everyday Japanese and not marked common by JMdict
    # JMdict lists the main written form first; an alternative form can borrow a higher rank from a different word
    # (机 'desk' also writes 案, which is the common word 'plan'), so take the first form that is a known word
    ok = {f: r for r, f in ranks}
    form = next((f for f in forms if (idseq, f) in pri_form), None) or next((f for f in forms if f in ok), forms[0])
    best_rank = ok.get(form, MAX_RANK)   # common by JMdict's marks but rare in the frequency list: ranks after the frequent words
    # a word whose main sense is "usually written in kana" (ありがとう, こんにちは, いくら) is shown in kana, keeping the best rank of its forms
    if any('usually written using kana alone' in m for m in misc.get(sids[0], [])):
        form = kn[0]
        best_rank = min(ok.values()) if ok else MAX_RANK
    # reading
    reading = form if form in kn else kn[0]   # JMdict lists the main reading first
    # sink technical terms (mahjong, law...)
    if any(field.get(sid) for sid in sids[:1]): best_rank += 6000
    # one- and two-letter kana words (particles, endings) take their rank from every sentence they appear in
    if len(form) == 1 and ('\u3040' <= form <= '\u30ff'): best_rank = (best_rank + 50) * 8 - 50
    best_rank = min(best_rank, 59999)
    result, tags = [], []
    for sid in sids:
        if sid in stagk and form not in stagk[sid]: continue          # this sense belongs to another kanji form
        gl = [g for g in glosses.get(sid, []) if g]
        if not gl: continue
        if sid in stagr and reading not in stagr[sid]: continue
        result.append(gl[:6]); tags += pos.get(sid, [])
        if len(result) == 5: break
    if not result: continue
    out.append([form, reading, short_pos(tags[:3]), best_rank, result])
out.sort(key=lambda e: e[3])
json.dump(out, open('src/data/dictionary.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print(len(out), 'entries')
