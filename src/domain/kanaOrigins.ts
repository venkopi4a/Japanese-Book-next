/**
 * Why each hiragana looks the way it does: every one is a Chinese character (kanji) written fast and smooth.
 * [kanji, meaning, what happened to it]. Katakana come from pieces of kanji instead; their origins are not covered yet.
 */
export const HIRAGANA_INTRO =
  'Hiragana was made about 1,100 years ago by writing Chinese characters quickly with a brush. The strokes melted into soft curves, which is why every hiragana is round and flowing. Knowing the kanji behind a kana gives you a reason to remember its shape.';

export const HIRAGANA_ORIGIN: Record<string, [string, string, string]> = {
  あ: ['安', 'calm', 'The roof on top and the woman below ran together into one looping shape.'],
  い: ['以', 'by means of', 'The left side of the kanji became the first stroke, the right side the second: two parallel strokes.'],
  う: ['宇', 'eaves, universe', 'Only the roof on top of the kanji stayed; the little dot above it is the roof peak.'],
  え: ['衣', 'clothing', 'The top of the kanji and its flowing tail were kept, the rest was dropped.'],
  お: ['於', 'at, in', 'The left part of the kanji became the cross and loop, the right part the dot.'],
  か: ['加', 'add', 'The left side (power) stayed; the box on the right shrank to a single dot.'],
  き: ['幾', 'how many', 'Written fast, the top of the kanji became the two bars and the rest became the hook.'],
  く: ['久', 'long time', 'The whole kanji shrank to a single bent stroke.'],
  け: ['計', 'plan', 'The speech part on the left became the first stroke, the ten on the right the long stem.'],
  こ: ['己', 'self', 'Only the top and bottom lines of the kanji remained: two strokes.'],
  さ: ['左', 'left', 'The top bar and the first strokes of the kanji joined, the lower part became the curve.'],
  し: ['之', 'this, of', 'The kanji flowed into one smooth hook. It is the simplest kana.'],
  す: ['寸', 'a small measure', 'The horizontal bar and the hook were kept, the dot became a loop.'],
  せ: ['世', 'world', 'The three vertical lines of the kanji were simplified into the shape you see.'],
  そ: ['曽', 'once, formerly', 'The top of the kanji became the first short bar, the rest one zig-zag stroke.'],
  た: ['太', 'thick, big', 'The left side of the kanji became the cross, the right side the two small marks.'],
  ち: ['知', 'know', 'The left side of the kanji became the top bar, the rest one curling stroke.'],
  つ: ['川', 'river', 'The three flowing lines of the river joined into a single wave.'],
  て: ['天', 'heaven', 'The top bar of the kanji and its sweeping stroke became the one curved line.'],
  と: ['止', 'stop', 'The vertical stroke and the foot of the kanji became the dot and the curve.'],
  な: ['奈', 'Nara', 'The top of the kanji became the cross, the bottom the loop and the dot.'],
  に: ['仁', 'kindness', 'The person on the left became the vertical line, the two bars on the right stayed as two bars.'],
  ぬ: ['奴', 'fellow', 'The left side became the loop on the left, the right side the long tail with its curl.'],
  ね: ['祢', 'ancestral shrine', 'The left side became the vertical line, the right side the loop at the end.'],
  の: ['乃', 'then, so', 'The kanji was already one swirl; it just became rounder.'],
  は: ['波', 'wave', 'The water part on the left became the vertical line, the rest the loop.'],
  ひ: ['比', 'compare', 'Two parallel parts of the kanji were reduced to one wide curve.'],
  ふ: ['不', 'not', 'The top bar became the first stroke, the rest three small marks.'],
  へ: ['部', 'part', 'Only the hill-like right side of the kanji remained. That is why it is so simple.'],
  ほ: ['保', 'protect', 'The person on the left became the vertical line, the rest the bar and loop.'],
  ま: ['末', 'end', 'The two bars of the kanji stayed, the bottom became a loop.'],
  み: ['美', 'beautiful', 'The top of the kanji became the small stroke and the bottom the sweeping curve.'],
  む: ['武', 'military', 'The left side became the bar and stem, the right side the tail and the dot.'],
  め: ['女', 'woman', 'The woman kanji was already a loop; it became a rounder and simpler loop.'],
  も: ['毛', 'hair', 'The three bars of the kanji became two bars crossed by a hook.'],
  や: ['也', 'also', 'The horizontal and the hook were kept; the third stroke became the dot.'],
  ゆ: ['由', 'reason', 'The box of the kanji opened into a loop with the line running through it.'],
  よ: ['与', 'give', 'The kanji shrank to a small cross with a curl.'],
  ら: ['良', 'good', 'The top of the kanji became the small stroke, the bottom the curve.'],
  り: ['利', 'profit', 'Only the right-hand side of the kanji stayed: two vertical strokes.'],
  る: ['留', 'stay', 'The kanji flowed into one stroke with a loop at the bottom.'],
  れ: ['礼', 'courtesy', 'The left side became the vertical line, the right side the curved tail.'],
  ろ: ['呂', 'spine', 'The two boxes of the kanji were reduced to the top curve and the hook.'],
  わ: ['和', 'harmony', 'The grain on the left became the vertical line, the mouth on the right the loop.'],
  を: ['遠', 'far', 'The top of the kanji became the cross, the walking radical the sweeping curve.'],
  ん: ['无', 'nothing', 'The kanji was shortened into this one stroke with its curl.'],
};

/** Voiced and half-voiced kana are their base kana plus two dots or a small circle. */
export function originFor(char: string): [string, string, string] | undefined {
  return HIRAGANA_ORIGIN[char];
}
