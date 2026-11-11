import { toKatakana } from './kana';

/**
 * The kana course: hiragana first, then katakana. Each script has three stages
 * (basic 46, voiced 25, combinations 33), taught one row at a time in the usual あいうえお order.
 * Kana progress uses the normal skill states and attempts, with ids that start with "kana:".
 */
export type Script = 'hiragana' | 'katakana';
export type KanaStage = 'basic' | 'voiced' | 'combo';
export interface KanaChar { id: string; char: string; romaji: string; script: Script; stage: KanaStage; row: string; hint: string }
export interface KanaRow { id: string; script: Script; stage: KanaStage; label: string; chars: KanaChar[] }

export const KANA_PREFIX = 'kana:';
export const isKanaId = (id: string) => id.startsWith(KANA_PREFIX);

// [row id, characters, romaji] in course order. Blank cells in the chart are not listed.
const BASIC: [string, string, string][] = [
  ['a', 'あいうえお', 'a i u e o'], ['k', 'かきくけこ', 'ka ki ku ke ko'], ['s', 'さしすせそ', 'sa shi su se so'],
  ['t', 'たちつてと', 'ta chi tsu te to'], ['n', 'なにぬねの', 'na ni nu ne no'], ['h', 'はひふへほ', 'ha hi fu he ho'],
  ['m', 'まみむめも', 'ma mi mu me mo'], ['y', 'やゆよ', 'ya yu yo'], ['r', 'らりるれろ', 'ra ri ru re ro'],
  ['w', 'わをん', 'wa wo n'],
];
const VOICED: [string, string, string][] = [
  ['g', 'がぎぐげご', 'ga gi gu ge go'], ['z', 'ざじずぜぞ', 'za ji zu ze zo'], ['d', 'だぢづでど', 'da ji zu de do'],
  ['b', 'ばびぶべぼ', 'ba bi bu be bo'], ['p', 'ぱぴぷぺぽ', 'pa pi pu pe po'],
];
const COMBO: [string, string, string][] = [
  ['ky', 'きゃ きゅ きょ', 'kya kyu kyo'], ['sh', 'しゃ しゅ しょ', 'sha shu sho'], ['ch', 'ちゃ ちゅ ちょ', 'cha chu cho'],
  ['ny', 'にゃ にゅ にょ', 'nya nyu nyo'], ['hy', 'ひゃ ひゅ ひょ', 'hya hyu hyo'], ['my', 'みゃ みゅ みょ', 'mya myu myo'],
  ['ry', 'りゃ りゅ りょ', 'rya ryu ryo'], ['gy', 'ぎゃ ぎゅ ぎょ', 'gya gyu gyo'], ['j', 'じゃ じゅ じょ', 'ja ju jo'],
  ['by', 'びゃ びゅ びょ', 'bya byu byo'], ['py', 'ぴゃ ぴゅ ぴょ', 'pya pyu pyo'],
];

/** Memory hints for the basic characters. Voiced and combined characters get a rule instead. */
const HINTS: Record<string, string> = {
  あ: 'A cross with a big loop, like an apple hanging from a branch. "a"', い: 'Two eels swimming side by side. "i"',
  う: 'Someone bent over with a sore stomach: "oo". "u"', え: 'A bird with a feather on its head, saying "eh". "e"',
  お: 'Like あ with an extra flick: "oh!" "o"', か: 'A karate kick with a shout mark beside it: "ka!"',
  き: 'Looks like an old key. "ki"', く: 'A cuckoo\'s open beak. "ku"', け: 'A keg standing next to a post. "ke"',
  こ: 'Two coins lying flat. "ko"', さ: 'A sail on a little boat. "sa"', し: 'A fishing hook: she fishes. "shi"',
  す: 'A swing with a loop in its rope. "su"', せ: 'A mouth with one tooth sticking out, saying "say". "se"',
  そ: 'A zig-zag thread from sewing. "so"', た: 'Looks like the letters t and a side by side. "ta"',
  ち: 'A backwards 5 with a curl, like a cheerleader. "chi"', つ: 'A single tsunami wave. "tsu"',
  て: 'An arm reaching out its hand (te). "te"', と: 'A toe with a thorn stuck in it. "to"',
  な: 'A nun kneeling by a cross. "na"', に: 'A knee next to a stick. "ni"', ぬ: 'Noodles twisted on chopsticks. "nu"',
  ね: 'A cat (neko) with a curled tail. "ne"', の: 'A "no entry" sign: one swirl. "no"',
  は: 'A post and a laughing squiggle: "ha!" "ha"', ひ: 'A big grin: "hee hee". "hi"',
  ふ: 'Mount Fuji with puffs of cloud around it. "fu"', へ: 'A small hill to head over. "he"',
  ほ: 'Like は with an extra bar on top, a hose wound on a post. "ho"', ま: 'A mama with a long ponytail loop. "ma"',
  み: 'Looks like the number 21: me at 21. "mi"', む: 'A cow with a horn and a tail: "moo". "mu"',
  め: 'An eye with a loop (目 me means eye). "me"', も: 'A fish hook with more bait on it. "mo"',
  や: 'A yak with its horns up. "ya"', ゆ: 'A U-turn with a line through it. "yu"', よ: 'A yo-yo hanging on its string. "yo"',
  ら: 'A rabbit sitting with one ear up. "ra"', り: 'Two reeds by a river. "ri"',
  る: 'A road with a roundabout loop at the end. "ru"', れ: 'Someone on one knee, ready to race. "re"',
  ろ: 'Like る but no loop: an open road. "ro"', わ: 'Like れ, but the tail swings round like a wave. "wa"',
  を: 'Someone tripping over: "whoa!" Said like "o". "wo"', ん: 'A lower-case n with a tail. "n"',
  ア: 'An axe. "a"', イ: 'An easel leaning on a post. "i"', ウ: 'Like う with a lid on top. "u"', エ: 'An elevator: up and down. "e"',
  オ: 'An opera singer with arms spread. "o"', カ: 'Like か without its shout mark. "ka"', キ: 'A key with two teeth. "ki"',
  ク: 'A cook\'s hat bent over. "ku"', ケ: 'A K that is leaning over. "ke"', コ: 'A corner of a room. "ko"',
  サ: 'A saddle on two posts. "sa"', シ: 'Two eyes on the left, the smile rises up from the bottom. "shi"',
  ス: 'A runner leaning forward: super fast. "su"', セ: 'Like せ, written with straight lines. "se"',
  ソ: 'A needle sewing downwards from the top. "so"', タ: 'Like ク with an extra line: a price tag. "ta"',
  チ: 'Like the letter T with a hat: "chi". "chi"', ツ: 'Two eyes along the top looking down at a wave. "tsu"',
  テ: 'A telephone pole. "te"', ト: 'A totem pole with one branch. "to"', ナ: 'A cross like a knife. "na"',
  ニ: 'Two lines: ni means two (二). "ni"', ヌ: 'Chopsticks catching a noodle. "nu"', ネ: 'A necklace on a stand. "ne"',
  ノ: 'One slash: no. "no"', ハ: 'Two lines bursting out laughing: "ha". "ha"', ヒ: 'A heel. "hi"',
  フ: 'The top part of ふ, a hook. "fu"', ヘ: 'The same hill as へ. "he"', ホ: 'A holy cross with little arms. "ho"',
  マ: 'Mama\'s head with a ponytail. "ma"', ミ: 'Three lines: mi as in mittsu, three. "mi"', ム: 'A cow\'s nose: "moo". "mu"',
  メ: 'An X mark: "meh". "me"', モ: 'Like も, written with straight lines. "mo"', ヤ: 'Like や: a yak horn. "ya"',
  ユ: 'A U-shaped tube on its side. "yu"', ヨ: 'A yo-yo wound up in a box. "yo"', ラ: 'Like ら without its loop. "ra"',
  リ: 'Like り: two reeds. "ri"', ル: 'Two legs running. "ru"', レ: 'A leg kicking forward. "re"',
  ロ: 'A box, like the kanji 口. "ro"', ワ: 'A wine glass. "wa"', ヲ: 'Like ワ with an extra line. Said like "o". "wo"',
  ン: 'Like ソ, but the line rises up from the bottom. "n"',
};
const VOICED_HINT: Record<string, string> = {
  g: 'The two little marks (゛) turn k into g.', z: 'The two little marks (゛) turn s into z. じ is "ji".',
  d: 'The two little marks (゛) turn t into d. ぢ and づ sound like じ and ず and are rare.', b: 'The two little marks (゛) turn h into b.',
  p: 'The little circle (゜) turns h into p.',
};

function build(script: Script): KanaRow[] {
  const conv = (s: string) => (script === 'katakana' ? toKatakana(s) : s);
  const rows: KanaRow[] = [];
  const add = (stage: KanaStage, list: [string, string, string][]) => {
    for (const [row, chars, roma] of list) {
      const cs = stage === 'combo' ? chars.split(' ') : Array.from(chars);
      const rs = roma.split(' ');
      const id = `${script[0]}-${stage}-${row}`;
      const items = cs.map((c, i): KanaChar => {
        const char = conv(c);
        const hint = stage === 'basic' ? HINTS[char] ?? '' : stage === 'voiced' ? VOICED_HINT[row]! : `${conv(c[0]!)} + small ${conv(c[1]!)} blend into one sound: ${rs[i]}.`;
        return { id: `${KANA_PREFIX}${script[0]}:${char}`, char, romaji: rs[i]!, script, stage, row: id, hint };
      });
      rows.push({ id, script, stage, label: items.map((c) => c.char).join(' '), chars: items });
    }
  };
  add('basic', BASIC); add('voiced', VOICED); add('combo', COMBO);
  return rows;
}

export const KANA_ROWS: KanaRow[] = [...build('hiragana'), ...build('katakana')];
export const KANA: KanaChar[] = KANA_ROWS.flatMap((r) => r.chars);
export const KANA_BY_ID = new Map(KANA.map((k) => [k.id, k]));
export const kanaOf = (script: Script) => KANA.filter((k) => k.script === script);
export const STAGE_NAMES: Record<KanaStage, string> = { basic: 'Basic', voiced: 'With ゛ and ゜', combo: 'Combinations' };
