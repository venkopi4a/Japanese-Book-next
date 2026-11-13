import { createHash } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import type { Plugin } from 'vite';

/** Writes sw.js: it precaches every built file so the app opens offline, and drops old caches on update. */
function offlineWorker(): Plugin {
  let base = '/';
  return {
    name: 'jb-offline-worker',
    apply: 'build',
    configResolved(c) { base = c.base; },
    generateBundle(_o, bundle) {
      const files = ['./', 'index.html', ...Object.keys(bundle).filter((f) => f !== 'index.html'), 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'favicon-32.png', 'art-banner.jpg',
        // the app's own voice recordings, so pronunciation works offline too
        ...(existsSync('public/audio') ? readdirSync('public/audio').filter((f) => f.endsWith('.m4a')).sort().map((f) => `audio/${f}`) : [])];
      const version = createHash('sha1').update(files.join('|')).digest('hex').slice(0, 10);
      // Caches are shared by every site on the same address, so this worker only ever touches caches that start with its own prefix.
      // At the final switch-over, VITE_LEGACY_CACHES (comma-separated prefixes) lets the live build retire the old app's cache on purpose.
      const prefix = 'jb-' + base.replace(/[^a-z0-9]+/gi, '-');
      const legacy = (process.env.VITE_LEGACY_CACHES ?? '').split(',').filter(Boolean);
      const source = `const P=${JSON.stringify(prefix)};
const OLD=${JSON.stringify(legacy)};
const V=P+'${version}';
const FILES=${JSON.stringify(files)};
const url=(f)=>new URL(f,self.registration.scope).href;
self.addEventListener('install',(e)=>{e.waitUntil(caches.open(V).then((c)=>c.addAll(FILES.map(url))))});
self.addEventListener('message',(e)=>{if(e.data==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('activate',(e)=>{e.waitUntil(caches.keys().then((k)=>Promise.all(k.filter((x)=>x!==V&&(x.startsWith(P)||OLD.some((o)=>x.startsWith(o)))).map((x)=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',(e)=>{
  const r=e.request;
  if(r.method!=='GET'||new URL(r.url).origin!==location.origin)return;
  if(r.mode==='navigate'){e.respondWith(caches.match(url('index.html')).then((m)=>m||fetch(r)));return}
  e.respondWith(caches.match(r).then((m)=>m||fetch(r)));
});
`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

// The base path must match the address the app is published at,
// for example /Japanese-Book-next/ for a preview or /Japanese-Book/ for the live site.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  build: { assetsDir: '' }, // every built file sits in one flat folder, so uploads on the GitHub website are simple
  plugins: [preact(), offlineWorker()],
  test: { environment: 'node', setupFiles: ['tests/setup.ts'] },
});
