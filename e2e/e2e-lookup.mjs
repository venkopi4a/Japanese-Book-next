// Add a word: type English, pick the Japanese, add it. Checks results, duplicates, offline dictionary and the by-hand fallback.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import chromium from '@sparticuz/chromium'; import puppeteer from 'puppeteer-core';
const OUT = path.resolve('e2e/out'); fs.mkdirSync(OUT, { recursive: true });
const BASE = '/Japanese-Book-next/', ROOT = path.resolve(process.env.SITE_DIR || 'dist'), PORT = 4183;
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




await page.goto(`http://localhost:${PORT}${BASE}`, { waitUntil: 'networkidle0' }); await sleep(1500); await page.waitForSelector('input[name=person]');
await page.type('input[name=person]', 'Venko'); await click('Start'); await page.waitForSelector('.tabbar'); await sleep(500);
const results = () => page.evaluate(() => [...document.querySelectorAll('[data-result]')].map((r) => r.innerText.replace(/\s+/g, ' ').trim()));
const typeQ = async (t) => { await page.focus('input[name=english]'); await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control'); await page.keyboard.press('Backspace'); await page.type('input[name=english]', t); await sleep(700); };

await step('open the lookup from the Add menu', async () => {
  await tab('Notebook'); await click('Add'); await sleep(300);
  ok('the menu says "Look up a word"', /Look up a word/.test(await txt()));
  await click('Look up a word'); await page.waitForSelector('input[name=english]'); await sleep(400);
  ok('it shows a hint and the English box', /Type an English word/.test(await txt()));
  ok('the box has focus', await page.evaluate(() => document.activeElement?.getAttribute('name') === 'english'));
  await shot('l01-empty');
});

await step('cat', async () => {
  await typeQ('cat');
  const r = await results();
  ok('the first result is 猫 with its reading and romaji', /^猫 ねこ neko/.test(r[0] || ''), r[0]);
  ok('the meaning starts with "cat"', /neko\s+cat/.test(r[0] || ''), r[0]);
  ok('there are several results to choose from', r.length >= 3, String(r.length));
  await shot('l02-cat');
  ok('no horizontal overflow', (await overflow()) <= 0);
});

await step('add 猫', async () => {
  await page.evaluate(() => document.querySelector('[data-result] button[name=add-result]').click()); await sleep(600);
  const r = await results();
  ok('the row now says Added', /Added/.test(r[0] || ''), r[0]);
  ok('the Done button counts it', /Done \(1 added\)/.test(await txt()));
  const words = await allOf('words');
  const w = words.find((x) => x.text === '猫');
  ok('it is saved in the notebook with reading, meaning and kind', !!w && w.reading === 'ねこ' && /^cat/.test(w.meaning) && w.kind === 'noun' && w.source === 'user', JSON.stringify(w));
  await shot('l03-added');
});

await step('a verb, and a second word in the same visit', async () => {
  await typeQ('to eat');
  const r = await results();
  ok('"to eat" gives 食べる first', /^食べる たべる taberu/.test(r[0] || ''), r[0] ?? ('none: ' + (await txt()).slice(0, 300)));
  await page.evaluate(() => document.querySelector('[data-result] button[name=add-result]').click()); await sleep(600);
  ok('Done counts two', /Done \(2 added\)/.test(await txt()));
  const w = (await allOf('words')).find((x) => x.text === '食べる');
  ok('kind is verb', w?.kind === 'verb', JSON.stringify(w));
});

await step('a word already in the notebook cannot be added twice', async () => {
  await typeQ('cat');
  const r = await results();
  ok('猫 shows "Added"', /Added/.test(r[0] || ''));
  await click('Done'); await sleep(300);
  await click('Add'); await sleep(300); await click('Look up a word'); await page.waitForSelector('input[name=english]'); await sleep(300);
  await typeQ('cat');
  const r2 = await results();
  ok('reopened: 猫 shows "In notebook" and is disabled', /In notebook/.test(r2[0] || '') && await page.evaluate(() => document.querySelector('[data-result] button').disabled), r2[0]);
  ok('still only one 猫 in the notebook', (await allOf('words')).filter((x) => x.text === '猫').length === 1);
});

await step('no match and the by-hand fallback', async () => {
  await typeQ('qzxqzx');
  ok('it says there is no match', /No match for/.test(await txt()));
  await shot('l04-nomatch');
  await click('Can'); await sleep(400);
  ok('"Add it by hand" opens the old form', /Add word/.test(await txt()));
});

await step('the dictionary works offline', async () => {
  await page.reload({ waitUntil: 'networkidle0' }); await sleep(2500); // let the service worker finish precaching
  await page.setOfflineMode(true);
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {}); await page.waitForSelector('.tabbar', { timeout: 15000 }); await sleep(500);
  await tab('Notebook'); await click('Add'); await sleep(300); await click('Look up a word'); await page.waitForSelector('input[name=english]'); await sleep(400);
  await typeQ('dog');
  const r = await results();
  ok('offline: "dog" gives 犬', /^犬 いぬ inu/.test(r[0] || ''), r[0]);
  await page.setOfflineMode(false);
});

ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(log.join('\n')); if (log.some((l) => l.startsWith('FAIL'))) process.exitCode = 1;
await b.close(); srv.close();
