import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import chromium from '@sparticuz/chromium'; import puppeteer from 'puppeteer-core';
import { toRomaji } from 'wanakana';
const LIB=JSON.parse(fs.readFileSync(path.resolve('src/data/library.json'),'utf8'));
const romajiFor=(w)=>{const e=(Array.isArray(LIB)?LIB:LIB.words).find(x=>x.text===w);return e?toRomaji(e.reading).replace(/ā/g,'aa').replace(/ī/g,'ii').replace(/ū/g,'uu').replace(/ē/g,'ee').replace(/ō/g,'ou'):'neko'};
const OUT=path.resolve('e2e/out');fs.mkdirSync(OUT,{recursive:true});

const BASE='/Japanese-Book-next/', ROOT=path.resolve(process.env.SITE_DIR||'dist');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json'};
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(!p.startsWith(BASE)){r.writeHead(404);return r.end()}p=p.slice(BASE.length)||'index.html';const f=path.join(ROOT,p);if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end()}r.writeHead(200,{'content-type':types[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(r)}).listen(4173);
const log=[];const ok=(n,c,d='')=>{log.push(`${c?'PASS':'FAIL'} ${n}${d?' — '+d:''}`)};
const b=await puppeteer.launch({args:chromium.args,executablePath:await chromium.executablePath(),headless:'shell'});
const page=await b.newPage();
await page.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true});
const errs=[];page.on('pageerror',e=>errs.push('pageerror '+e.message));page.on('console',m=>{if(m.type()==='error')errs.push('console '+m.text())});
const shot=(n)=>page.screenshot({path:`${OUT}/${n}.png`});
const txt=()=>page.evaluate(()=>document.body.innerText);
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const overflow=()=>page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
const clickText=async(t,sel='button')=>{const h=await page.evaluateHandle((t,sel)=>[...document.querySelectorAll(sel)].find(e=>e.textContent.trim().startsWith(t)&&!e.disabled),t,sel);const el=h.asElement();if(!el)return false;await el.click();return true};
await page.evaluateOnNewDocument(()=>{const B='jb:/Japanese-Book-next/:';if(!localStorage.getItem(B+'profiles')){localStorage.setItem(B+'profiles',JSON.stringify([{id:'local',name:'Test',colour:0}]));localStorage.setItem(B+'settings',JSON.stringify({kanaSkip:true}))}});
await page.goto('http://localhost:4173'+BASE,{waitUntil:'networkidle0'});
await page.waitForSelector('.big');await sleep(300);
let t=await txt();
ok('first run seeds 10 new words on Today',/10 to practise/.test(t)&&/0 reviews, 10 new words/.test(t),t.split('\n').slice(0,8).join(' | '));
ok('no horizontal overflow (Today)',(await overflow())<=0);
await shot('01-today-light');
for(const [n,label] of [['02-notebook','Notebook'],['03-practice','Practice'],['04-progress','Progress']]){await clickText(label,'.tabbar button');await sleep(250);await shot(n);ok(`no horizontal overflow (${label})`,(await overflow())<=0)}
await clickText('Notebook','.tabbar button');await sleep(150);
t=await txt();ok('notebook lists words grouped by topic',/104 words|Search 104/.test(await page.evaluate(()=>document.querySelector('input[type=search]').placeholder))&&/弁護士|学生/.test(t));
// search by romaji
await page.type('input[type=search]','gakusei');await sleep(200);t=await txt();ok('romaji search finds がくせい',/学生/.test(t)&&!/弁護士/.test(t));
await page.evaluate(()=>{const i=document.querySelector('input[type=search]');i.value='';i.dispatchEvent(new Event('input',{bubbles:true}))});
// word detail
await clickText('学生','.row');await sleep(250);await shot('05-word');t=await txt();ok('word detail opens',/Lesson \/ unit/.test(t)&&/not started/.test(t));
await clickText('Back');await sleep(150);
// add word validation
await clickText('Add');await sleep(250);await clickText('Type a word');await sleep(250);await clickText('Add word');await sleep(100);t=await txt();ok('add form validates empty input',/Enter the Japanese word/.test(t));
await page.type('input[name=text]','猫');await page.type('input[name=reading]','ねこ');await page.type('input[name=meaning]','cat');
await shot('06-add-form');await clickText('Add word');await sleep(300);t=await txt();ok('word added and toast shown',/Added 猫/.test(t));
await page.type('input[type=search]','neko');await sleep(200);t=await txt();ok('new word searchable',/猫/.test(t));
await page.evaluate(()=>{const i=document.querySelector('input[type=search]');i.value='';i.dispatchEvent(new Event('input',{bubbles:true}))});
// run a session
await clickText('Today','.tabbar button');await sleep(200);
await clickText('Start practice');await sleep(300);await shot('07-session-intro');t=await txt();ok('a new word starts as a lesson card with reading, romaji and meaning shown',/New word/.test(t)&&/Got it/.test(t)&&/asked about it tomorrow/.test(t)&&!/Show answer/.test(t));
let steps=0,wrongShot=false,qShot=false;const known=new Map();let misses=0;
while(steps<200){t=await txt();if(/Session complete/.test(t))break;
 if(await clickText('Show answer')){await sleep(250);}
 else if(await clickText('Got it')){await sleep(300);}
 else{const opts=await page.$$('.opt:not([disabled])');
  if(opts.length){if(!qShot){await shot('08-question');qShot=true}
   const key=await page.evaluate(()=>(document.querySelector('.prompt')?.innerText||'')+'|'+[...document.querySelectorAll('.opt')].map(o=>o.innerText).sort().join('/'));
   const texts=await Promise.all(opts.map(o=>o.evaluate(e=>e.innerText)));
   const prompt=await page.evaluate(()=>document.querySelector('.prompt')?.innerText||'');
   const want=known.get(prompt);let idx=want?texts.findIndex(x=>x===want):(steps%3===0?0:-1);
   if(idx<0){idx=Math.floor(Math.random()*opts.length)}
   await opts[idx].click();await sleep(120);
   const good=await page.evaluate(()=>document.querySelector('.opt.good')?.innerText.replace(/ ✓$/,''));
   if(good)known.set(prompt,good);
   const wrong=/Not quite/.test(await txt());if(wrong)misses++;
   if(!wrongShot&&wrong){await shot('09-feedback-wrong');wrongShot=true}
   if(!(await clickText('Next')))await sleep(900);}
  else await sleep(150);}
 steps++}
t=await txt();ok('session reaches summary',/Session complete/.test(t),`steps=${steps}, first-try misses=${misses}`);await shot('10-summary');
const dbName='jb:'+BASE+':local';
const dump=await page.evaluate(async(n)=>{const db=await new Promise((res,rej)=>{const r=indexedDB.open(n);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});const all=(s)=>new Promise(res=>{const q=db.transaction(s).objectStore(s).getAll();q.onsuccess=()=>res(q.result)});return {attempts:await all('attempts'),states:await all('skillStates'),outbox:(await all('outbox')).length,words:(await all('words')).length}},dbName);
ok('lessons save a skill state per new word, due tomorrow, and write no answers',dump.states.length>=10&&dump.attempts.length===0&&dump.states.every(s=>s.box===0&&s.dueAt>Date.now()),`${dump.attempts.length} attempts, ${dump.states.length} states, outbox ${dump.outbox}, words ${dump.words}`);
await clickText('Done');await sleep(300);t=await txt();ok('Today updates after session',/0 new words|All done/.test(t)||!/10 new words/.test(t),t.split('\n').slice(0,6).join(' | '));await shot('11-today-after');
// unlock skills by seeding states so typed exercises can be tested
await page.evaluate(async(n)=>{const db=await new Promise(res=>{const r=indexedDB.open(n);r.onsuccess=()=>res(r.result)});const words=await new Promise(res=>{const q=db.transaction('words').objectStore('words').getAll();q.onsuccess=()=>res(q.result)});const tx=db.transaction('skillStates','readwrite');const st=tx.objectStore('skillStates');const now=Date.now();for(const w of words.filter(w=>['学生','弁護士','ニュース','雑誌'].includes(w.text))){for(const s of ['recognition','recall'])st.put({wordId:w.id,skill:s,box:3,dueAt:now-86400000,correct:3,lapses:0,introducedAt:now-5*86400000,lastAt:now-4*86400000,lastCorrect:true})}await new Promise(r=>tx.oncomplete=r)},dbName);
await page.reload({waitUntil:'networkidle0'});await page.waitForSelector('.big');
await clickText('Practice','.tabbar button');await sleep(200);
await clickText('Spelling','.row');await sleep(300);await shot('12-spelling');t=await txt();ok('spelling asks for typed Japanese, romaji not accepted',/Type it in Japanese/.test(t)&&/Romaji is not accepted/.test(t));
const prompt=await page.evaluate(()=>document.querySelector('.prompt .en')?.textContent);
const target={student:'がくせい',lawyer:'べんごし',news:'ニュース',magazine:'ざっし'}[prompt];
await page.type('input.input',target==='がくせい'?'かくせい':target==='ニュース'?'にゅーす':'x');await clickText('Check');await sleep(300);await shot('13-spelling-feedback');t=await txt();
ok('typed mistake is explained',/Not quite/.test(t)&&/Answer:/.test(t),(t.match(/Check the [^\n]+|Wrong script[^\n]*|A different[^\n]*|A character[^\n]*/)||[''])[0]);
await clickText('Next');await sleep(200);
// reading in romaji mode
await clickText('Done').catch(()=>{});
await page.evaluate(()=>{localStorage.setItem('jb:/Japanese-Book-next/:settings',JSON.stringify({readingMode:'romaji',kanaSkip:true}))});
await page.reload({waitUntil:'networkidle0'});await page.waitForSelector('.big');await clickText('Practice','.tabbar button');await sleep(150);
const rd=await clickText('Reading','.row');await sleep(300);t=await txt();ok('romaji mode offers typed romaji for reading',/romaji \(beginner mode\)/.test(t),rd+' | '+t.split('\n').slice(0,6).join(' | '));
await shot('14-romaji');const w=await page.evaluate(()=>document.querySelector('.qcard .ja')?.textContent);const rom=romajiFor(w);await page.type('input.input',rom);await sleep(100);ok('romaji mode previews the kana',/[ぁ-んー]{3,}/.test(await page.evaluate(()=>document.querySelector('form .m')?.textContent||'')),w+' '+rom);await clickText('Check');await sleep(300);ok('romaji answer is accepted for reading',/Lovely|Correct/.test(await txt()));
{const at=await page.evaluate(async(n)=>{const db=await new Promise(res=>{const r=indexedDB.open(n);r.onsuccess=()=>res(r.result)});return new Promise(res=>{const q=db.transaction('attempts').objectStore('attempts').getAll();q.onsuccess=()=>res(q.result)})},dbName);
ok('quiz answers are recorded with expected/submitted/options',at.length>=1&&at.every(a=>a.expected&&a.submitted&&a.firstTry!==undefined&&(a.options===null||Array.isArray(a.options))&&a.skill&&a.exercise&&a.appVersion&&a.deviceId),`${at.length} attempts`)}
// dark mode
await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'dark'}]);await sleep(300);await shot('15-dark-session');
await page.reload({waitUntil:'networkidle0'});await page.waitForSelector('.big');await shot('16-dark-today');
await clickText('Notebook','.tabbar button');await sleep(200);await shot('17-dark-notebook');
// offline
await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'light'}]);
const sw=await page.evaluate(async()=>{const r=await navigator.serviceWorker.ready;return !!r.active});ok('service worker is active',sw);
await sleep(500);await page.setOfflineMode(true);await page.reload({waitUntil:'load'});await page.waitForSelector('.big',{timeout:8000}).catch(()=>{});t=await txt();ok('app opens offline from cache',/Today/.test(t)&&/单|単語帳|to practise|All done/.test(t));await shot('18-offline');
ok('no console or page errors',errs.length===0,errs.slice(0,4).join(' | '));
console.log(log.join('\n'));if(log.some(l=>l.startsWith('FAIL')))process.exitCode=1;await b.close();srv.close();
