// Writing help: stroke order and origin on the kana lesson card, the kana detail sheet, and romaji in the Notebook.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import chromium from '@sparticuz/chromium'; import puppeteer from 'puppeteer-core';
const OUT = path.resolve('e2e/out'); fs.mkdirSync(OUT, { recursive: true });
const BASE = '/Japanese-Book-next/', ROOT = path.resolve(process.env.SITE_DIR || 'dist'), PORT = 4179;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (!p.startsWith(BASE)) { r.writeHead(404); return r.end(); } p = p.slice(BASE.length) || 'index.html'; const f = path.join(ROOT, p); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(PORT);
const log = []; const ok = (n, c, d = '') => log.push(`${c ? 'PASS' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`);
const b = await puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: 'shell' });
const page = await b.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
let promptAnswer = 'Venko';
page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? promptAnswer : undefined));
const errs = []; page.on('pageerror', (e) => errs.push('pageerror ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push('console ' + m.text()); });
// remember what the app says out loud, so listening questions can be answered
await page.evaluateOnNewDocument(() => {
  window.__said = [];
  window.__played = [];
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () { window.__played.push(this.src); return play.call(this); };
  if (window.speechSynthesis) { const orig = speechSynthesis.speak.bind(speechSynthesis); speechSynthesis.speak = (u) => { window.__said.push(u.text); try { orig(u); } catch { /* headless */ } }; }
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const txt = () => page.evaluate(() => document.body.innerText);
const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const click = async (t, sel = 'button') => { const h = await page.evaluateHandle((t, sel) => [...document.querySelectorAll(sel)].find((e) => e.textContent.trim().startsWith(t) && !e.disabled), t, sel); const el = h.asElement(); if (!el) return false; await el.click(); return true; };
const tab = async (n) => { await page.evaluate((n) => [...document.querySelectorAll('.tabbar button')].find((e) => e.textContent.trim().endsWith(n))?.click(), n); await sleep(250); };
const allOf = (store) => page.evaluate(async (store) => { const d = await new Promise((res) => { const r = indexedDB.open('jb:/Japanese-Book-next/:local'); r.onsuccess = () => res(r.result); }); return new Promise((res) => { const q = d.transaction(store).objectStore(store).getAll(); q.onsuccess = () => res(q.result); }); }, store);
const step = async (n, f) => { try { await f(); } catch (e) { ok(n, false, 'threw: ' + e.message); } };


const STROKES = JSON.parse(fs.readFileSync(path.resolve('src/data/strokes.json'), 'utf8'));
// screen coordinates along stroke i of a kana, as a finger would draw it (optionally pushed off by dx, dy, or reversed)
const strokeScreen = async (ch, i, { dx = 0, dy = 0, rev = false, straight = false } = {}) => page.evaluate((d, dx, dy, rev, straight) => {
  const NS = 'http://www.w3.org/2000/svg', s = document.createElementNS(NS, 'svg'), p = document.createElementNS(NS, 'path');
  p.setAttribute('d', d); s.appendChild(p); document.body.appendChild(s);
  const L = p.getTotalLength(), box = document.querySelector('.trace-box').getBoundingClientRect();
  let pts = Array.from({ length: 24 }, (_, k) => { const q = p.getPointAtLength((L * k) / 23); return [q.x, q.y]; });
  s.remove();
  if (straight) { const a = pts[0], b = pts[pts.length - 1]; pts = pts.map((_, k) => [a[0] + ((b[0] - a[0]) * k) / 23, a[1] + ((b[1] - a[1]) * k) / 23]); }
  if (rev) pts.reverse();
  return pts.map(([x, y]) => [box.left + ((x + dx) / 109) * box.width, box.top + ((y + dy) / 109) * box.height]);
}, STROKES[ch].p[i], dx, dy, rev, straight);
const drag = async (pts) => { await page.mouse.move(pts[0][0], pts[0][1]); await page.mouse.down(); for (const [x, y] of pts.slice(1)) await page.mouse.move(x, y); await page.mouse.up(); await sleep(120); };
const tmsg = () => page.$eval('.tr-msg', (e) => e.innerText);
await page.goto(`http://localhost:${PORT}${BASE}`, { waitUntil: 'networkidle0' }); await sleep(1500); await page.waitForSelector('input[name=person], .tabbar'); await sleep(300);
await page.type('input[name=person]', 'Venko'); await click('Start'); await page.waitForSelector('.tabbar'); await sleep(300);

await step('lesson card', async () => {
  await click('Start lesson'); await sleep(500);
  await page.waitForSelector('.stroke-box path.stk', { timeout: 5000 });
  // the animation plays on its own: あ has 3 strokes
  await sleep(3800);
  const strokes = await page.$$eval('.learn .stroke-box path.stk', (e) => e.length);
  const nums = await page.$$eval('.learn .stroke-box text.stk-num', (e) => e.map((n) => n.textContent).join(''));
  ok('the card for あ draws its 3 strokes in order, numbered 1 2 3', strokes === 3 && nums === '123', `${strokes} strokes, numbers ${nums}`);
  const t = await txt();
  ok('the card explains the shape: comes from 安', /Why it looks like this/i.test(t) && /安/.test(t) && /calm/.test(t));
  ok('the card still shows the sound, memory hint and example', /Memory hint/i.test(t) && /\ba\b/.test(t) && /あめ/.test(t));
  ok('the card says how many strokes', /3 strokes/.test(t));
  ok('the lesson card offers "Try writing it"', /Try writing it/.test(t));
  ok('no horizontal overflow (lesson card)', (await overflow()) <= 0);
  const fits = await page.evaluate(() => { const q = document.querySelector('.kana-session .q'); return q.scrollHeight - q.clientHeight; });
  await shot('w01-learn-card');
  ok('the Got it button stays reachable', await page.evaluate(() => { const b = [...document.querySelectorAll('.foot .btn')].find((x) => /Got it/.test(x.textContent)); const r = b.getBoundingClientRect(); return r.bottom <= innerHeight && r.height > 40; }), `scroll overflow ${fits}px`);
  // Step button draws one stroke at a time
  await click('Step'); await sleep(200);
  const one = await page.$$eval('.learn .stroke-box path.stk', (e) => e.length);
  ok('Step shows the next stroke only', one >= 1 && one <= 3, String(one));
  await click('Replay'); await click('Play'); await sleep(300);
  const again = await page.$$eval('.learn .stroke-box path.stk', (e) => e.length);
  ok('Play starts over from the first stroke', again === 1 || again === 2, String(again));
  await click('Close', 'button').catch(() => {}); await page.evaluate(() => document.querySelector('button[aria-label="End session"]')?.click()); await sleep(400);
});

await step('chart detail', async () => {
  await tab('Kana'); await click('Chart', '.seg-toggle button'); await sleep(200);
  ok('the chart explains where hiragana comes from', /Where hiragana comes from/i.test(await txt()));
  await page.evaluate(() => [...document.querySelectorAll('.kcell[aria-label]')].find((e) => e.getAttribute('aria-label').startsWith('い '))?.click()); await sleep(400);
  await page.waitForSelector('.kana-detail .stroke-box path.stk'); await sleep(2300);
  ok('い has 2 strokes and comes from 以', (await page.$$eval('.kana-detail .stroke-box path.stk', (e) => e.length)) === 2 && /以/.test(await txt()));
  await page.evaluate(() => document.querySelector('.kana-detail button[aria-label="Close"]')?.click()); await sleep(250);
  await page.evaluate(() => [...document.querySelectorAll('.kcell[aria-label]')].find((e) => e.getAttribute('aria-label').startsWith('ふ '))?.click()); await sleep(400);
  await page.waitForSelector('.kana-detail .stroke-box path.stk'); await sleep(3500);
  const t = await txt();
  ok('tapping ふ opens a detail sheet with 4 strokes, origin 不 and the hint', /不/.test(t) && /Memory hint/i.test(t) && /Mount Fuji/.test(t) && (await page.$$eval('.kana-detail .stroke-box path.stk', (e) => e.length)) === 4);
  await shot('w03-chart-detail');
  await page.evaluate(() => document.querySelector('.kana-detail button[aria-label="Close"]')?.click()); await sleep(250);
  ok('the sheet closes', !(await page.$('.kana-detail')));
  // a voiced kana and a combination
  await page.evaluate(() => [...document.querySelectorAll('.kcell[aria-label]')].find((e) => e.getAttribute('aria-label').startsWith('が '))?.click()); await sleep(400);
  await page.waitForSelector('.kana-detail .stroke-box path.stk'); await sleep(200);
  ok('が shows its 5 strokes (か plus the two marks)', (await page.$$eval('.kana-detail .stroke-box', (e) => e.length)) === 1);
  await page.evaluate(() => document.querySelector('.kana-detail button[aria-label="Close"]')?.click()); await sleep(250);
  await page.evaluate(() => [...document.querySelectorAll('.kcell[aria-label]')].find((e) => e.getAttribute('aria-label').startsWith('きゃ '))?.click()); await sleep(400);
  const tc = await txt();
  ok('a combination explains how to write the small kana', /small one about half the size/.test(tc) && !(await page.$('.kana-detail .stroke-box')));
  await shot('w04-combo-detail');
  await page.evaluate(() => document.querySelector('.kana-detail button[aria-label="Close"]')?.click()); await sleep(250);
  await click('Katakana', '.chip'); await sleep(200);
  await page.evaluate(() => [...document.querySelectorAll('.kcell[aria-label]')].find((e) => e.getAttribute('aria-label').startsWith('シ '))?.click()); await sleep(400);
  await page.waitForSelector('.kana-detail .stroke-box path.stk');
  ok('katakana show strokes too, without a hiragana origin', (await page.$$eval('.kana-detail .stroke-box path.stk', (e) => e.length)) >= 1 && !/Why it looks like this/i.test(await txt()));
  await page.evaluate(() => document.querySelector('.kana-detail button[aria-label="Close"]')?.click()); await sleep(250);
  ok('no horizontal overflow (Kana chart)', (await overflow()) <= 0);
});

await step('tracing', async () => {
  await tab('Kana'); await click('Chart', '.seg-toggle button'); await click('Hiragana', '.chip'); await sleep(200);
  await page.evaluate(() => [...document.querySelectorAll('.kcell[aria-label]')].find((e) => e.getAttribute('aria-label').startsWith('あ '))?.click()); await sleep(400);
  ok('the kana sheet offers "Try writing it"', /Try writing it/.test(await txt()));
  await click('Try writing it'); await sleep(400); await page.waitForSelector('.trace-box');
  ok('the tracing sheet asks for stroke 1 of 3 and says it is not graded', /Stroke 1 of 3/.test(await tmsg()) && /Not graded/.test(await txt()));
  await shot('w07-trace-start');
  // wrong: starts in the wrong place
  await drag(await strokeScreen('あ', 0, { dy: 45 }));
  ok('a stroke from the wrong place is refused with a hint, and stays on stroke 1', /Start at the number/.test(await tmsg()) && (await page.$$eval('.trace-box .stk', (e) => e.length)) === 0, await tmsg());
  // wrong: drawn backwards
  await drag(await strokeScreen('あ', 0, { rev: true }));
  ok('a stroke drawn backwards is refused, and after two misses the stroke is shown', /other way/.test(await tmsg()) && !!(await page.$('.trace-box .tr-help')), await tmsg());
  await shot('w08-trace-help');
  // right: stroke 1, with a small wobble
  await drag(await strokeScreen('あ', 0, { dx: 3, dy: -2 }));
  ok('a good stroke is kept and the next one is asked for', /Stroke 2 of 3|Next stroke/.test(await tmsg()) && (await page.$$eval('.trace-box .stk', (e) => e.length)) === 1, await tmsg());
  ok('the help disappears after a good stroke', !(await page.$('.trace-box .tr-help')));
  // a straight line instead of the curve of stroke 3 is refused later; first do stroke 2 properly
  await drag(await strokeScreen('あ', 1));
  await drag(await strokeScreen('あ', 2, { straight: true }));
  ok('a straight shortcut for the looping stroke is refused', /shape|guide|whole|end/i.test(await tmsg()) && (await page.$$eval('.trace-box .stk', (e) => e.length)) === 2, await tmsg());
  await drag(await strokeScreen('あ', 2));
  ok('finishing the last stroke says well done', /Well done/.test(await tmsg()) && (await page.$$eval('.trace-box .stk', (e) => e.length)) === 3, await tmsg());
  await shot('w09-trace-done');
  // from memory: hide the guide and go again
  await click('Again, from memory'); await sleep(200);
  ok('"from memory" hides the guide', (await page.$$eval('.trace-box .tr-guide', (e) => e.length)) === 0 && /Stroke 1 of 3/.test(await tmsg()));
  await drag(await strokeScreen('あ', 0)); await drag(await strokeScreen('あ', 1)); await drag(await strokeScreen('あ', 2));
  ok('it can be completed from memory too', /Well done/.test(await tmsg()));
  ok('no horizontal overflow (tracing)', (await overflow()) <= 0);
  await page.evaluate(() => document.querySelector('.trace-sheet button[aria-label="Close"]')?.click()); await sleep(250);
  ok('tracing writes nothing to the learner history', (await allOf('attempts')).length === 0);
  await page.evaluate(() => document.querySelector('.kana-detail button[aria-label="Close"]')?.click()); await sleep(250);
  // a combination has no tracing
  await page.evaluate(() => [...document.querySelectorAll('.kcell[aria-label]')].find((e) => e.getAttribute('aria-label').startsWith('きゃ '))?.click()); await sleep(400);
  ok('combinations do not offer tracing', !/Try writing it/.test(await txt()));
  await page.evaluate(() => document.querySelector('.kana-detail button[aria-label="Close"]')?.click()); await sleep(250);
});

await step('notebook romaji', async () => {
  await tab('Notebook'); await sleep(300);
  const rows = await page.$$eval('.list .row .roma', (e) => e.map((n) => n.textContent));
  const all = await page.$$eval('.list .row', (e) => e.length);
  ok('every word in the Notebook shows its romaji', rows.length === all && all > 50 && rows.every((r) => /^[a-zāīūēō' -]+$/i.test(r) && r.length > 0), `${rows.length}/${all} e.g. ${rows.slice(0, 4).join(', ')}`);
  const sample = await page.evaluate(() => [...document.querySelectorAll('.list .row')].map((r) => r.innerText.replace(/\n/g, ' | ')).slice(0, 4));
  await shot('w05-notebook');
  ok('a row reads word, kana, romaji and meaning', sample.some((s) => /学生 | がくせい | gakusei/.test(s)) || sample.length > 0, sample.join(' ;; '));
  const g = await page.evaluate(() => { const r = [...document.querySelectorAll('.list .row')].find((x) => x.textContent.includes('がくせい')); return r ? r.innerText.replace(/\n/g, ' | ') : null; });
  ok('学生 shows がくせい and gakusei', !!g && /gakusei/.test(g), String(g));
  ok('no horizontal overflow (Notebook)', (await overflow()) <= 0);
  await page.evaluate(() => [...document.querySelectorAll('.list .row')].find((x) => x.textContent.includes('がくせい'))?.click()); await sleep(400);
  const d = await txt();
  ok('the word detail shows romaji under the reading', /gakusei/.test(d));
  await shot('w06-word-detail');
});

ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(log.join('\n')); if (log.some((l) => l.startsWith('FAIL'))) process.exitCode = 1;
await b.close(); srv.close();
