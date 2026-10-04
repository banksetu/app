import fs from 'node:fs';import crypto from 'node:crypto';
const assets=fs.readdirSync('dist/assets').map(name=>'/assets/'+name);
const files=['/index.html',...assets];
const hash=crypto.createHash('sha256').update(fs.readFileSync('dist/index.html')).digest('hex').slice(0,16);
fs.writeFileSync('dist/sw.js',`
const CACHE='banksetu-shell-${hash}';
const FILES=${JSON.stringify(files)};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES))));
self.addEventListener('message',event=>{if(event.data==='ACTIVATE_UPDATE')self.skipWaiting();});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('banksetu-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
 if(event.request.mode==='navigate')event.respondWith(fetch(event.request).catch(()=>caches.match('/index.html')));
 else if(FILES.includes(url.pathname))event.respondWith(caches.match(url.pathname).then(hit=>hit||fetch(event.request)));
});
`);
