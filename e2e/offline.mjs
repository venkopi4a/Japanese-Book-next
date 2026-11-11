import http from 'node:http'; import os from 'node:os'; import fs from 'node:fs'; import path from 'node:path';
import chromium from '@sparticuz/chromium'; import puppeteer from 'puppeteer-core';
const OUT=path.resolve('e2e/out');fs.mkdirSync(OUT,{recursive:true});

const BASE='/Japanese-Book-next/'; let ROOT='';
const TMP=fs.mkdtempSync(path.join(os.tmpdir(),'jb-offline-'));const SA=TMP+'/siteA',SB=TMP+'/siteB';
fs.cpSync(path.resolve(process.env.SITE_DIR||'dist'),SA,{recursive:true});fs.cpSync(SA,SB,{recursive:true});ROOT=SA;
let sw=fs.readFileSync(SB+'/sw.js','utf8');fs.writeFileSync(SB+'/sw.js',sw.replace(/const V=P\+'[0-9a-f]+'/,"const V=P+'newversion'"));
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json'};
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(!p.startsWith(BASE)){r.writeHead(404);return r.end()}p=p.slice(BASE.length)||'index.html';const f=path.join(ROOT,p);if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end()}r.writeHead(200,{'content-type':types[path.extname(f)]||'x','cache-control':'no-store'});fs.createReadStream(f).pipe(r)}).listen(4176);
const log=[];const ok=(n,c,d='')=>log.push(`${c?'PASS':'FAIL'} ${n}${d?' — '+d:''}`);
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const b=await puppeteer.launch({args:chromium.args,executablePath:await chromium.executablePath(),headless:'shell'});
const page=await b.newPage();await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
const click=async(pg,t,sel='button')=>{const h=await pg.evaluateHandle((t,sel)=>[...document.querySelectorAll(sel)].find(e=>e.textContent.trim().startsWith(t)&&!e.disabled),t,sel);const el=h.asElement();if(!el)return false;await el.click();return true};
await page.evaluateOnNewDocument(()=>{const B='jb:/Japanese-Book-next/:';if(!localStorage.getItem(B+'profiles')){localStorage.setItem(B+'profiles',JSON.stringify([{id:'local',name:'Test',colour:0}]));localStorage.setItem(B+'settings',JSON.stringify({kanaSkip:true}))}});
await page.goto('http://localhost:4176'+BASE,{waitUntil:'networkidle0'});await page.waitForSelector('.big');
await page.evaluate(()=>navigator.serviceWorker.ready);await sleep(800);
const keys1=await page.evaluate(async()=>{const o={};for(const k of await caches.keys())o[k]=(await (await caches.open(k)).keys()).map(r=>r.url.split('/').pop()||'(root)');return o});
ok('index.html is in the offline cache',Object.values(keys1).some(v=>v.includes('index.html')),JSON.stringify(keys1));
// ---- UPDATE FLOW: serve a new version, reload, expect the prompt ----
ROOT=SB;await page.reload({waitUntil:'networkidle0'});await sleep(1500);
const prompt=await page.evaluate(()=>[...document.querySelectorAll('.toast')].map(t=>t.textContent).join('|'));
ok('an update prompt appears when a new version is published',/update is ready/i.test(prompt),prompt);
await page.evaluate(()=>[...document.querySelectorAll('.toast button')].find(b=>b.textContent==='Reload')?.click());
await page.waitForNavigation({waitUntil:'networkidle0',timeout:8000}).catch(()=>{});await sleep(1200);await page.waitForSelector('.big');
const keys2=await page.evaluate(async()=>await caches.keys());
ok('after Reload the new version is active and the old cache is gone',keys2.length===1&&/newversion/.test(keys2[0]),JSON.stringify(keys2));
// ---- GENUINE OFFLINE: stop the server completely ----
srv.closeAllConnections();await new Promise(r=>srv.close(r));
for(const u of [BASE,BASE+'index.html',BASE+'?from=homescreen']){
  const p2=await b.newPage();await p2.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
  await p2.goto('http://localhost:4176'+u,{waitUntil:'load'}).catch(()=>{});await sleep(600);
  ok(`opens with the server stopped: ${u}`,await p2.evaluate(()=>!!document.querySelector('.tabbar')).catch(()=>false));
  if(u===BASE){
    await p2.waitForSelector('.big');
    ok('study works offline: a lesson is saved',await (async()=>{await click(p2,'Start practice');await sleep(300);await click(p2,'Got it');await sleep(1100);
      return p2.evaluate(async()=>{const db=await new Promise(res=>{const r=indexedDB.open('jb:/Japanese-Book-next/:local');r.onsuccess=()=>res(r.result)});const n=await new Promise(res=>{const q=db.transaction('skillStates').objectStore('skillStates').count();q.onsuccess=()=>res(q.result)});return n>=1})})());
  }
  await p2.close()}
console.log(log.join('\n'));if(log.some(l=>l.startsWith('FAIL')))process.exitCode=1;await b.close();
