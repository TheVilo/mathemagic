// Mathemagic – service worker: appka sa dá nainštalovať a spustí sa aj bez siete.
// Vždy najprv sieť (nová verzia hneď), z vyrovnávacej pamäte len keď sieť nejde.
const C = 'mathemagic-v1';
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok && (r.type === 'basic' || r.type === 'cors')) { const c = r.clone(); caches.open(C).then(k => k.put(e.request, c)); }
    return r;
  }).catch(() => caches.match(e.request)));
});
