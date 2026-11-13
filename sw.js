// JS/CSS değişince sürümü artır.
const V = 'wikitube-v2';
const IMG = 'wikitube-img';
const IMG_MAX = 6000; // doğrulanmamış başlangıç değeri: önbellekte tutulan en fazla resim
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'lib.js', 'manifest.webmanifest', 'icon.svg', 'icon-180.png', 'icon-512.png', 'data/ilkyardim.json'];

self.addEventListener('install', e => e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== V && k !== IMG).map(k => caches.delete(k)))).then(() => self.clients.claim())
));

async function trim(cache) {
  const keys = await cache.keys();
  if (keys.length > IMG_MAX) await Promise.all(keys.slice(0, keys.length - IMG_MAX).map(k => cache.delete(k)));
}

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;

  // Uygulama kabuğu: önce önbellek, arkada güncelle
  if (url.origin === location.origin) {
    e.respondWith(caches.open(V).then(async c => {
      const hit = await c.match(req, { ignoreSearch: true });
      const net = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }

  // Wikimedia resimleri: önce önbellek; görülen resim de saklanır
  if (/(^|\.)wikimedia\.org$/.test(url.hostname) && req.destination === 'image') {
    e.respondWith(caches.open(IMG).then(async c => {
      const hit = await c.match(req.url);
      if (hit) return hit;
      const r = await fetch(req);
      if (r.ok && r.type !== 'opaque') { c.put(req.url, r.clone()); trim(c); }
      return r;
    }));
  }
  // Vikipedi API: uygulama kendi yönetir (ağ yoksa depoya düşer)
});
