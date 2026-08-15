const CACHE='maurimove-v8';
const APP=['./','./index.html','./manifest.webmanifest','./icon.svg','./route-fix.js?v=8','./data/transit/route-57.json'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(APP)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET')return;
 const u=new URL(e.request.url);
 if(u.origin===location.origin && (u.pathname.endsWith('/')||u.pathname.endsWith('/index.html'))){
  e.respondWith(fetch(e.request).then(async r=>{
   const text=await r.clone().text();
   const patched=text.replace(/<script[^>]+src=["']\.\/route-fix(?:-v7)?\.js(?:\?[^"']*)?["'][^>]*><\/script>/gi,'').replace('</body>','<script src="./route-fix.js?v=8"></script></body>');
   const out=new Response(patched,{status:r.status,statusText:r.statusText,headers:r.headers});
   caches.open(CACHE).then(c=>c.put(e.request,out.clone()));
   return out;
  }).catch(()=>caches.match(e.request)));
  return;
 }
 e.respondWith(caches.match(e.request).then(cached=>cached||fetch(e.request).then(r=>{if(u.origin===location.origin){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy))}return r}).catch(()=>cached)));
});