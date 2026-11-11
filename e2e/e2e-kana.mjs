// Kana course, the vocabulary gate, people on one device, the voice picker and the new Progress screen.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import chromium from '@sparticuz/chromium'; import puppeteer from 'puppeteer-core';
const OUT = path.resolve('e2e/out'); fs.mkdirSync(OUT, { recursive: true });
const BASE = '/Japanese-Book-next/', ROOT = path.resolve(process.env.SITE_DIR || 'dist'), PORT = 4177;
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

await page.goto(`http://localhost:${PORT}${BASE}`, { waitUntil: 'networkidle0' }); await sleep(300);

await step('welcome', async () => {
  const t = await txt();
  ok('first launch asks for a name', /Welcome/.test(t) && /What’s your name\?/.test(t), t.slice(0, 120));
  await shot('k01-welcome');
  await page.type('input[name=person]', 'Venko'); await click('Start'); await page.waitForSelector('.tabbar'); await sleep(300);
  const t2 = await txt();
  ok('a brand-new learner starts with hiragana, not vocabulary', /Today's kana/i.test(t2) && /あ い う え お/.test(t2) && /か き く け こ/.test(t2) && /Start lesson/.test(t2) && /Opens after hiragana/.test(t2), t2.split('\n').slice(0, 12).join(' | '));
  ok('greeting uses the name', /、Venko/.test(t2));
  ok('no horizontal overflow (Today, kana first)', (await overflow()) <= 0);
  await shot('k02-today-kana');
});

await step('practice locked', async () => {
  await tab('Practice'); const t = await txt();
  const disabled = await page.evaluate(() => [...document.querySelectorAll('.list .row')].every((r) => r.disabled));
  ok('vocabulary practice is locked until hiragana is learned', /Vocabulary opens after hiragana/.test(t) && disabled);
});

await step('chart', async () => {
  await tab('Kana'); const t = await txt();
  ok('kana tab shows the chart and progress', /0 of 104 learned/.test(t) && /Basic/.test(t) && /With ゛ and ゜/.test(t) && /Combinations/.test(t));
  const cells = await page.$$eval('.kcell[aria-label]', (e) => e.length);
  ok('hiragana chart has all 104 characters', cells === 104, String(cells));
  ok('no horizontal overflow (Kana)', (await overflow()) <= 0);
  await shot('k03-kana-chart');
  await click('Katakana', '.chip'); await sleep(150);
  ok('katakana chart switches script', /ア/.test(await txt()) && /カ/.test(await txt()));
  await click('Hiragana', '.chip'); await sleep(150);
});

await step('lesson', async () => {
  await click('Start lesson'); await sleep(350);
  let t = await txt();
  ok('a lesson starts with a learn card: character, sound and a memory hint', /New hiragana/.test(t) && /あ/.test(t) && /apple/.test(t));
  await shot('k04-learn-card');
  const ROMA = { あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o', か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko', さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so' };
  let learns = 0, quizzes = 0, wrongs = 0, qShot = false, steps = 0;
  while (steps++ < 120) {
    t = await txt();
    if (/Kana lesson complete/.test(t)) break;
    if (/New hiragana/.test(t)) { learns++; await click('Next'); await sleep(200); continue; }
    const opts = await page.$$('.opt:not([disabled])');
    if (!opts.length) { if (await click('Next')) await sleep(200); else await sleep(200); continue; }
    if (!qShot) { await shot('k05-kana-question'); qShot = true; }
    const big = await page.evaluate(() => document.querySelector('.qcard .kana-big')?.textContent);
    const want = big ? ROMA[big] : await page.evaluate(() => window.__said[window.__said.length - 1]);
    const texts = await Promise.all(opts.map((o) => o.evaluate((e) => e.textContent)));
    // answer the first question wrong on purpose, to check the extra try
    let idx = texts.indexOf(want); if (quizzes === 0 && texts.length > 1) idx = (idx + 1) % texts.length;
    await opts[idx < 0 ? 0 : idx].click(); quizzes++; await sleep(200);
    if (/Not quite/.test(await txt())) { wrongs++; if (wrongs === 1) await shot('k06-kana-wrong'); await click('Next'); await sleep(200); } else await sleep(700);
  }
  t = await txt();
  ok('the lesson teaches three rows (15 kana) and checks each by sight and sound', learns === 15 && quizzes >= 30, `learn=${learns} quiz=${quizzes} wrong=${wrongs}`);
  ok('a missed kana gets one extra try at the end', wrongs >= 1 && quizzes >= 31);
  ok('lesson summary shows hiragana progress', /Kana lesson complete/.test(t) && /hiragana learned/.test(t), t.split('\n').slice(0, 10).join(' | '));
  await shot('k07-kana-summary');
  const states = await allOf('skillStates');
  const atts = await allOf('attempts');
  const rec = states.filter((s) => s.wordId.startsWith('kana:') && s.skill === 'recognition');
  ok('kana answers are saved like any other answer', rec.length === 15 && atts.length >= 30 && atts.every((a) => a.exercise.startsWith('kana-')), `${rec.length} states, ${atts.length} attempts`);
  ok('a lesson kana missed at first is not counted as a lapse', rec.every((s) => s.lapses === 0));
  await click('Done'); await sleep(300);
  const t2 = await txt();
  ok('after the lesson, today is done (daily limit 15) and the path shows progress', /15 of 104 learned/.test(t2) && /All done for today|Review first/.test(t2), t2.split('\n').slice(0, 12).join(' | '));
});

await step('unlock', async () => {
  // pretend the rest of hiragana was learned on earlier days
  await page.evaluate(async () => {
    const d = await new Promise((res) => { const r = indexedDB.open('jb:/Japanese-Book-next/:local'); r.onsuccess = () => res(r.result); });
    const H = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんがぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽ'.split('').concat('きゃ きゅ きょ しゃ しゅ しょ ちゃ ちゅ ちょ にゃ にゅ にょ ひゃ ひゅ ひょ みゃ みゅ みょ りゃ りゅ りょ ぎゃ ぎゅ ぎょ じゃ じゅ じょ びゃ びゅ びょ ぴゃ ぴゅ ぴょ'.split(' '));
    const tx = d.transaction('skillStates', 'readwrite'); const st = tx.objectStore('skillStates'); const now = Date.now(), DAY = 86400000;
    H.forEach((c, i) => { for (const skill of ['recognition', 'listening']) st.put({ wordId: 'kana:h:' + c, skill, box: i % 9 === 0 ? 5 : 2, dueAt: now + 3 * DAY, correct: 2, lapses: 0, introducedAt: now - (8 - (i % 8)) * DAY, lastAt: now - DAY, lastCorrect: true }); });
    await new Promise((r) => (tx.oncomplete = r));
  });
  await page.reload({ waitUntil: 'networkidle0' }); await page.waitForSelector('.tabbar'); await sleep(300);
  const t = await txt();
  ok('learning hiragana opens vocabulary', /to practise/.test(t) && /10 new words/.test(t), t.split('\n').slice(0, 10).join(' | '));
  ok('katakana is offered next, alongside vocabulary', /ア イ ウ エ オ/.test(t));
  await shot('k08-today-unlocked');
});

await step('teach-first and reading help', async () => {
  await click('Start practice'); await sleep(350);
  const t = await txt();
  const kanjiWord = await page.evaluate(() => document.querySelector('.qcard .ja')?.textContent);
  ok('new words are taught on a lesson card (reading, romaji and meaning visible at once)', /New word/.test(t) && /asked about it tomorrow/.test(t) && !!(await page.$('.qcard .roma')), kanjiWord);
  await shot('k09-word-lesson');
  await page.click('button[aria-label="End session"]'); await sleep(300);
  // seed some met words so recall questions can be checked for reading help
  await page.evaluate(async () => {
    const d = await new Promise((res) => { const r = indexedDB.open('jb:/Japanese-Book-next/:local'); r.onsuccess = () => res(r.result); });
    const words = await new Promise((res) => { const q = d.transaction('words').objectStore('words').getAll(); q.onsuccess = () => res(q.result); });
    const tx = d.transaction('skillStates', 'readwrite'); const st = tx.objectStore('skillStates'); const now = Date.now();
    for (const w of words.filter((w) => /[一-鿿]/.test(w.text)).slice(0, 8)) for (const s of ['recognition', 'recall']) st.put({ wordId: w.id, skill: s, box: 2, dueAt: now - 86400000, correct: 2, lapses: 0, introducedAt: now - 4 * 86400000, lastAt: now - 2 * 86400000, lastCorrect: true });
    await new Promise((r) => (tx.oncomplete = r));
  });
  await page.reload({ waitUntil: 'networkidle0' }); await page.waitForSelector('.tabbar');
  await tab('Practice'); await click('Recall', '.row'); await sleep(350);
  const helps = await page.$$eval('.opt .ohelp', (e) => e.map((x) => x.textContent));
  ok('Japanese answer options show their kana reading', helps.length >= 2 && helps.every((h) => /[ぁ-んァ-ン]/.test(h)), helps.join(' / '));
  await shot('k10-recall-help');
  await page.click('button[aria-label="End session"]'); await sleep(300);
});

await step('progress', async () => {
  await tab('Progress'); const t = await txt();
  ok('progress shows level, words ring, kana bars, streak calendar and milestones', /level \d/i.test(t) && /of 104 words/.test(t) && /Hiragana/.test(t) && /104 \/ 104/.test(t) && /days? in a row/.test(t) && /Milestones/.test(t) && /best ever/.test(t));
  ok('hiragana milestone is marked done', await page.evaluate(() => [...document.querySelectorAll('.mile.done')].some((m) => /Hiragana/.test(m.textContent))));
  ok('no horizontal overflow (Progress)', (await overflow()) <= 0);
  await shot('k11-progress');
  await page.evaluate(() => window.scrollTo(0, 99999)); await page.evaluate(() => document.querySelector('.screen')?.scrollTo(0, 99999)); await sleep(200); await shot('k12-progress-lower');
});

await step('voice', async () => {
  await page.click('button[aria-label="Settings"]'); await sleep(300);
  const t = await txt();
  ok('settings has a voice picker with a try button', !!(await page.$('select[name=voice]')) && /Try this voice/.test(t));
  await click('Want a more natural voice?'); await sleep(150);
  ok('settings explains how to get free natural voices on iPhone', /Spoken Content/.test(await txt()) && /Enhanced/.test(await txt()));
  await shot('k13-settings-voice');
});

await step('people', async () => {
  await click('Add a person'); await sleep(300);
  let t = await txt();
  ok('switching shows the picker', /Who’s studying\?/.test(t) && /Venko/.test(t));
  await click('+ Add a person'); await sleep(150); await page.type('input[name=person]', 'Mila'); await click('Add'); await sleep(200);
  t = await txt(); ok('a second person can be added', /Mila/.test(t) && /Venko/.test(t));
  await shot('k14-picker');
  await page.click('button[aria-label="Study as Mila"]'); await page.waitForSelector('.tabbar'); await sleep(300);
  t = await txt(); ok('the second person starts fresh with their own progress', /あ い う え お/.test(t) && /0 of 104 learned/.test(t) && /、Mila/.test(t), t.split('\n').slice(0, 8).join(' | '));
  await page.reload({ waitUntil: 'networkidle0' }); await sleep(300);
  ok('with two people the picker shows on start', /Who’s studying\?/.test(await txt()));
  await page.click('button[aria-label="Study as Venko"]'); await page.waitForSelector('.tabbar'); await sleep(300);
  t = await txt(); ok('switching back keeps the first person\'s progress', /to practise/.test(t) && /、Venko/.test(t));
  // iPhone Home Screen fallback: the phone's own name pop-up
  await page.click('button[aria-label="Settings"]'); await sleep(300); await click('Switch person'); await sleep(300);
  await click('+ Add a person'); await sleep(150);
  ok('the add form offers a fallback when the keyboard does not open', /Keyboard not opening\? Tap here/.test(await txt()));
  promptAnswer = 'Ana'; await click('Keyboard not opening?'); await sleep(300);
  ok('the fallback pop-up adds the person', /Ana/.test(await txt()) && !!(await page.$('button[aria-label="Study as Ana"]')));
  await page.click('button[aria-label="Study as Venko"]'); await page.waitForSelector('.tabbar'); await sleep(300);
  const names = await page.evaluate(() => indexedDB.databases().then((l) => l.map((x) => x.name)));
  ok('each person has a separate database', names.includes('jb:/Japanese-Book-next/:local') && names.some((n) => /^jb:\/Japanese-Book-next\/:p/.test(n)), names.join(', '));
});

await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
await tab('Kana'); await sleep(200); await shot('k15-dark-kana');
await tab('Progress'); await sleep(200); await shot('k16-dark-progress');

ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(log.join('\n')); if (log.some((l) => l.startsWith('FAIL'))) process.exitCode = 1;
await b.close(); srv.close();
