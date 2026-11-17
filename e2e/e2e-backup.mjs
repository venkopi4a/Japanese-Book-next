// Backup: make a backup file, wipe the person's data, restore it, and check nothing is lost or duplicated.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import chromium from '@sparticuz/chromium'; import puppeteer from 'puppeteer-core';
const OUT = path.resolve('e2e/out'); fs.mkdirSync(OUT, { recursive: true });
const BASE = '/Japanese-Book-next/', ROOT = path.resolve(process.env.SITE_DIR || 'dist'), PORT = 4182;
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



// capture the backup file the app hands to the browser as a download
await page.evaluateOnNewDocument(() => {
  window.__backup = null;
  const orig = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (blob) => { if (blob instanceof Blob && blob.type === 'application/json') blob.text().then((t) => { window.__backup = t; }); return orig(blob); };
  HTMLAnchorElement.prototype.click = function () { window.__downloadName = this.download; };
});
await page.goto(`http://localhost:${PORT}${BASE}`, { waitUntil: 'networkidle0' }); await sleep(1500); await page.waitForSelector('input[name=person]');
await page.type('input[name=person]', 'Venko'); await click('Start'); await page.waitForSelector('.tabbar'); await sleep(300);
const openSettings = async () => { await page.evaluate(() => document.querySelector('button[aria-label="Settings"]')?.click()); await sleep(400); };
const closeSettings = async () => { await click('Done'); await sleep(300); };

let before;
await step('make some progress', async () => {
  await click('Start lesson'); await sleep(500);
  await click('Got it'); await sleep(300); // teaches the first kana
  for (let i = 0; i < 6; i++) {
    const opts = await page.$$('.opt:not([disabled])');
    if (opts.length) { await opts[0].click(); await sleep(300); break; }
    await sleep(300);
  }
  await page.evaluate(() => document.querySelector('button[aria-label="End session"]')?.click()); await sleep(500);
  before = { words: (await allOf('words')).length, attempts: (await allOf('attempts')).length, states: (await allOf('skillStates')).length };
  ok('there is progress to back up', before.words === 104 && before.attempts >= 1 && before.states >= 1, JSON.stringify(before));
});

await step('make the backup', async () => {
  await tab('Notebook'); await openSettings();
  ok('Settings shows the Backup section with "never"', /Backup/.test(await txt()) && /Last backup:\s*never/i.test(await txt()));
  ok('the old "no backup yet" warning is gone', !/There is no backup yet/.test(await txt()));
  await page.evaluate(() => [...document.querySelectorAll('h2')].find((h) => h.textContent === 'Backup').scrollIntoView({ block: 'start' })); await sleep(200);
  await shot('b01-backup-settings');
  ok('no horizontal overflow (Settings)', (await overflow()) <= 0);
  await click('Make a backup file'); await page.waitForSelector('button[name=save-backup]', { timeout: 8000 });
  ok('it says what is in the backup', /Ready: 104 words, \d+ answers?, 0 photos/.test(await txt()), (await txt()).match(/Ready:[^\n]*/)?.[0]);
  await shot('b03-backup-ready');
  await click('Save backup file'); await sleep(800);
  const got = await page.evaluate(() => ({ t: window.__backup, n: window.__downloadName }));
  ok('a file named japanese-book-Venko-DATE.json is saved', /^japanese-book-Venko-\d{4}-\d{2}-\d{2}\.json$/.test(got.n || ''), got.n);
  ok('the file is a valid backup', !!got.t && JSON.parse(got.t).format === 'japanese-book-backup');
  fs.writeFileSync(`${OUT}/backup.json`, got.t);
  ok('Settings now shows the last backup date, not "never"', !/Last backup:\s*never/i.test(await txt()));
  await closeSettings();
});

await step('wipe the data like a lost phone', async () => {
  await openSettings(); await click("Delete Venko's data"); await sleep(2500);
  await page.waitForSelector('input[name=person]', { timeout: 8000 });
  await page.type('input[name=person]', 'Venko'); await click('Start'); await page.waitForSelector('.tabbar'); await sleep(500);
  const atts = (await allOf('attempts')).length;
  ok('the new phone starts with no answers', atts === 0, String(atts));
});

await step('restore', async () => {
  await openSettings();
  const input = await page.$('input[name=restore]');
  await input.uploadFile(`${OUT}/backup.json`);
  await sleep(1800);
  const after = { words: (await allOf('words')).length, attempts: (await allOf('attempts')).length, states: (await allOf('skillStates')).length };
  ok('everything came back, with no duplicate built-in words', after.words === 104 && after.attempts === before.attempts && after.states === before.states, JSON.stringify({ before, after }));
  ok('it tells the person what was restored', /Restored:/.test(await txt()));
  await shot('b02-restored');
  // restoring the same file again changes nothing
  const input2 = await page.$('input[name=restore]'); await input2.uploadFile(`${OUT}/backup.json`); await sleep(1800);
  const twice = { words: (await allOf('words')).length, attempts: (await allOf('attempts')).length, states: (await allOf('skillStates')).length };
  ok('restoring twice adds nothing', JSON.stringify(twice) === JSON.stringify(after), JSON.stringify(twice));
});

await step('a wrong file is refused', async () => {
  fs.writeFileSync(`${OUT}/not-a-backup.json`, '{"hello":1}');
  const input = await page.$('input[name=restore]'); await input.uploadFile(`${OUT}/not-a-backup.json`); await sleep(1000);
  ok('it says so in plain words and changes nothing', /not a backup file/i.test(await txt()) && (await allOf('words')).length === 104);
});

ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(log.join('\n')); if (log.some((l) => l.startsWith('FAIL'))) process.exitCode = 1;
await b.close(); srv.close();
