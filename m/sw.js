// Site Yönetim Mobil — çevrim dışı önbellek
const VERSION = 'sym-v1.3.0-202610241008';
const SHELL = ['./', 'index.html', 'app.css', 'app.js', 'config.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Uygulama dosyaları: önce ağ (güncel sürüm), ağ yoksa önbellek. API çağrıları (POST) önbelleğe alınmaz.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res && res.ok) { const copy = res.clone(); const u = new URL(req.url); u.search = ''; caches.open(VERSION).then(c => c.put(u.toString(), copy)); } // ?davet=… gibi parametreler ayrı önbelleklenmez
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});
