// Site Yönetim Mobil — çevrim dışı önbellek
const VERSION = 'sym-v1.13.0-20261028170943';
const SHELL = ['./', 'index.html', 'app.css', 'app.js', 'qrcode.js', 'config.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== 'sym-meta').map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Uygulama dosyaları: önce ağ (güncel sürüm), ağ yoksa önbellek. API çağrıları (POST) önbelleğe alınmaz.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  // cache:'no-cache' → tarayıcının HTTP önbelleği atlanır, sunucuyla doğrulanır (değişmediyse 304, hızlı)
  const net = req.mode === 'navigate' ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(req, { cache: 'no-cache' });
  e.respondWith(
    net.then(res => {
      if (res && res.ok) { const copy = res.clone(); const u = new URL(req.url); u.search = ''; caches.open(VERSION).then(c => c.put(u.toString(), copy)); } // ?davet=… gibi parametreler ayrı önbelleklenmez
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});

// ---- v1.4.0: anlık bildirimler (site yönetimi programından gönderilir, uçtan uca şifreli) ----
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { b: e.data ? e.data.text() : '' }; }
  const title = d.t || 'Site Yönetim';
  // 2.0: cihazda birden fazla site varsa başlıkta site adı (uygulama 'sym-meta' önbelleğine yazar)
  const multi = caches.open('sym-meta').then(c => c.match('multi')).then(r => r ? r.text() : '0').catch(() => '0');
  e.waitUntil(multi.then(m => self.registration.showNotification(m === '1' && d.n ? `${d.n} · ${title}` : title, {
    body: d.b || '', icon: 'icons/icon-192.png', badge: 'icons/favicon-32.png', tag: d.tag || undefined,
    renotify: !!d.tag, data: { v: d.v || 'home', s: /^[A-Za-z0-9_-]{8,1500}$/.test(d.s || '') ? d.s : '' }, timestamp: d.ts || Date.now(),
    // 1.10.0: kapı zili — ekranda kalsın, belirgin titreşim
    ...(d.v === 'emg' ? { requireInteraction: true, vibrate: [800, 200, 800, 200, 800, 200, 1200] } : {}),
    ...(/^zil-\d+$/.test(d.v || '') ? { requireInteraction: true, vibrate: [300, 150, 300, 150, 600] } : {})
  })));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const v = (e.notification.data && e.notification.data.v) || 'home', s = (e.notification.data && e.notification.data.s) || '';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) { if ('focus' in c) { c.postMessage({ sym: 'go', v, s }); return c.focus(); } }
    return self.clients.openWindow(self.registration.scope + (s ? '?s=' + s : '') + '#' + v);
  }));
});
// Tarayıcı aboneliği kendiliğinden yenilerse uygulama bir sonraki açılışta yeniden kaydeder
self.addEventListener('pushsubscriptionchange', () => { });
