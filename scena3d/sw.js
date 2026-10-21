// Mathemagic – service worker: appka sa dá nainštalovať a spustí sa aj bez siete.
// Vždy najprv sieť (nová verzia hneď), z vyrovnávacej pamäte len keď sieť nejde.
const C = 'mathemagic-v2';
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // vlastné súbory hry: vždy over u servera (cache: 'no-cache'), inak by prehliadač podsunul starú verziu z HTTP cache
  const own = new URL(e.request.url).origin === location.origin;
  const req = own && e.request.mode !== 'navigate' ? new Request(e.request, { cache: 'no-cache' }) : e.request;
  e.respondWith(fetch(own && e.request.mode === 'navigate' ? new Request(e.request.url, { cache: 'no-cache', credentials: 'include' }) : req).then(r => {
    if (r.ok && (r.type === 'basic' || r.type === 'cors')) { const c = r.clone(); caches.open(C).then(k => k.put(e.request, c)); }
    return r;
  }).catch(() => caches.match(e.request)));
});
