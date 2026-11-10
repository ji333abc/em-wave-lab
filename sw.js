const CACHE='em-wave-lab-v1.1';
const ASSETS=['./','./index.html','./styles.css?v=1.1','./core.js?v=1.1','./app.js?v=1.1','./icon.svg','./manifest.webmanifest','./matlab/analyze_em_wave.m'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('em-wave-lab-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
  // Network first: updates on next online visit; cached shell works offline.
  event.respondWith(fetch(event.request).then(response=>{
    if(response.ok&&ASSETS.some(path=>new URL(path,self.registration.scope).href===event.request.url)){
      const copy=response.clone();event.waitUntil(caches.open(CACHE).then(c=>c.put(event.request,copy)));
    }return response;
  }).catch(()=>caches.match(event.request).then(cached=>cached||new Response('离线缓存中没有这个文件，请联网后重试。',{status:503,headers:{'Content-Type':'text/plain;charset=utf-8'}}))));
});
