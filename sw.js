const CACHE='segamap-v15';
const APP=['./','./index.html','./manifest.webmanifest?v=17','./segamap-app-icon.svg?v=final10','./data/nlta-routes.json?v=20260815'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(APP)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;const u=new URL(e.request.url);if(u.origin!==location.origin)return;const isHTML=e.request.mode==='navigate'||e.destination==='document';if(isHTML){e.respondWith(fetch(e.request,{cache:'no-store'}).catch(()=>caches.match('./index.html')));return;}e.respondWith(caches.match(e.request).then(cached=>cached||fetch(e.request).then(r=>{if(r.ok)caches.open(CACHE).then(c=>c.put(e.request,r.clone()));return r}).catch(()=>cached)));});
