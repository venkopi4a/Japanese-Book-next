import { describe, expect, it } from 'vitest';
import dict from '../src/data/dictionary.json';
import { romajiOf } from '../src/app/exercise';
import { buildIndex, kindOf, loose, lookup, meaningOf, norm, strictRomaji, type DictEntry } from '../src/domain/lookup';

const real = buildIndex(dict as DictEntry[]);
const top = (q: string, n = 3) => lookup(real, q, n).map((m) => m.text);

describe('norm', () => {
  it('lines up to-verbs, articles and notes', () => {
    expect(norm('to eat')).toBe('eat');
    expect(norm('a cat')).toBe('cat');
    expect(norm('Cat (esp. the domestic cat)')).toBe('cat');
    expect(norm('dog (Canis (lupus) familiaris)')).toBe('dog'); // nested notes
    expect(norm('dogū')).toBe('dogu'); // not "dog"
    expect(norm('  Thank   YOU ')).toBe('thank you');
  });
});

describe('lookup on the real dictionary', () => {
  const EXPECT: [string, string[]][] = [
    ['cat', ['猫']], ['dog', ['犬']], ['water', ['水']], ['station', ['駅']], ['train', ['電車']], ['eat', ['食べる']], ['to drink', ['飲む']],
    ['big', ['大きい']], ['hello', ['こんにちは']], ['thank you', ['ありがとう']], ['house', ['家']], ['school', ['学校']], ['book', ['本']],
    ['beautiful', ['美しい', '綺麗']], ['friend', ['友達']], ['mosquito', ['蚊']], ['umbrella', ['傘']], ['bicycle', ['自転車']], ['morning', ['朝']],
    ['sorry', ['ごめんなさい', 'ごめん', 'すみません']], ['red', ['赤', '赤い']], ['tomorrow', ['明日']], ['cheap', ['安い']], ['how much', ['いくら']],
    ['car', ['車']], ['rain', ['雨']], ['mountain', ['山']], ['fish', ['魚']], ['to read', ['読む']], ['small', ['小さい']], ['delicious', ['おいしい', '美味しい', '旨い']],
    ['yesterday', ['昨日']], ['teacher', ['先生']], ['flower', ['花']], ['sea', ['海']], ['name', ['名前']], ['phone', ['電話']], ['work', ['仕事', '働く']], ['today', ['今日']],
  ];
  it.each(EXPECT)('"%s" finds one of %j in the top 3', (q, want) => {
    expect(top(q).some((t) => want.includes(t)), `${q} -> ${top(q, 5).join(' ')}`).toBe(true);
  });
  it('puts the common word first for the clearest everyday words', () => {
    for (const [q, w] of [['cat', '猫'], ['dog', '犬'], ['water', '水'], ['station', '駅'], ['eat', '食べる'], ['to drink', '飲む'], ['school', '学校'], ['book', '本']] as const) expect(top(q, 1)[0], q).toBe(w);
  });
  it('"to eat" prefers verbs; plain "drink" also finds the verb', () => {
    expect(lookup(real, 'to eat', 3)[0]!.kind).toBe('verb');
    expect(top('drink', 4)).toContain('飲む');
  });
  it('returns the reading, a short meaning that starts with the matched sense, and the part of speech', () => {
    const m = lookup(real, 'cat', 1)[0]!;
    expect(m.reading).toBe('ねこ');
    expect(m.meaning).toBe('cat');
    expect(m.kind).toBe('noun');
    expect(lookup(real, 'to eat', 1)[0]!.reading).toBe('たべる');
  });
  it('no matches, too-short and empty queries are safe', () => {
    expect(lookup(real, '')).toEqual([]);
    expect(lookup(real, 'a')).toEqual([]);
    expect(lookup(real, 'qzxqzxqzx')).toEqual([]);
    expect(lookup(real, '   ')).toEqual([]);
  });
  it('a Japanese query also works', () => {
    expect(top('猫', 1)).toEqual(['猫']);
    expect(top('たべる', 1)).toEqual(['食べる']);
  });
  it('limits results and never repeats an entry', () => {
    const r = lookup(real, 'house', 8);
    expect(r.length).toBeLessThanOrEqual(8);
    expect(new Set(r.map((m) => m.text + m.reading)).size).toBe(r.length);
  });
  it('is fast', () => {
    const t = performance.now();
    for (const q of ['cat', 'to eat', 'thank you', 'how much']) lookup(real, q);
    expect(performance.now() - t).toBeLessThan(200);
  });
});

describe('romaji: Japanese typed in English letters', () => {
  const ROMAJI: [string, string[]][] = [
    ['neko', ['猫']], ['inu', ['犬']], ['mizu', ['水']], ['eki', ['駅']], ['kuruma', ['車']], ['tsukue', ['机']], ['tukue', ['机']],
    ['taberu', ['食べる']], ['nomu', ['飲む']], ['gakkou', ['学校']], ['gakkō', ['学校']], ['sensei', ['先生']], ['denwa', ['電話']], ['shinbun', ['新聞']],
    ['arigatou', ['ありがとう']], ['arigatō', ['ありがとう']], ['konnichiwa', ['こんにちは']], ['konnichiha', ['こんにちは']], ['ohayou', ['おはよう']],
    ['sayonara', ['さよなら']], ['ookii', ['大きい']], ['ōkii', ['大きい']], ['benkyou', ['勉強']], ['sushi', ['寿司', '鮨']], ['ramen', ['ラーメン']],
    ['kyou', ['今日']], ['ashita', ['明日']], ['tomodachi', ['友達']], ['sumimasen', ['すみません']], ['onegai', ['お願い']],
  ];
  it.each(ROMAJI)('"%s" finds one of %j in the top 3', (q, want) => {
    expect(top(q).some((t) => want.includes(t)), `${q} -> ${top(q, 5).join(' ')}`).toBe(true);
  });
  it('the exact spelling comes first for clear words', () => {
    for (const [q, w] of [['neko', '猫'], ['inu', '犬'], ['taberu', '食べる'], ['arigatou', 'ありがとう'], ['gakkou', '学校']] as const) expect(top(q, 1)[0], q).toBe(w);
  });
  it('a partial word still finds it (nek -> neko)', () => {
    expect(top('neko', 1)).toEqual(['猫']);
    expect(lookup(real, 'nek', 8).map((m) => m.text)).toContain('猫');
  });
  it('English still wins when the letters are an English word', () => {
    expect(top('cat', 1)[0]).toBe('猫');
    expect(top('dog', 1)[0]).toBe('犬');
    expect(top('water', 1)[0]).toBe('水');
  });
  it('shows the reading so you can see what matched', () => {
    expect(lookup(real, 'neko', 1)[0]).toMatchObject({ text: '猫', reading: 'ねこ' });
  });
  it('spelling variants fold together', () => {
    expect(loose('ookii')).toBe(loose('ōkii'));
    expect(loose('shi')).toBe(loose('si'));
    expect(loose('tsu')).toBe(loose('tu'));
    expect(strictRomaji("Kin'en ")).toBe('kinen');
  });
  it('the greetings ending in the particle は are shown as "wa"', () => {
    expect(romajiOf('こんにちは')).toBe('konnichiwa');
    expect(romajiOf('こんばんは')).toBe('konbanwa');
    expect(romajiOf('はし')).toBe('hashi');
  });
  it('symbols do nothing and digits do not crash', () => {
    expect(lookup(real, '??')).toEqual([]);
    expect(() => lookup(real, '12')).not.toThrow();
  });
});

describe('small helpers', () => {
  it('meaningOf keeps the matched sense, drops notes, and stays short', () => {
    expect(meaningOf([['a', 'b', 'c', 'd'], ['x', 'y']], 1)).toBe('x, y');
    expect(meaningOf([['a', 'b', 'c', 'd']])).toBe('a, b, c');
    expect(meaningOf([['cat (esp. the domestic cat, Felis catus)'], ['shamisen']])).toBe('cat');
    expect(meaningOf([['dog (Canis (lupus) familiaris)', 'Dog']])).toBe('dog');
    expect(meaningOf([['(only a note)']])).toBe('(only a note)');
  });
  it('maps parts of speech to word kinds', () => {
    expect([kindOf('verb'), kindOf('i-adjective'), kindOf('na-adjective'), kindOf('noun'), kindOf('particle'), kindOf('expression'), kindOf('adverb')]).toEqual(['verb', 'adjective', 'adjective', 'noun', 'particle', 'expression', 'word']);
  });
});
