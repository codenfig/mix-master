// Cache only the application shell. Never cache uploaded music or generated mixes.
self.addEventListener('install',event=>event.waitUntil(caches.open('mixmaster-shell-v1').then(cache=>cache.addAll(['/','/static/manifest.webmanifest']))));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).pathname.startsWith('/api/'))return;event.respondWith(fetch(event.request).catch(()=>caches.match(event.request)))});
