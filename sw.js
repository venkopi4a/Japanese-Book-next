const P="jb--Japanese-Book-next-";
const OLD=[];
const V=P+'ac93eb34d2';
const FILES=["./","index.html","index-B1KRLJen.js","index-CcK4ThW6.css","manifest.webmanifest","icon-180.png","icon-192.png","icon-512.png","favicon-32.png","art-banner.jpg"];
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
