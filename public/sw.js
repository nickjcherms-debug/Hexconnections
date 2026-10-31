// Hex Connections service worker: keeps the app usable on weak school Wi-Fi.
// Pages load from the network when possible and from the last saved copy when offline.
// API requests are never cached; boards are saved in the browser and sync when back online.
const CACHE='hx-shell-v1';
const SHELL=['/','/manifest.webmanifest','/icon.svg'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const req=e.request,url=new URL(req.url);
  if(req.method!=='GET'||url.pathname.startsWith('/api/'))return;
  if(req.mode==='navigate'){
    e.respondWith(fetch(req).then(res=>{if(res.ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put('/',copy))}return res}).catch(()=>caches.match('/')));
    return;
  }
  const lib=url.origin===self.location.origin||/^(www\.gstatic\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(url.hostname);
  if(!lib)return;
  e.respondWith(caches.match(req).then(hit=>{
    const net=fetch(req).then(res=>{if(res.ok||res.type==='opaque'){const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy))}return res});
    return hit||net;
  }));
});
