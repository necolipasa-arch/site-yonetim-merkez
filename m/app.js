/* =====================================================================
   SİTE YÖNETİM MOBİL — sakin uygulaması (PWA)
   Bağımlılık yok. Tüm veri, Supabase üzerindeki güvenli fonksiyonlardan
   (member_*) gelir; her sakin yalnızca kendi dairesinin verisini görür.
   ===================================================================== */
'use strict';

const APP_VERSION = '1.8.2';
const APP_BUILD = '20261025201956';   // merkezi yayında dev/build-central-mobile.js yayın damgasını yazar (version.json ile karşılaştırılır)
// ---------------- site bağlantı ayarları ----------------
// Kendi adresinde yayınlanan pakette ayarlar config.js içindedir. Merkezi uygulamada (config.js boş, central:true)
// ayarlar davet linkindeki "s" parametresiyle gelir ve bu cihazda saklanır.
function b64uEnc(str) { const b = new TextEncoder().encode(str); let x = ''; b.forEach(c => { x += String.fromCharCode(c); }); return btoa(x).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function parseSiteParam(v) {
  try {
    v = String(v || '').trim().replace(/-/g, '+').replace(/_/g, '/'); while (v.length % 4) v += '=';
    const bin = atob(v); const o = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))));
    // 1.8.0 (masaüstü 2.2): Neon kısa biçimi — nu: veri arayüzü sunucusu, nf: ödeme fonksiyonu sunucusu (.aws.neon.tech eklenir).
    // Anahtar linkte taşınmaz; açılışta fonksiyondan (/anahtar) alınır ve bu cihazda saklanır.
    const nu = /^ep-[a-z0-9-]+\.apirest\.[a-z0-9.-]+$/i.test(o.nu || '') ? String(o.nu).toLowerCase() : '';
    const nf = /^br-[a-z0-9-]+-odeme\.compute\.[a-z0-9.-]+$/i.test(o.nf || '') ? String(o.nf).toLowerCase() : '';
    const url = o.r ? `https://${String(o.r).toLowerCase().replace(/[^a-z0-9]/g, '')}.supabase.co` : nu ? `https://${nu}.aws.neon.tech/neondb` : String(o.u || '');
    const neon = /^https:\/\/[a-z0-9.-]+\.neon\.tech\/[a-z0-9_]+$/i.test(url.replace(/\/+$/, ''));   // 2.2: Neon Data API (veritabanı yolu ile)
    const local = location.hostname === 'localhost';
    const okUrl = neon || /^https:\/\/[^/\s]+$/i.test(url.replace(/\/+$/, '')) || (local && /^http:\/\/localhost(:\d+)?$/.test(url));   // http yalnızca yerel test
    const f = nf ? `https://${nf}.aws.neon.tech` : (/^https:\/\/[^/\s]+(\/[^\s]*)?$/i.test(o.f || '') || (local && /^http:\/\/localhost(:\d+)?\//.test(o.f || ''))) ? String(o.f).replace(/\/+$/, '') : '';
    const u = url.replace(/\/+$/, '');
    let k = String(o.k || '');
    if (!k && f) { try { k = localStorage.getItem('sym_k@' + u) || ''; } catch { } }
    if (!okUrl || (!k && !f) || k.length > (neon ? 1200 : 400)) return null;
    return { u, k, f, n: String(o.n || '').slice(0, 80), raw: b64uEnc(JSON.stringify(o)) };
  } catch { return null; }
}
function siteParamFromText(t) {
  const m = /[?&#]s=([A-Za-z0-9_\-]+)/.exec(String(t || ''));
  return m ? parseSiteParam(m[1]) : null;
}
// 2.0: birden fazla sitede kayıtlı sakin — bu cihazda giriş yapılmış siteler arasında geçiş.
// Liste: sym_sites [{u,k,n,raw}], her sitenin oturumu sym_tok@<u>, önbelleği sym_cache@<u>. Aktif site sym_site / sym_token / sym_cache.
const MSites = {
  list() { try { const l = JSON.parse(localStorage.getItem('sym_sites') || '[]'); return Array.isArray(l) ? l.filter(x => x && x.u && x.k && x.raw) : []; } catch { return []; } },
  save(l) {
    try { localStorage.setItem('sym_sites', JSON.stringify(l.slice(-12))); } catch { }
    // bildirim başlığına site adı eklensin mi (hizmet çalışanı okur)
    try { const n = l.filter(x => localStorage.getItem(this.tk(x.u))).length; caches.open('sym-meta').then(c => c.put('multi', new Response(n > 1 ? '1' : '0'))).catch(() => { }); } catch { }
  },
  tk(u) { return 'sym_tok@' + u; },
  ck(u) { return 'sym_cache@' + u; },
  stash(site) {   // aktif sitenin oturumunu kendi yuvasına yaz (siteden ayrılırken)
    if (!site || !site.u) return;
    const t = localStorage.getItem('sym_token'), c = localStorage.getItem('sym_cache');
    if (!t) return;
    localStorage.setItem(this.tk(site.u), t);
    try { if (c) localStorage.setItem(this.ck(site.u), c); } catch { localStorage.removeItem(this.ck(site.u)); }
  },
  restore(u) {    // hedef sitenin oturumunu aktif yap (yoksa giriş ekranı)
    const t = localStorage.getItem(this.tk(u)), c = localStorage.getItem(this.ck(u));
    if (t) localStorage.setItem('sym_token', t); else localStorage.removeItem('sym_token');
    try { if (t && c) localStorage.setItem('sym_cache', c); else localStorage.removeItem('sym_cache'); } catch { localStorage.removeItem('sym_cache'); }
  },
  upsert(site, name, token, unit) {
    if (!site || !site.u || !site.raw) return;
    const l = this.list(), i = l.findIndex(x => x.u === site.u), v = { u: site.u, k: site.k, f: site.f || '', n: String(name || site.n || '').slice(0, 80), raw: site.raw, d: String(unit || '').slice(0, 60), y: site.y || '' };
    if (i >= 0) { if (l[i].n === v.n && l[i].raw === v.raw && l[i].k === v.k && l[i].d === v.d && (l[i].f || '') === v.f && (l[i].y || '') === v.y) { if (token) localStorage.setItem(this.tk(site.u), token); return; } l[i] = v; } else l.push(v);
    if (token) localStorage.setItem(this.tk(site.u), token);
    this.save(l);
  },
  remove(u) { this.save(this.list().filter(x => x.u !== u)); localStorage.removeItem(this.tk(u)); localStorage.removeItem(this.ck(u)); },
  others(u) { return this.list().filter(x => x.u !== u && localStorage.getItem(this.tk(x.u))); }
};
// 1.8.1: kısa davet linkleri — …/m/?d=KOD (davet kodu) ve …/m/?y=KIMLIK (sitenin kısa kimliği). Site bağlantı bilgisi
// linkte taşınmaz; açılışta lisans sunucusundaki davet dizininden alınır (SITE_CONFIG.dir) ve bu cihazda saklanır.
const dirNorm = (v) => String(v || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
const DIR_PENDING = (function () {
  if (!(window.SITE_CONFIG || {}).central) return null;
  try {
    const qs = new URLSearchParams(location.search);
    if (qs.get('s')) return null;
    try { if (sessionStorage.getItem('sym_dirdone') === location.search) return null; } catch { }   // yeniden yükleme döngüsüne karşı
    const d = dirNorm(qs.get('d')), y = dirNorm(qs.get('y'));
    if (d.length >= 6 && d.length <= 24) return { t: 'D', v: d };
    if (y.length >= 6 && y.length <= 24) {
      let saved = null; try { saved = JSON.parse(localStorage.getItem('sym_site') || 'null'); } catch { }
      if (saved && saved.y === y) return null;
      const known = MSites.list().find(x => x.y === y);   // bu cihazda kayıtlı başka site
      if (known) {
        if (saved && saved.u !== known.u) { MSites.stash(saved); MSites.restore(known.u); }
        localStorage.setItem('sym_site', JSON.stringify({ u: known.u, k: known.k, f: known.f || '', n: known.n, raw: known.raw, y }));
        return null;
      }
      return { t: 'S', v: y };
    }
  } catch { }
  return null;
})();
// Site adres sorgusu: kısa kimlik varsa ?y=…, yoksa (eski davetler) ?s=…
const siteQuery = (site) => site && site.y ? '?y=' + site.y : site && site.raw ? '?s=' + site.raw : '';
async function dirResolve(p) {
  const dir = (window.SITE_CONFIG || {}).dir || {};
  if (!dir.u) { const e = new Error('Bu uygulamada davet dizini tanımlı değil.'); e.code = 'NODIR'; throw e; }
  const k = String(dir.k || '');
  let r;
  try {
    r = await fetch(String(dir.u).replace(/\/+$/, '') + '/rest/v1/rpc/lic_dizin_coz', {
      method: 'POST', cache: 'no-store', body: JSON.stringify({ p_tur: p.t, p_deger: p.v }),
      headers: Object.assign({ 'Content-Type': 'application/json', apikey: k }, /^eyJ/.test(k) ? { Authorization: 'Bearer ' + k } : {})
    });
  } catch (e) { const er = new Error('Davet bilgisi alınamadı. İnternet bağlantınızı kontrol edin.'); er.net = true; throw er; }
  const d = await r.json().catch(() => null);
  if (!r.ok || !d) { const er = new Error('Davet bilgisi alınamadı (' + r.status + ').'); er.net = r.status >= 500 || r.status === 0; throw er; }
  if (d.error) { const er = new Error(d.error); er.code = d.code || 'ERR'; throw er; }
  const site = parseSiteParam(d.cfg);
  if (!site) { const er = new Error('Site bağlantı bilgisi okunamadı.'); er.code = 'CFG'; throw er; }
  const y = p.t === 'S' ? p.v : dirNorm(d.y);
  if (y.length >= 6 && y.length <= 24) site.y = y;
  let saved = null; try { saved = JSON.parse(localStorage.getItem('sym_site') || 'null'); } catch { }
  if (saved && saved.u !== site.u) { MSites.stash(saved); MSites.restore(site.u); }
  if (saved && saved.u === site.u && !site.k && saved.k) site.k = saved.k;
  localStorage.setItem('sym_site', JSON.stringify(site));
  const q = siteQuery(site) + (p.t === 'D' ? '&davet=' + p.v : '');
  try { sessionStorage.setItem('sym_dirdone', q); } catch { }
  if (location.search === q) location.reload();   // aynı adres (yalnızca #… farkı yeniden yüklemez)
  else location.replace(location.pathname + q + (p.t === 'S' ? location.hash : ''));
}
const CFG = (function resolveConfig() {
  const raw = window.SITE_CONFIG || {};
  if (raw.anonKey && !raw.central) return raw;
  let fromUrl = null;
  try { fromUrl = siteParamFromText(location.search) || siteParamFromText(location.hash); } catch { }
  let saved = null; try { saved = JSON.parse(localStorage.getItem('sym_site') || 'null'); } catch { }
  if (fromUrl) {
    if (saved && saved.u !== fromUrl.u) { MSites.stash(saved); MSites.restore(fromUrl.u); }   // başka siteye geçildi: eski sitenin oturumu saklanır
    localStorage.setItem('sym_site', JSON.stringify(fromUrl)); saved = fromUrl;
  }
  if (saved && saved.u && !saved.k && saved.f) {   // 1.8.0: anahtar fonksiyondan alınacak (start → resolveKey)
    let k = ''; try { k = localStorage.getItem('sym_k@' + saved.u) || ''; } catch { }
    if (k) { saved.k = k; localStorage.setItem('sym_site', JSON.stringify(saved)); }
    else return { ...raw, central: true, url: saved.u, anonKey: '', fnUrl: saved.f, needKey: true, siteName: saved.n || '', siteRaw: saved.raw, siteY: saved.y || '' };
  }
  if (!saved || !saved.u || !saved.k) return { ...raw, central: true, anonKey: '' };
  return { ...raw, central: true, url: saved.u, anonKey: saved.k, fnUrl: saved.f || '', siteName: saved.n || raw.siteName || '', siteRaw: saved.raw, siteY: saved.y || '' };
})();
// Sunucu adresini sadeleştir (https://xxxx.supabase.co) — yol, boşluk, http vb. hatalara karşı
function normBase(u) {
  u = String(u || '').trim().replace(/\s+/g, '');
  if (!u) return location.origin;
  const dash = /supabase\.com\/dashboard\/project\/([a-z0-9]{10,})/i.exec(u);
  if (dash) return `https://${dash[1].toLowerCase()}.supabase.co`;
  if (!/^[a-z]+:\/\//i.test(u)) u = 'https://' + u;
  try {
    const x = new URL(u);
    if (/\.supabase\.co$/i.test(x.hostname)) return 'https://' + x.hostname.toLowerCase();
    // Neon Data API (2.2): veritabanı yolu korunur (https://ep-….apirest.<bölge>.aws.neon.tech/neondb)
    if (/\.neon\.tech$/i.test(x.hostname)) return 'https://' + x.hostname.toLowerCase() + '/' + ((x.pathname.replace(/\/rest\/v1\/?.*$/i, '').split('/').filter(Boolean)[0]) || 'neondb');
    return x.origin;
  }
  catch { return u.replace(/\/+$/, ''); }
}
const BASE = normBase(CFG.url);
let API_KEY = String(CFG.anonKey || '').trim().replace(/\s+/g, '');
// Ödeme fonksiyonu: Neon'da kendi adresi var; Supabase'te proje adresi + /functions/v1/odeme
const FN_BASE = () => (CFG.fnUrl || window.SITE_CONFIG && window.SITE_CONFIG.fnUrl || '').replace(/\/+$/, '') || `${BASE}/functions/v1/odeme`;
const authHeaders = () => Object.assign({ apikey: API_KEY }, /^eyJ/.test(API_KEY) ? { Authorization: 'Bearer ' + API_KEY } : {});
// 1.8.0: Neon sitesinin herkese açık anahtarını fonksiyondan al (davet linkinde taşınmaz)
async function resolveKey() {
  const r = await fetch(CFG.fnUrl + '/anahtar', { cache: 'no-store' });
  const d = await r.json().catch(() => null);
  const k = d && String(d.k || '');
  if (!r.ok || !/^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(k || '') || k.length > 1200) throw new Error('Site bağlantı anahtarı alınamadı (' + r.status + ').');
  try { localStorage.setItem('sym_k@' + CFG.url, k); } catch { }
  const saved = JSON.parse(localStorage.getItem('sym_site') || 'null');
  if (saved && saved.u === CFG.url) { saved.k = k; localStorage.setItem('sym_site', JSON.stringify(saved)); }
  CFG.anonKey = k; CFG.needKey = false; API_KEY = k;
}
// Bağlantı tanılama: güvenlik politikası engelleri
const NET = { csp: null, lastErr: null };
document.addEventListener('securitypolicyviolation', (e) => { if (/connect-src/.test(e.violatedDirective || e.effectiveDirective || '')) NET.csp = e.blockedURI || 'engellendi'; });

// ---------------- yardımcılar ----------------
const $ = (s, r = document) => r.querySelector(s);
const esc = (v) => v == null ? '' : String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MON = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const MON3 = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const DAY3 = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
const pad = (n) => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const nowTime = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const toMin = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
const fromMin = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const fmt = {
  money(n) { return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 2 }).format(Number(n) || 0); },
  date(s) { if (!s) return ''; const [y, m, d] = String(s).slice(0, 10).split('-'); return y && m && d ? `${Number(d)} ${MON3[Number(m) - 1]} ${y}` : s; },
  dshort(s) { if (!s) return ''; const [, m, d] = String(s).slice(0, 10).split('-'); return `${Number(d)} ${MON3[Number(m) - 1]}`; },
  dt(s) { if (!s) return ''; const t = String(s).slice(11, 16); return fmt.date(s) + (t ? ' ' + t : ''); },
  period(p) { if (!p) return ''; const [y, m] = String(p).split('-'); return `${MON[Number(m) - 1] || m} ${y}`; },
  month(s) { const [y, m] = String(s).slice(0, 7).split('-'); return `${MON[Number(m) - 1]} ${y}`; },
  rel(s) { const d = String(s).slice(0, 10); if (d === today()) return 'Bugün'; if (d === addDays(today(), 1)) return 'Yarın'; if (d === addDays(today(), -1)) return 'Dün'; return fmt.date(d); },
  phone(p) { const d = String(p || '').replace(/\D/g, '').replace(/^90/, '').replace(/^0/, ''); return d.length === 10 ? `0${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 8)} ${d.slice(8)}` : (p || ''); }
};

const P = {
  home: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
  wallet: 'M21 18v1c0 1.1-.9 2-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h14c1.1 0 2 .9 2 2v1h-9a2 2 0 00-2 2v8a2 2 0 002 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z',
  wrench: 'M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z',
  calendar: 'M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19a2 2 0 002 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z',
  grid: 'M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z',
  megaphone: 'M18 11v2h4v-2h-4zm-2 6.61c.96.71 2.21 1.65 3.2 2.39.4-.53.8-1.07 1.2-1.6-.99-.74-2.24-1.68-3.2-2.4-.4.54-.8 1.08-1.2 1.61zM20.4 5.6c-.4-.53-.8-1.07-1.2-1.6-.99.74-2.24 1.68-3.2 2.4.4.53.8 1.07 1.2 1.6.96-.72 2.21-1.65 3.2-2.4zM4 9c-1.1 0-2 .9-2 2v2c0 1.1.9 2 2 2h1v4h2v-4h1l5 3V6L8 9H4zm11.5 3c0-1.33-.58-2.53-1.5-3.35v6.69c.92-.81 1.5-2.01 1.5-3.34z',
  package: 'M20 2H4c-1 0-2 .9-2 2v3.01c0 .72.43 1.34 1 1.69V20c0 1.1 1.1 2 2 2h14c.9 0 2-.9 2-2V8.7c.57-.35 1-.97 1-1.69V4c0-1.1-1-2-2-2zm-5 12H9v-2h6v2zm5-7H4V4l16-.02V7z',
  guest: 'M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
  gavel: 'M1 21h12v2H1zM5.245 8.07l2.83-2.827 14.14 14.142-2.828 2.828zM12.317 1l5.657 5.656-2.83 2.83-5.654-5.66zM3.825 9.485l5.657 5.657-2.828 2.828-5.657-5.657z',
  phone: 'M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z',
  user: 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
  logout: 'M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z',
  refresh: 'M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z',
  back: 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z',
  plus: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
  check: 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
  close: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
  copy: 'M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z',
  chev: 'M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z',
  eye: 'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z',
  alert: 'M11 15h2v2h-2zm0-8h2v6h-2zm.99-5C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z',
  receipt: 'M18 17H6v-2h12v2zm0-4H6v-2h12v2zm0-4H6V7h12v2zM3 22l1.5-1.5L6 22l1.5-1.5L9 22l1.5-1.5L12 22l1.5-1.5L15 22l1.5-1.5L18 22l1.5-1.5L21 22V2l-1.5 1.5L18 2l-1.5 1.5L15 2l-1.5 1.5L12 2l-1.5 1.5L9 2 7.5 3.5 6 2 4.5 3.5 3 2v20z',
  cash: 'M19 14V6c0-1.1-.9-2-2-2H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zm-9-1c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm13-6v11c0 1.1-.9 2-2 2H4v-2h17V7h2z',
  download: 'M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z',
  lock: 'M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z',
  building: 'M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V9h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V9h2v2zm0-4H8V5h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10zm-2-8h-2v2h2v-2zm0 4h-2v2h2v-2z',
  bell: 'M12 22c1.1 0 2-.9 2-2h-4a2 2 0 002 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4a1.5 1.5 0 00-3 0v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z',
  shield: 'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z',
  qr: 'M3 11h8V3H3v8zm2-6h4v4H5V5zM3 21h8v-8H3v8zm2-6h4v4H5v-4zM13 3v8h8V3h-8zm6 6h-4V5h4v4zM13 13h2v2h-2zM15 15h2v2h-2zM13 17h2v2h-2zM17 17h2v2h-2zM19 19h2v2h-2zM15 19h2v2h-2zM17 13h2v2h-2zM19 15h2v2h-2z',
  share: 'M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z',
  clock: 'M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z',
  card: 'M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z',
  poll: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z',
  info: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z',
  trash: 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
};
const blk = (b) => !b ? '' : /blok/i.test(b) ? b : b + ' Blok';
const unitName = (u) => u && u.no ? `${blk(u.block)} · Daire ${u.no}` : '';
const ic = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${P[n] || ''}"/></svg>`;
const STATUS_COLOR = {
  'Gönderildi': 'purple', 'Açık': 'orange', 'İşlemde': 'blue', 'Beklemede': 'gray', 'Çözüldü': 'green', 'İptal': 'gray',
  'Onay Bekliyor': 'orange', 'Onaylandı': 'green', 'Bekleniyor': 'blue', 'Geldi': 'green', 'Gelmedi': 'gray',
  'Planlandı': 'blue', 'Yapıldı': 'green', 'Ertelendi': 'orange'
};
const badge = (t, c) => t ? `<span class="badge ${c || STATUS_COLOR[t] || 'blue'}">${esc(t)}</span>` : '';

function toast(msg, type = 'ok') {
  const t = document.createElement('div');
  t.className = 'toast ' + (type === 'error' ? 'error' : '');
  t.textContent = msg;
  $('#toast-root').appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 250); }, type === 'error' ? 4200 : 2800);
}

const Sheet = {
  open(html, onOpen) {
    this.close();
    const w = document.createElement('div');
    w.className = 'sheet-wrap';
    w.innerHTML = `<div class="sheet" role="dialog"><div class="grab"></div>${html}</div>`;
    w.addEventListener('click', (e) => { if (e.target === w || e.target.closest('[data-close]')) this.close(); });
    $('#sheet-root').appendChild(w);
    document.body.style.overflow = 'hidden';
    if (onOpen) onOpen(w.querySelector('.sheet'));
    return w.querySelector('.sheet');
  },
  close() { $('#sheet-root').innerHTML = ''; document.body.style.overflow = ''; }
};

async function copyText(t, okMsg) {
  try { await navigator.clipboard.writeText(t); toast(okMsg || 'Kopyalandı'); }
  catch { const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); document.execCommand('copy'); a.remove(); toast(okMsg || 'Kopyalandı'); }
}

// ---------------- API ----------------
async function rpc(fn, args) {
  let res;
  try {
    res = await fetch(`${BASE}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: Object.assign({ apikey: API_KEY, 'Content-Type': 'application/json' }, /^eyJ/.test(API_KEY) ? { Authorization: 'Bearer ' + API_KEY } : {}),
      body: JSON.stringify(args || {})
    });
  } catch (e) {
    const er = new Error(navigator.onLine === false ? 'İnternet bağlantısı yok.' : 'Sunucuya ulaşılamadı.');
    er.offline = true; er.raw = String(e && e.message || e); NET.lastErr = er.raw; throw er;
  }
  let data = null; try { data = await res.json(); } catch { }
  if (!res.ok) throw new Error((data && data.message) ? 'Sunucu hatası: ' + data.message : 'Sunucu hatası (' + res.status + ')');
  if (data && data.error) { const er = new Error(data.error); er.code = data.code; throw er; }
  return data;
}
async function call(fn, args) {
  try { return await rpc(fn, { p_token: S.token, ...(args || {}) }); }
  catch (e) { if (e.code === 'SESSION') { forceLogout(e.message); } throw e; }
}

// ---------------- eski adresten taşınma (v1.4.1) ----------------
// Netlify vb. kendi adresinde yayınlanmış eski uygulamanın yerine konan yönlendirme paketi, kullanıcıyı
// oturumuyla birlikte merkezi uygulamaya gönderir: …/m/?s=<site>#oturum=<jeton>. Jeton adres çubuğundan hemen silinir.
(function takeOverSession() {
  const m = /[#&]oturum=([A-Za-z0-9_\-]{16,200})/.exec(location.hash || '');
  if (!m) return;
  try {
    if (CFG.anonKey && !localStorage.getItem('sym_token')) { localStorage.setItem('sym_token', m[1]); localStorage.removeItem('sym_cache'); }
    sessionStorage.setItem('sym_viaold', '1');   // eski (Netlify) simgeden açıldı → bildirim kartında yeni simge önerilir
  } catch { }
  history.replaceState(null, '', location.pathname + location.search);
})();

// ---------------- durum ----------------
const S = {
  token: localStorage.getItem('sym_token'),
  data: null, at: null,
  view: 'home', offline: false, loading: false,
  installEvt: null,
  authTab: 'login',
  invite: null, // davet linkiyle gelindiyse: { code, loading, info, err, errCode }
  acctFilter: 'all',
  rsv: { fac: null, date: today(), a: null, b: null }
};
try { const c = JSON.parse(localStorage.getItem('sym_cache') || 'null'); if (c && S.token) { S.data = c.d; S.at = c.at; } } catch { }

const TABS = [
  { k: 'home', label: 'Ana Sayfa', icon: 'home' },
  { k: 'account', label: 'Hesabım', icon: 'wallet' },
  { k: 'requests', label: 'Talepler', icon: 'wrench' },
  { k: 'reserve', label: 'Rezervasyon', icon: 'calendar' },
  { k: 'more', label: 'Diğer', icon: 'grid' }
];
const PAY_TAB = { k: 'pay', label: 'Kartla Öde', icon: 'card' };
// 1.6.0: kartla ödeme açıksa alt çubukta "Kartla Öde" sekmesi (1.6.1: diğer sekmelerle aynı görünüm)
function navTabs() { return payOn() ? [TABS[0], TABS[1], PAY_TAB, TABS[2], TABS[3], TABS[4]] : TABS; }
function isTab(v) { return TABS.some(t => t.k === v) || v === 'pay'; }
const SUB = {
  ann: { title: 'Duyurular', parent: 'more' }, cargo: { title: 'Kargolarım', parent: 'more' }, visitors: { title: 'Ziyaretçi Bildirimi', parent: 'more' },
  meetings: { title: 'Toplantılar & Kararlar', parent: 'more' }, polls: { title: 'Anketler', parent: 'more' }, contacts: { title: 'Önemli Telefonlar', parent: 'more' }, profile: { title: 'Profil & Ayarlar', parent: 'more' }
};

async function refresh(silent) {
  if (!S.token || S.loading) return;
  S.loading = true; setRefreshing(true);
  try {
    const d = await call('member_data');
    S.data = d; S.at = new Date().toISOString(); S.offline = false;
    try { localStorage.setItem('sym_cache', JSON.stringify({ d, at: S.at })); } catch { }
    if (CFG.central && CFG.siteRaw) MSites.upsert(curSite(), d.site && d.site.site_name, S.token, d.unit ? unitName(d.unit) : '');
    if (document.querySelector('main input:focus')) S.renderLater = true; else render();
    kvkkCheck(); Push.heal(); Setup.autoPush(); Setup.maybeShow();
    if (!silent) toast('Bilgiler güncellendi');
  } catch (e) {
    if (e.offline) { S.offline = true; render(); if (!silent) toast(e.message, 'error'); }
    else if (e.code !== 'SESSION') toast(e.message, 'error');
  } finally { S.loading = false; setRefreshing(false); }
}
function setRefreshing(on) { const b = $('[data-act=refresh]'); if (b) b.classList.toggle('spin', on); }

// ---------------- yönlendirme ----------------
function go(view, replace) {
  if (view === S.view) return;
  S.view = view;
  if (replace) history.replaceState({ view }, '', '#' + view); else history.pushState({ view }, '', '#' + view);
  render(); window.scrollTo(0, 0);
}
window.addEventListener('popstate', (e) => {
  if ($('.sheet-wrap')) { Sheet.close(); history.pushState({ view: S.view }, '', '#' + S.view); return; }
  S.view = (e.state && e.state.view) || 'home'; render(); window.scrollTo(0, 0);
});

// ---------------- çizim ----------------
function render() {
  const app = $('#app');
  if (S.dirBusy || S.dirNetErr) {   // 1.8.1 kısa davet linki çözülüyor
    app.innerHTML = S.dirNetErr
      ? `<div class="boot"><img src="icons/icon-192.png" alt=""><p><b>Davet bilgisi alınamadı</b></p><p class="muted small">${esc(S.dirNetErr)}</p><button class="btn primary" data-keyretry>Tekrar Dene</button></div>`
      : `<div class="boot"><img src="icons/icon-192.png" alt=""><div class="spinner"></div><p class="muted">Davetiniz açılıyor…</p></div>`;
    const b = app.querySelector('[data-keyretry]'); if (b) b.onclick = () => location.reload();
    return;
  }
  if (CFG.needKey) {
    app.innerHTML = S.keyErr
      ? `<div class="boot"><img src="icons/icon-192.png" alt=""><p><b>Siteye bağlanılamadı</b></p><p class="muted small">${esc(S.keyErr)}<br>İnternet bağlantınızı kontrol edip tekrar deneyin.</p><button class="btn primary" data-keyretry>Tekrar Dene</button></div>`
      : `<div class="boot"><img src="icons/icon-192.png" alt=""><div class="spinner"></div><p class="muted">Siteye bağlanılıyor…</p></div>`;
    const b = app.querySelector('[data-keyretry]'); if (b) b.onclick = () => location.reload();
    return;
  }
  if (!CFG.anonKey) { app.innerHTML = notConfigured(); bindConnect(); return; }
  if (!S.token) { app.innerHTML = authView(); bindAuth(); return; }
  if (!S.data) { app.innerHTML = `<div class="boot"><img src="icons/icon-192.png" alt=""><div class="spinner"></div><p class="muted">Bilgileriniz yükleniyor…</p></div>`; return; }
  const sub = SUB[S.view];
  const activeTab = sub ? sub.parent : S.view;
  const d = S.data, u = d.unit || {};
  const siteName = (d.site && d.site.site_name) || CFG.siteName || 'Site Yönetim';
  const views = { home: homeView, account: accountView, pay: payView, requests: requestsView, reserve: reserveView, more: moreView, ann: annView, cargo: cargoView, visitors: visitorsView, meetings: meetingsView, polls: pollsView, contacts: contactsView, profile: profileView };
  const waitingCargo = (d.cargo || []).filter(c => !c.delivered_at).length;
  app.innerHTML = `
    <header class="topbar">
      ${sub ? `<button class="tb-btn" data-act="back" aria-label="Geri">${ic('back')}</button><h1>${esc(sub.title)}</h1>`
      : CFG.central && MSites.others(CFG.url).length ? `<h1 class="site-sw" data-act="sites" role="button" aria-label="Siteyi değiştir">${esc(siteName)} <span class="sw-caret">▾</span><small>${esc(unitName(u))}</small></h1>` : `<h1>${esc(siteName)}<small>${esc(unitName(u))}</small></h1>`}
      <button class="tb-btn ${S.loading ? 'spin' : ''}" data-act="refresh" aria-label="Yenile">${ic('refresh')}</button>
    </header>
    ${S.offline ? `<div class="offline-bar">Çevrim dışı — son güncelleme: ${esc(S.at ? fmt.dt(localTs(S.at)) : '—')}</div>` : ''}
    <main class="content">${(views[S.view] || homeView)()}</main>
    <nav class="bottom-nav">${navTabs().map(t => `<button class="${t.k === 'pay' ? 'pay-tab ' : ''}${activeTab === t.k ? 'on' : ''}" data-tab="${t.k}">${ic(t.icon)}<span>${t.label}</span>${t.k === 'more' && waitingCargo ? `<i class="dot">${waitingCargo}</i>` : ''}</button>`).join('')}</nav>`;
  afterRender();
}
function localTs(iso) { const x = new Date(iso); return isNaN(x) ? '' : `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())} ${pad(x.getHours())}:${pad(x.getMinutes())}`; }

function notConfigured() {
  if (!(window.SITE_CONFIG || {}).central) {
    return `<div class="auth"><div class="auth-top"><img src="icons/icon-192.png" alt=""><h1>Site Yönetim Mobil</h1></div>
    <div class="auth-card"><h3>Uygulama henüz yapılandırılmamış</h3><p class="muted small" style="margin-top:8px">Bu kurulumda bulut bağlantı bilgileri eksik. Site yönetimi, masaüstü programdaki <b>Ayarlar → Mobil Uygulama &amp; Bulut → Mobil Uygulama Paketini İndir</b> ile hazır paketi oluşturup yayınlamalıdır.</p></div></div>`;
  }
  return `<div class="auth"><div class="auth-top"><img src="icons/icon-192.png" alt=""><h1>Site Yönetim Mobil</h1><p>Sitenize bağlanın</p></div>
    <div class="auth-card"><h3>Siteye Bağlan</h3>
      <p class="muted small" style="margin-top:6px">Site yönetiminin size gönderdiği <b>davet mesajındaki linke dokunun</b>. Uygulamayı ana ekrandan açtıysanız, davet mesajını (veya içindeki linki) kopyalayıp aşağıya yapıştırın.</p>
      ${S.dirErr ? `<div class="alert orange" style="margin-top:10px">${esc(S.dirErr)}</div>` : ''}
      <form id="connForm"><div class="fld" style="margin-top:12px"><label>Davet linki, mesajı veya davet kodu</label><textarea name="t" rows="4" placeholder="https://…/m/?d=…  veya  ABCD-EFGH" required></textarea></div>
      <button class="btn primary block" type="submit">Bağlan</button></form>
      <p class="muted small center" style="margin-top:12px">Davet mesajınız yoksa site yönetiminden isteyin.</p></div></div>`;
}
function bindConnect() {
  const f = $('#connForm'); if (!f) return;
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const t = f.t.value, site = siteParamFromText(t);
    if (!site) {
      // 1.8.1: kısa link (?d=KOD / ?y=KIMLIK) veya yalnızca davet kodu
      const dm = /[?&#]d=([A-Za-z0-9-]+)/.exec(t) || /[?&#]davet=([A-Za-z0-9-]+)/.exec(t), ym = /[?&#]y=([A-Za-z0-9]+)/.exec(t);
      const lone = /^\s*([A-Za-z0-9]{4}-?[A-Za-z0-9]{4})\s*$/.exec(t);
      const code = dm ? dirNorm(dm[1]) : lone ? dirNorm(lone[1]) : '';
      if (code.length >= 6 && (window.SITE_CONFIG || {}).dir) { location.replace(location.pathname + '?d=' + code); return; }
      if (ym && (window.SITE_CONFIG || {}).dir) { location.replace(location.pathname + '?y=' + dirNorm(ym[1])); return; }
      toast('Bu metinde davet bilgisi bulunamadı. Davet mesajının tamamını veya davet kodunu yazın.', 'error'); return;
    }
    localStorage.setItem('sym_site', JSON.stringify(site));
    const d = /[?&#]davet=([A-Za-z0-9-]+)/.exec(t);
    location.replace(location.pathname + '?s=' + site.raw + (d ? '&davet=' + d[1] : ''));
  });
}

// ---------------- bağlantı tanılama ----------------
function hostOf(u) { try { return new URL(u).host; } catch { return u; } }
async function probe() {
  const t0 = Date.now();
  try {
    const r = await fetch(`${BASE}/rest/v1/`, { headers: authHeaders(), cache: 'no-store' });
    return { ok: true, status: r.status, ms: Date.now() - t0 };
  } catch (e) { return { ok: false, err: String(e && e.message || e), ms: Date.now() - t0 }; }
}
function netDiag(retry) {
  const host = hostOf(BASE);
  const mixed = location.protocol === 'https:' && /^http:/.test(BASE);
  const reason = navigator.onLine === false ? 'Telefon internete bağlı değil.'
    : mixed ? 'Uygulamadaki sunucu adresi güvenli değil (http). Yönetim, programdan yeni mobil paketi indirip yayınlamalıdır.'
    : NET.csp ? 'Uygulamanın güvenlik ayarı bu sunucuya bağlanmayı engelledi. Yönetim, programdan yeni mobil paketi indirip yayınlamalıdır.'
    : 'Bu telefonun bağlı olduğu ağ sunucuya erişemiyor olabilir.';
  Sheet.open(`<h3>Sunucuya ulaşılamadı</h3>
    <div class="kv"><span>Sunucu</span><b>${esc(host)}</b></div>
    <div class="kv"><span>İnternet</span><b>${navigator.onLine === false ? 'Yok' : 'Var'}</b></div>
    <div class="kv"><span>Olası neden</span><b>${esc(reason)}</b></div>
    <div class="diag-out" data-out></div>
    <button class="btn primary block" style="margin-top:14px" data-probe>Bağlantıyı Test Et</button>
    ${retry ? '<button class="btn block" style="margin-top:8px" data-retry>Tekrar Dene</button>' : ''}
    <details class="diag-tips"><summary>Ne yapabilirim?</summary><ul>
      <li><b>Wi-Fi'yi kapatıp mobil veriyle</b> (veya tersi) tekrar deneyin. Bazı ağlar (iş yeri, okul, misafir Wi-Fi, "Güvenli İnternet" profili) bu sunucuyu engelleyebilir.</li>
      <li>Telefonda <b>VPN, reklam engelleyici veya "Özel DNS"</b> açıksa kapatıp deneyin.</li>
      <li>Tarayıcıda şu adresi açın: <a href="${esc(BASE)}/rest/v1/" target="_blank" rel="noopener">${esc(host)}/rest/v1/</a> — kısa bir İngilizce hata yazısı görüyorsanız telefon sunucuya ulaşıyor demektir.</li>
      <li>Sorun sürerse aşağıdaki düğmeyle teknik bilgiyi kopyalayıp yönetime gönderin.</li></ul>
      <button class="btn sm" data-diagcopy>Teknik bilgiyi kopyala</button></details>`, (el) => {
    const outEl = el.querySelector('[data-out]');
    el.querySelector('[data-probe]').onclick = async (ev) => {
      const b = ev.currentTarget; b.disabled = true; b.textContent = 'Test ediliyor…';
      const r = await probe();
      outEl.innerHTML = r.ok
        ? `<div class="diag ok">✓ Sunucuya ulaşılıyor (HTTP ${r.status}, ${r.ms} ms). Lütfen tekrar deneyin.</div>`
        : `<div class="diag bad">✕ Sunucuya ulaşılamıyor (${esc(r.err)}). Aşağıdaki "Ne yapabilirim?" adımlarını deneyin.</div>`;
      b.disabled = false; b.textContent = 'Bağlantıyı Tekrar Test Et';
      if (!r.ok) el.querySelector('.diag-tips').open = true;
    };
    const rt = el.querySelector('[data-retry]'); if (rt) rt.onclick = () => { Sheet.close(); retry(); };
    el.querySelector('[data-diagcopy]').onclick = () => copyText([
      'Site Yönetim Mobil bağlantı hatası', 'Sürüm: ' + APP_VERSION, 'Uygulama: ' + location.origin, 'Sunucu: ' + BASE,
      'Anahtar: ' + (API_KEY ? API_KEY.slice(0, 18) + '…' : 'YOK'), 'Çevrim içi: ' + navigator.onLine, 'CSP: ' + (NET.csp || '-'),
      'Hata: ' + (NET.lastErr || '-'), 'Tarayıcı: ' + navigator.userAgent].join('\n'), 'Teknik bilgi kopyalandı');
  });
}

// ---------------- giriş / kayıt ----------------
const fmtInv = (c) => c ? c.slice(0, 4) + '-' + c.slice(4) : '';
function inviteBlock() {
  const iv = S.invite;
  const manual = `<div class="fld"><label>Davet Kodu</label><input name="code" class="code-input" autocomplete="off" autocapitalize="characters" placeholder="XXXX-XXXX" maxlength="9" required><small>Site yönetiminin size verdiği 8 haneli kod</small></div>`;
  if (!iv) return manual;
  const hidden = `<input type="hidden" name="code" value="${esc(iv.code)}">`;
  if (iv.loading) return `${hidden}<div class="inv-card wait"><div class="inv-ic"><span class="spinner"></span></div><div><b>Davetiniz kontrol ediliyor…</b><small>Kod: ${esc(fmtInv(iv.code))}</small></div></div>`;
  if (iv.err && !iv.offline) return `<div class="inv-card bad"><div class="inv-ic">!</div><div><b>Davet kullanılamıyor</b><span>${esc(iv.err)}</span>
      <div class="inv-acts">${iv.errCode === 'INVITE_USED' ? `<button type="button" class="btn sm primary" data-auth="login">Giriş Yap</button>` : ''}<button type="button" class="btn sm" data-invclear>Kodu elle gir</button></div></div></div>${manual}`;
  const info = iv.info || {};
  return `${hidden}<div class="inv-card ok"><div class="inv-ic">✓</div><div><b>Davetiniz hazır${info.name ? ', ' + esc(info.name) : ''}</b>
      ${info.unit ? `<span>${esc(info.unit)}</span>` : ''}<small>Kod: ${esc(fmtInv(iv.code))} otomatik girildi${iv.offline ? ' · (kayıt sırasında kontrol edilecek)' : ''}</small>
      <button type="button" class="linkbtn" data-invclear>Bu davet bana ait değil</button></div></div>
    <p class="inv-hint">Sadece cep telefonu numaranızı yazıp kendinize bir şifre belirleyin.</p>`;
}
async function loadInvite() {
  const iv = S.invite; if (!iv) return;
  iv.loading = true; iv.err = null; iv.offline = false;
  try { iv.info = await rpc('member_invite_info', { p_code: iv.code }); }
  catch (e) {
    // Davete özgü hata (geçersiz/kullanılmış/süresi dolmuş) → göster. Ağ/sunucu hatası → kodu koru, kayıtta kontrol edilsin.
    if (e.code && /^INVITE_|^ERROR$/.test(e.code)) { iv.err = e.message; iv.errCode = e.code; }
    else iv.offline = true;
  }
  iv.loading = false;
  if (!S.token && S.authTab === 'register') { render(); const ph = $('#regForm [name=phone]'); if (ph && !iv.err) ph.focus(); }
}
function clearInvite() { S.invite = null; sessionStorage.removeItem('sym_invite'); }
// Adres çubuğundaki ?davet=KOD bilgisini oku ve adresten temizle
function readInviteFromUrl() {
  let code = null;
  try {
    const qs = new URLSearchParams(location.search);
    code = qs.get('davet') || qs.get('d');
    if (!code) { const m = /(?:^|[#&])davet=([A-Za-z0-9-]+)/.exec(location.hash); if (m) code = m[1]; }
  } catch { }
  if (code) {
    code = code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    if (code.length === 8) sessionStorage.setItem('sym_invite', code); else code = null;
  }
  return code || sessionStorage.getItem('sym_invite');
}
function startWithInvite(code) {
  S.invite = { code, loading: true };
  S.authTab = 'register';
  loadInvite();
}
function authView() {
  const site = CFG.siteName || 'Site Yönetim';
  const t = S.authTab;
  return `<div class="auth">
    <div class="auth-top"><img src="icons/icon-192.png" alt=""><h1>${esc(site)}</h1><p>Site Yönetim Mobil</p></div>
    <div class="auth-card">
      <div class="seg"><button data-auth="login" class="${t === 'login' ? 'on' : ''}">Giriş Yap</button><button data-auth="register" class="${t === 'register' ? 'on' : ''}">İlk Kayıt</button></div>
      ${t === 'login' ? `
      <form id="loginForm" autocomplete="on">
        <div class="fld"><label>Cep Telefonu</label><input name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="05xx xxx xx xx" value="${esc(localStorage.getItem('sym_phone') || '')}" required></div>
        <div class="fld"><label>Şifre</label><div class="pw-wrap"><input name="password" type="password" autocomplete="current-password" required><button type="button" data-pw>${ic('eye')}</button></div></div>
        <button class="btn primary block" type="submit">Giriş Yap</button>
        <p class="muted small center" style="margin-top:14px">Şifrenizi mi unuttunuz? Site yönetiminden yeni bir davet kodu isteyip <b>İlk Kayıt</b> bölümünden yeni şifre belirleyebilirsiniz.</p>
      </form>` : `
      <form id="regForm" autocomplete="on">
        ${inviteBlock()}
        <div class="fld"><label>Cep Telefonu</label><input name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="05xx xxx xx xx" required></div>
        <div class="row2">
          <div class="fld"><label>Şifre</label><input name="password" type="password" autocomplete="new-password" minlength="6" required></div>
          <div class="fld"><label>Şifre (Tekrar)</label><input name="password2" type="password" autocomplete="new-password" minlength="6" required></div>
        </div>
        <p class="muted small" style="margin:-4px 0 14px">Şifre en az 6 karakter olmalı. Bundan sonra telefon numaranız ve bu şifreyle giriş yapacaksınız.</p>
        <label class="kvkk-chk"><input type="checkbox" name="kvkk" required> <span><a href="#" data-kvkkread>Kişisel Verilerin Korunması Aydınlatma Metni</a>'ni okudum; kişisel verilerimin site yönetimi tarafından bu metinde açıklanan şekilde işleneceği konusunda bilgilendirildim.</span></label>
        <button class="btn primary block" type="submit">Kayıt Ol ve Başla</button>
      </form>`}
    </div>
    <div class="auth-foot">Kişisel verileriniz yalnızca site yönetimi ile paylaşılır.<br>v${APP_VERSION}</div>
  </div>`;
}
function bindAuth() {
  const lf = $('#loginForm'), rf = $('#regForm');
  const phoneMask = (inp) => inp && inp.addEventListener('input', () => {
    let d = inp.value.replace(/\D/g, ''); if (d.startsWith('90')) d = d.slice(2); if (d && d[0] !== '0') d = '0' + d; d = d.slice(0, 11);
    inp.value = [d.slice(0, 4), d.slice(4, 7), d.slice(7, 9), d.slice(9, 11)].filter(Boolean).join(' ');
  });
  document.querySelectorAll('input[type=tel]').forEach(phoneMask);
  const pw = $('[data-pw]'); if (pw) pw.onclick = () => { const i = pw.previousElementSibling; i.type = i.type === 'password' ? 'text' : 'password'; };
  const busy = (f, on, label) => { const b = f.querySelector('[type=submit]'); b.disabled = on; if (on) { b.dataset.t = b.textContent; b.textContent = label; } else b.textContent = b.dataset.t || b.textContent; };
  if (lf) lf.onsubmit = async (e) => {
    e.preventDefault();
    busy(lf, true, 'Giriş yapılıyor…');
    try {
      const r = await rpc('member_login', { p_phone: lf.phone.value, p_password: lf.password.value });
      localStorage.setItem('sym_phone', lf.phone.value);
      await afterLogin(r);
    } catch (err) { busy(lf, false); if (err.offline) netDiag(() => lf.requestSubmit()); else toast(err.message, 'error'); }
  };
  if (rf) {
    rf.code.addEventListener('input', () => { let v = rf.code.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8); rf.code.value = v.length > 4 ? v.slice(0, 4) + '-' + v.slice(4) : v; });
    rf.onsubmit = async (e) => {
      e.preventDefault();
      if (rf.code.value.replace(/-/g, '').length !== 8) return toast('Davet kodu 8 karakter olmalıdır.', 'error');
      if (rf.password.value.length < 6) return toast('Şifre en az 6 karakter olmalıdır.', 'error');
      if (rf.password.value !== rf.password2.value) return toast('Şifreler eşleşmiyor.', 'error');
      if (!rf.kvkk.checked) return toast('Devam etmek için aydınlatma metnini okuduğunuzu onaylayın.', 'error');
      busy(rf, true, 'Kaydediliyor…');
      try {
        const kv = await kvkkForCode(rf.code.value);
        const args = { p_code: rf.code.value, p_phone: rf.phone.value, p_password: rf.password.value };
        if (kv && kv.version) args.p_kvkk = kv.version;   // eski bulut kurulumunda (1.7) bu alan yok
        const r = await rpc('member_register', args);
        localStorage.setItem('sym_phone', rf.phone.value);
        clearInvite();
        await afterLogin(r, true);
      } catch (err) { busy(rf, false); if (err.offline) netDiag(() => rf.requestSubmit()); else toast(err.message, 'error'); }
    };
  }
}
// ---------------- KVKK ----------------
// Davet koduna ait aydınlatma metni (davet bilgisiyle gelir; kod elle yazıldıysa sorulur)
async function kvkkForCode(code) {
  code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (S.invite && S.invite.info && S.invite.code === code) return S.invite.info.kvkk || null;
  if (S.kvkkCache && S.kvkkCache.code === code) return S.kvkkCache.kv;
  if (code.length !== 8) return null;
  try { const i = await rpc('member_invite_info', { p_code: code }); S.kvkkCache = { code, kv: i.kvkk || null }; return i.kvkk || null; } catch { return null; }
}
function kvkkDefaultText(site) {
  return `KİŞİSEL VERİLERİN KORUNMASI HAKKINDA AYDINLATMA METNİ\n\n${site || 'Site'} yönetimi, 6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında veri sorumlusudur. Adınız, telefonunuz, bağımsız bölüm bilginiz, aidat/ödeme kayıtlarınız, talep, rezervasyon, ziyaretçi ve kargo kayıtlarınız; 634 sayılı Kat Mülkiyeti Kanunu kapsamındaki yönetim hizmetlerinin yürütülmesi ve site güvenliğinin sağlanması amacıyla işlenir. Bu uygulamadaki veriler bulut hizmet sağlayıcısında saklanır. KVKK m.11 kapsamındaki haklarınız için site yönetimine başvurabilirsiniz. Ayrıntılı metni site yönetiminden isteyebilirsiniz.`;
}
function kvkkSheet(text, opts = {}) {
  Sheet.open(`<h3>${ic('shield')} Aydınlatma Metni</h3>
    <div class="kvkk-text">${esc(text || kvkkDefaultText(CFG.siteName))}</div>
    ${opts.ack ? `<button class="btn primary block" style="margin-top:12px" data-kvkkok>Okudum, bilgilendirildim</button><button class="btn block" style="margin-top:8px" data-close>Daha sonra</button>`
      : '<button class="btn block" style="margin-top:12px" data-close>Kapat</button>'}`, (el) => {
    const b = el.querySelector('[data-kvkkok]');
    if (b) b.onclick = async () => { b.disabled = true; try { await opts.ack(); Sheet.close(); } catch (e) { toast(e.message, 'error'); b.disabled = false; } };
  });
}
// Metin güncellendiyse (veya 1.4 öncesi kayıtsa) bir kez yeniden bilgilendirme göster
function kvkkCheck() {
  const d = S.data; if (!d || !d.member || d.push === undefined) return;   // eski bulut kurulumu
  const ver = d.site && d.site.kvkk_version; if (!ver || d.member.kvkk_version === ver) return;
  if (S.kvkkAsked === ver || $('#sheet-root .sheet')) return;
  S.kvkkAsked = ver;
  setTimeout(() => {
    if ($('#sheet-root .sheet')) return;
    kvkkSheet(d.site.kvkk_text, { ack: async () => { await call('member_kvkk_ack', { p_version: ver }); d.member.kvkk_version = ver; toast('Teşekkürler ✓'); } });
    const h = $('#sheet-root .sheet h3'); if (h) h.insertAdjacentHTML('afterend', `<p class="muted small">${d.member.kvkk_version ? 'Site yönetimi aydınlatma metnini güncelledi.' : 'Site yönetimi kişisel verilerin korunmasına ilişkin aydınlatma metnini yayınladı.'} Lütfen okuyun.</p>`);
  }, 900);
}

// ---------------- anlık bildirimler ----------------
const PUSH_PREFS = [['ann', 'Duyurular'], ['cargo', 'Kargo geldi'], ['guest', 'Ziyaretçim / misafirim geldi'], ['req', 'Talep durumu değişti'], ['resv', 'Rezervasyon onay / ret'], ['accrual', 'Yeni aidat / borç'], ['poll', 'Yeni anket'], ['pay', 'Kartla ödemelerim / otomatik ödeme']];
const Push = {
  supported() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; },
  siteKey() { return (S.data && S.data.site && S.data.site.push_vapid_public) || ''; },
  async sub() { if (!this.supported()) return null; const r = await navigator.serviceWorker.getRegistration(); return r ? r.pushManager.getSubscription() : null; },
  key(b64) { const p = '='.repeat((4 - b64.length % 4) % 4); const raw = atob((b64 + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, c => c.charCodeAt(0)); },
  device() { const u = navigator.userAgent; return (/iPhone|iPad/.test(u) ? 'iPhone/iPad' : /Android/.test(u) ? 'Android' : /Windows/.test(u) ? 'Windows' : /Mac/.test(u) ? 'Mac' : 'Cihaz') + (/Firefox/.test(u) ? ' Firefox' : /Edg/.test(u) ? ' Edge' : /SamsungBrowser/.test(u) ? ' Samsung' : /Chrome|CriOS/.test(u) ? ' Chrome' : /Safari/.test(u) ? ' Safari' : ''); },
  mine(sub) { return sub && (S.data.push || []).find(p => p.endpoint === sub.endpoint); },
  async enable(prefs) {
    const key = this.siteKey();
    if (!key) throw new Error('Site yönetimi anlık bildirimleri henüz açmadı.');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error(perm === 'denied' ? deniedMsg() : 'Bildirim izni verilmedi.');
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (sub && localStorage.getItem('sym_push_key') !== key) { await sub.unsubscribe().catch(() => { }); sub = null; }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: this.key(key) });
    await this.save(sub, prefs || {});
    localStorage.setItem('sym_push_key', key); localStorage.setItem('sym_push_on', '1'); localStorage.removeItem('sym_push_off');
  },
  async save(sub, prefs) {
    const j = sub.toJSON();
    await call('member_push_subscribe', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_prefs: prefs, p_ua: this.device() });
    const list = S.data.push || (S.data.push = []); const cur = list.find(p => p.endpoint === j.endpoint);
    if (cur) cur.prefs = prefs; else list.push({ endpoint: j.endpoint, prefs });
  },
  async disable(silent) {
    localStorage.removeItem('sym_push_on');
    if (!silent) localStorage.setItem('sym_push_off', '1');   // 1.8.2: kendiliğinden yeniden açılmasın
    const sub = await this.sub().catch(() => null);
    if (!sub) return;
    try { await rpc('member_push_unsubscribe', { p_token: S.token, p_endpoint: sub.endpoint }); } catch { }
    if (S.data && S.data.push) S.data.push = S.data.push.filter(p => p.endpoint !== sub.endpoint);
    await sub.unsubscribe().catch(() => { });
    if (!silent) toast('Bu cihazda bildirimler kapatıldı.');
  },
  // Abonelik sunucuda silinmişse (ör. uzun süre kapalı kaldı) sessizce yeniden kaydet
  async heal() {
    try {
      if (!this.supported() || localStorage.getItem('sym_push_on') !== '1' || Notification.permission !== 'granted' || !this.siteKey() || S.data.push === undefined) return;
      const sub = await this.sub();
      if (!sub || localStorage.getItem('sym_push_key') !== this.siteKey()) { await this.enable((this.mine(sub) || {}).prefs || {}); return; }
      if (!this.mine(sub)) await this.save(sub, {});
    } catch (e) { console.warn('bildirim', e); }
  }
};
// Eski (Netlify) ana ekran simgesinden açılınca uygulama "başka adres" olarak üst çubukla görünür ve
// telefonun bildirim izni eski simgeye ait olduğundan bildirimler bu adreste reddedilir → yeni simge eklenmeli.
function deniedMsg() {
  return 'Bildirim izni reddedilmiş. ' + (/Android/i.test(navigator.userAgent)
    ? 'Telefonun Ayarlar → Uygulamalar → Site Yönetim Mobil → Bildirimler bölümünden izin verin, uygulamayı kapatıp yeniden açın ve tekrar deneyin.'
    : 'Telefonun Ayarlar → Bildirimler → Site Yönetim Mobil bölümünden izin verin, uygulamayı kapatıp yeniden açın ve tekrar deneyin.');
}
// Sorun gidermek için kısa durum satırı (kullanıcı ekran görüntüsü gönderebilsin)
function pushDiag(sub, mine) {
  const perm = ('Notification' in window) ? ({ granted: 'verildi', denied: 'reddedildi', default: 'sorulmadı' })[Notification.permission] || Notification.permission : 'yok';
  const parts = ['İzin: ' + perm, 'Site anahtarı: ' + (Push.siteKey() ? 'var' : 'yok'), 'Bulut: ' + (S.data && S.data.cards !== undefined ? '1.9.1' : S.data && S.data.polls !== undefined ? '1.9' : S.data && S.data.push !== undefined ? '1.8' : 'eski')];
  if (sub !== undefined) parts.push('Abonelik: ' + (sub ? (mine ? 'kayıtlı' : 'telefonda var, bulutta yok') : 'yok'));
  parts.push(isStandalone() ? 'Ana ekran simgesi' : viaOldIcon() ? 'Eski simge' : 'Tarayıcı');
  return `<p class="push-diag">${esc(parts.join(' · '))}</p>`;
}
function viaOldIcon() { try { return sessionStorage.getItem('sym_viaold') === '1' && !isStandalone(); } catch { return false; } }
function appUrl() { return location.origin + location.pathname + siteQuery({ y: CFG.siteY, raw: CFG.siteRaw }); }
function oldIconHelp() {
  const android = /Android/i.test(navigator.userAgent);
  return `<p class="small">Uygulamayı telefonunuzdaki <b>eski simgeden</b> açtınız. Bildirimlerin çalışması ve üstteki adres çubuğunun kalkması için uygulamayı <b>yeni simgeyle</b> ana ekrana eklemeniz gerekir (bir kez):</p>
    <ol class="ios-steps" style="margin-top:8px">${android
      ? `<li>Aşağıdaki <b>Chrome'da Aç</b> düğmesine dokunun.</li><li>Chrome'da <b>⋮</b> menüsünden <b>“Uygulamayı yükle”</b> / <b>“Ana ekrana ekle”</b>yi seçin.</li><li>Yeni simgeden açıp <b>Profil → Bildirimleri Aç</b> deyin.</li><li>Ana ekrandaki <b>eski simgeyi silin</b>.</li>`
      : `<li><b>Bağlantıyı Kopyala</b>'ya dokunun, <b>Safari</b>'yi açıp adres çubuğuna yapıştırın.</li><li><b>Paylaş</b> (□↑) → <b>“Ana Ekrana Ekle”</b>.</li><li>Yeni simgeden açıp <b>Profil → Bildirimleri Aç</b> deyin.</li><li>Ana ekrandaki <b>eski simgeyi silin</b>.</li>`}</ol>
    ${android ? `<a class="btn primary block" style="margin-top:10px" data-openchrome href="${esc('intent://' + appUrl().replace(/^https?:\/\//, '') + '#Intent;scheme=' + location.protocol.replace(':', '') + ';package=com.android.chrome;S.browser_fallback_url=' + encodeURIComponent(appUrl()) + ';end')}">${ic('bell')} Chrome'da Aç</a>` : ''}
    <button class="btn block" style="margin-top:8px" data-copyapp>Bağlantıyı Kopyala</button>`;
}
function bindOldIconHelp(box) {
  const c = box.querySelector('[data-copyapp]');
  if (c) c.onclick = async () => { try { await navigator.clipboard.writeText(appUrl()); toast('Bağlantı kopyalandı ✓'); } catch { prompt('Bağlantıyı kopyalayın:', appUrl()); } };
}
async function pushCard(box) {
  if (!box) return;
  const d = S.data, key = Push.siteKey();
  const head = `<div class="card-h"><h3>${ic('bell')} Bildirimler</h3></div>`;
  if (d.push === undefined) { box.innerHTML = head + `<p class="muted small">Bildirimler için sitenin bulut veritabanı henüz güncellenmemiş. Site yönetimi, Supabase'de <b>kurulum.sql 1.8</b>'i bir kez çalıştırmalıdır.</p>${pushDiag()}`; return; }
  if (!key) { box.innerHTML = head + `<p class="muted small">Site yönetimi anlık bildirimleri henüz açmadı (masaüstü program: <b>Ayarlar → Bildirimler → Bildirimleri Aç</b>, ardından eşitleme). Açıldığında duyuru, kargo ve ziyaretçi bildirimlerini telefonunuza alabileceksiniz.</p>${pushDiag()}`; return; }
  if (!Push.supported()) {
    box.innerHTML = head + (isIOS() && !isStandalone()
      ? `<p class="small">iPhone'da bildirim alabilmek için uygulamayı önce <b>ana ekrana ekleyin</b> ve ana ekrandaki simgeden açın (iOS 16.4 ve üzeri).</p><button class="btn block" data-act="install">Nasıl eklenir?</button>`
      : `<p class="muted small">Bu tarayıcı anlık bildirimleri desteklemiyor. Android'de Chrome, iPhone'da ana ekrana eklenmiş uygulama kullanın.</p>`);
    return;
  }
  // eski simgeden açıldıysa ve izin yoksa yönerge; izin verilmişse normal kart (abonelik yapılabilir) + öneri
  if (viaOldIcon() && Notification.permission !== 'granted') { box.innerHTML = head + oldIconHelp() + pushDiag(); bindOldIconHelp(box); return; }
  const sub = await Push.sub().catch(() => null), mine = Push.mine(sub);
  const on = !!(sub && mine && Notification.permission === 'granted');
  const prefs = (mine && mine.prefs) || {};
  box.innerHTML = head + (on
    ? `<p class="small" style="margin-bottom:8px">✓ Bu cihazda bildirimler <b>açık</b>. Almak istediklerinizi seçin:</p>
       <div class="prefs">${PUSH_PREFS.filter(([k]) => (k !== 'poll' || (S.data && S.data.polls !== undefined)) && (k !== 'pay' || payOn())).map(([k, l]) => `<label class="pref"><span>${l}</span><input type="checkbox" data-pref="${k}" ${prefs[k] === false ? '' : 'checked'}><i></i></label>`).join('')}</div>
       <p class="muted small" style="margin-top:6px">Site yönetiminin doğrudan gönderdiği önemli mesajlar her zaman iletilir.</p>
       <button class="btn block" style="margin-top:10px" data-pushoff>Bu cihazda bildirimleri kapat</button>`
    : `<p class="small">Duyuru, kargo, misafir girişi, talep ve rezervasyon gelişmelerinden <b>anında</b> haberdar olun. Uygulama kapalıyken de bildirim gelir.</p>
       ${Notification.permission === 'denied' ? `<p class="small txt-red">${deniedMsg()}</p>` : ''}
       <button class="btn primary block" style="margin-top:10px" data-pushon>${ic('bell')} Bildirimleri Aç</button>`);
  box.insertAdjacentHTML('beforeend', (viaOldIcon() ? `<p class="muted small" style="margin-top:8px">Öneri: uygulamayı yeni simgeyle ana ekrana ekleyip eski simgeyi silin (üstteki adres çubuğu kalkar).</p>` : '') + pushDiag(sub, mine));
  const onBtn = box.querySelector('[data-pushon]');
  if (onBtn) onBtn.onclick = async () => { onBtn.disabled = true; try { await Push.enable({}); toast('Bildirimler açıldı ✓'); } catch (e) { toast(e.message, 'error'); } pushCard(box); };
  const offBtn = box.querySelector('[data-pushoff]');
  if (offBtn) offBtn.onclick = async () => { offBtn.disabled = true; await Push.disable(); pushCard(box); };
  box.querySelectorAll('[data-pref]').forEach(c => c.onchange = async () => {
    const p = {}; box.querySelectorAll('[data-pref]').forEach(x => { if (!x.checked) p[x.dataset.pref] = false; });
    try { await Push.save(sub, p); toast('Kaydedildi'); } catch (e) { toast(e.message, 'error'); c.checked = !c.checked; }
  });
}

// ---------------- QR misafir kartı ----------------
const fmtQr = (t) => t ? t.slice(0, 5) + '-' + t.slice(5) : '';
function passInfo(v) {
  const from = String(v.expected_date || '').slice(0, 10), to = String(v.valid_until || v.expected_date || '').slice(0, 10);
  const max = v.max_uses == null ? 1 : Number(v.max_uses), used = Number(v.used_count || 0);
  const expired = to < today(), spent = max > 0 && used >= max;
  return { from, to, max, used, expired, spent, valid: v.status !== 'İptal' && !expired && !spent,
    range: from === to ? fmt.date(from) : `${fmt.dshort(from)} – ${fmt.date(to)}`, uses: max === 0 ? 'Sınırsız giriş' : max === 1 ? 'Tek giriş' : `${max} giriş` };
}
function drawPass(v) {
  const W = 900, H = 1300, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'), pi = passInfo(v), site = (S.data.site && S.data.site.site_name) || CFG.siteName || 'Site';
  const u = S.data.unit || {};
  x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
  const g = x.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#4f6bed'); g.addColorStop(1, '#6741d9');
  x.fillStyle = g; x.fillRect(0, 0, W, 230);
  x.fillStyle = '#fff'; x.textAlign = 'center';
  x.font = 'bold 46px system-ui, -apple-system, Segoe UI, Roboto, sans-serif'; x.fillText(site.slice(0, 32), W / 2, 100);
  x.font = '600 34px system-ui, -apple-system, Segoe UI, Roboto, sans-serif'; x.fillText('MİSAFİR GİRİŞ KARTI', W / 2, 165);
  x.fillStyle = '#1d2433'; x.font = 'bold 54px system-ui, -apple-system, Segoe UI, Roboto, sans-serif'; x.fillText(String(v.guest_name || '').slice(0, 28), W / 2, 320);
  x.fillStyle = '#5b6478'; x.font = '32px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  x.fillText(`${unitName(u)}  ·  ${pi.range}`, W / 2, 375);
  // QR
  const q = qrcode(0, 'M'); q.addData('SYG' + v.qr_token); q.make();
  const n = q.getModuleCount(), size = 600, cell = Math.floor(size / (n + 8)), qs = cell * (n + 8), ox = (W - qs) / 2, oy = 420;
  x.fillStyle = '#fff'; x.fillRect(ox, oy, qs, qs); x.fillStyle = '#000';
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) x.fillRect(ox + (k + 4) * cell, oy + (r + 4) * cell, cell, cell);
  x.fillStyle = '#1d2433'; x.font = 'bold 60px ui-monospace, Menlo, Consolas, monospace'; x.fillText(fmtQr(v.qr_token), W / 2, oy + qs + 80);
  x.fillStyle = '#5b6478'; x.font = '30px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  x.fillText(`${pi.uses}${v.plate ? '  ·  Plaka: ' + v.plate : ''}`, W / 2, oy + qs + 135);
  x.fillStyle = '#eef1fb'; x.fillRect(0, H - 130, W, 130);
  x.fillStyle = '#3d56d1'; x.font = '600 30px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  x.fillText('Kapıda güvenlik görevlisine bu kartı gösterin.', W / 2, H - 62);
  return c;
}
function passText(v) {
  const pi = passInfo(v), site = (S.data.site && S.data.site.site_name) || CFG.siteName || 'Site';
  return `${site} misafir giriş kartınız 🎫\nAd: ${v.guest_name}\nGeçerlilik: ${pi.range} (${pi.uses.toLowerCase()})\nGiriş kodu: ${fmtQr(v.qr_token)}\nKapıda güvenliğe QR kodu veya bu kodu gösterin.`;
}
function passSheet(v, isNew) {
  const pi = passInfo(v), c = drawPass(v), url = c.toDataURL('image/png');
  Sheet.open(`<h3>${ic('qr')} Misafir Kartı</h3>
    ${isNew ? `<p class="small" style="margin-bottom:8px">Kart hazır! Misafirinize <b>WhatsApp</b> ile gönderin; kapıda QR kodu okutması yeterli.</p>` : ''}
    ${!pi.valid ? `<div class="alert orange" style="margin-bottom:10px">${ic('alert')}<div><b>${v.status === 'İptal' ? 'Bu kart iptal edildi' : pi.spent ? 'Bu kart kullanıldı' : 'Bu kartın süresi doldu'}</b></div></div>` : ''}
    <img class="pass-img" src="${url}" alt="Misafir kartı">
    <button class="btn primary block" style="margin-top:12px" data-passshare>${ic('share')} WhatsApp ile Gönder / Paylaş</button>
    <a class="btn block" style="margin-top:8px" href="${url}" download="misafir-karti-${esc(v.qr_token)}.png">${ic('download')} Resmi Kaydet</a>
    <button class="btn block" style="margin-top:8px" data-close>Kapat</button>`, (el) => {
    el.querySelector('[data-passshare]').onclick = async () => {
      const text = passText(v);
      try {
        const blob = await new Promise(r => c.toBlob(r, 'image/png'));
        const file = new File([blob], `misafir-karti-${v.qr_token}.png`, { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text, title: 'Misafir kartı' }); return; }
      } catch (e) { if (e && e.name === 'AbortError') return; }
      window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
    };
  });
}

// ---------------- kişisel verilerim ----------------
function privacyCard() {
  return `<div class="card"><div class="card-h"><h3>${ic('shield')} Kişisel Verilerim (KVKK)</h3></div>
    <div class="list flat">
      <div class="li" data-act="kvkk-read"><div class="li-b"><b>Aydınlatma Metni</b><small>${S.data.member && S.data.member.kvkk_at ? 'Onay: ' + esc(fmt.dt(localTs(S.data.member.kvkk_at))) : 'Verilerinizin nasıl işlendiği'}</small></div>${ic('chev', 'chev')}</div>
      <div class="li" data-act="kvkk-dl"><div class="li-b"><b>Verilerimi İndir</b><small>Uygulamadaki bilgilerinizin kopyası (JSON)</small></div>${ic('chev', 'chev')}</div>
      <div class="li" data-act="kvkk-req"><div class="li-b"><b>KVKK Başvurusu</b><small>Bilgi, düzeltme, silme talebi (KVKK m.11)</small></div>${ic('chev', 'chev')}</div>
      <div class="li" data-act="kvkk-del"><div class="li-b"><b class="txt-red">Hesabımı Sil</b><small>Mobil uygulama hesabınız kalıcı olarak silinir</small></div>${ic('chev', 'chev')}</div>
    </div></div>`;
}
function kvkkDownload() {
  const d = S.data;
  const out = { aciklama: 'Site Yönetim Mobil — kişisel veri kopyası', tarih: new Date().toISOString(), site: (d.site || {}).site_name, kisi: d.member, daire: d.unit, hesap_hareketleri: d.ledger, talepler: d.requests, rezervasyonlar: d.reservations, ziyaretciler: d.visitors, kargolar: d.cargo, bildirim_cihazlari: (d.push || []).map(p => ({ tercihler: p.prefs })) };
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'kisisel-verilerim.json'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('Dosya indirildi. Yönetimdeki tüm kayıtlarınızın dökümü için KVKK Başvurusu yapabilirsiniz.');
}
function kvkkRequestSheet() {
  Sheet.open(`<h3>KVKK Başvurusu</h3><form id="kvkkForm">
    <div class="fld"><label>Talebiniz</label><select name="t">
      <option>Hakkımda işlenen verilerin dökümünü istiyorum</option><option>Verilerimin düzeltilmesini istiyorum</option>
      <option>Verilerimin silinmesini istiyorum</option><option>Verilerimin kimlere aktarıldığını öğrenmek istiyorum</option><option>Diğer</option></select></div>
    <div class="fld"><label>Açıklama</label><textarea name="d" rows="4" maxlength="1000" placeholder="Talebinizi kısaca açıklayın"></textarea></div>
    <p class="muted small">Başvurunuz site yönetimine iletilir ve en geç 30 gün içinde yanıtlanır. Durumunu <b>Talepler</b> bölümünden takip edebilirsiniz.</p>
    <button class="btn primary block" type="submit">Başvuruyu Gönder</button></form>`, (sh) => {
    const f = sh.querySelector('#kvkkForm');
    f.onsubmit = async (e) => {
      e.preventDefault(); const b = f.querySelector('[type=submit]'); b.disabled = true;
      try { await call('member_new_request', { p_title: 'KVKK: ' + f.t.value, p_category: 'KVKK Başvurusu', p_location: '', p_description: f.d.value || f.t.value, p_priority: 'Normal' }); Sheet.close(); toast('Başvurunuz yönetime iletildi ✓'); refresh(true); }
      catch (err) { toast(err.message, 'error'); b.disabled = false; }
    };
  });
}
function deleteAccountSheet() {
  Sheet.open(`<h3 class="txt-red">Hesabımı Sil</h3>
    <p class="small">Mobil uygulama hesabınız, oturumlarınız ve bildirim kayıtlarınız <b>kalıcı olarak silinir</b>. Aidat, ödeme gibi kayıtlar yasal saklama süresi boyunca site yönetiminde kalır.</p>
    <p class="muted small" style="margin-top:6px">Tekrar kullanmak isterseniz yönetimden yeni davet kodu istemeniz gerekir.</p>
    <form id="delForm"><div class="fld" style="margin-top:10px"><label>Onay için şifreniz</label><input name="p" type="password" autocomplete="current-password" required></div>
    <button class="btn danger block" type="submit">Hesabımı Kalıcı Olarak Sil</button></form>
    <button class="btn block" style="margin-top:8px" data-close>Vazgeç</button>`, (sh) => {
    const f = sh.querySelector('#delForm');
    f.onsubmit = async (e) => {
      e.preventDefault(); const b = f.querySelector('[type=submit]'); b.disabled = true;
      try {
        await Push.disable(true).catch(() => { });
        await call('member_delete_self', { p_password: f.p.value });
        Sheet.close(); clearSession(); localStorage.removeItem('sym_phone'); render(); toast('Hesabınız silindi.');
      } catch (err) { toast(err.message, 'error'); b.disabled = false; }
    };
  });
}

async function afterLogin(r, isNew) {
  S.token = r.token; localStorage.setItem('sym_token', r.token);
  S.view = 'home'; history.replaceState({ view: 'home' }, '', '#home');
  render();
  Setup.afterAuth();   // 1.8.2: dokunuş hâlâ geçerliyken yükleme sorusu
  await refresh(true);
  toast(isNew ? `Hoş geldiniz ${(r.member.full_name || '').split(' ')[0]}! Kaydınız tamamlandı.` : `Hoş geldiniz ${(r.member.full_name || '').split(' ')[0]}`);
}
async function logout() {
  await Push.disable(true).catch(() => { });   // bu cihaz başka kişiye geçerse bildirim gitmesin
  try { await rpc('member_logout', { p_token: S.token }); } catch { }
  clearSession(); render();
}
function forceLogout(msg) { clearSession(); render(); toast(msg || 'Oturum sona erdi, lütfen tekrar giriş yapın.', 'error'); }
function clearSession() { S.token = null; S.data = null; localStorage.removeItem('sym_token'); localStorage.removeItem('sym_cache'); if (CFG.central && CFG.url) MSites.remove(CFG.url); S.authTab = 'login'; }
function curSite() { return { u: CFG.url, k: CFG.anonKey, f: CFG.fnUrl || '', n: CFG.siteName || '', raw: CFG.siteRaw, y: CFG.siteY || '' }; }
// Kayıtlı başka siteye geç: aktif oturum saklanır, hedefin oturumu açılır, sayfa o siteyle yeniden yüklenir
function switchSite(u, view) {
  const t = MSites.list().find(x => x.u === u); if (!t || u === CFG.url) { Sheet.close(); return; }
  MSites.stash(curSite());
  localStorage.setItem('sym_site', JSON.stringify({ u: t.u, k: t.k, f: t.f || '', n: t.n, raw: t.raw, y: t.y || '' }));
  MSites.restore(t.u);
  location.replace(location.pathname + siteQuery(t) + '#' + (/^[a-z]{2,12}$/.test(view || '') ? view : 'home'));
}
function sitesSheet() {
  const cur = (S.data && S.data.site && S.data.site.site_name) || CFG.siteName || 'Bu site';
  const others = MSites.others(CFG.url);
  Sheet.open(`<h3>Sitelerim</h3>
    <p class="muted small">Bu cihazda giriş yaptığınız siteler. Her sitenin bilgileri ayrıdır.</p>
    <div class="site-list">
      <div class="site-row on">${ic('home')}<div><b>${esc(cur)}</b><small>${S.data && S.data.unit ? esc(unitName(S.data.unit)) + ' · ' : ''}Açık olan site</small></div><span class="site-check">✓</span></div>
      ${others.map(x => `<button class="site-row" data-site="${esc(x.u)}">${ic('home')}<div><b>${esc(x.n || hostOf(x.u))}</b><small>${x.d ? esc(x.d) + ' · ' : ''}Geçmek için dokunun</small></div></button>`).join('')}
    </div>
    <p class="muted small" style="margin-top:12px">Başka bir sitede de daireniz varsa o sitenin yönetiminden gelen <b>davet linkini</b> açıp giriş yapın; site bu listeye eklenir.</p>
    <button class="btn block" data-close style="margin-top:10px">Kapat</button>`, (el) => {
    el.querySelectorAll('[data-site]').forEach(b => b.onclick = () => switchSite(b.dataset.site));
  });
}

// ---------------- ANA SAYFA ----------------
function balanceCard() {
  const u = S.data.unit || {}, site = S.data.site || {};
  const bal = Number(u.balance) || 0, od = Number(u.overdue) || 0;
  if (bal > 0.004) return `<div class="balance"><span>Güncel Borcunuz</span><b>${fmt.money(bal)}</b>
    <div class="bl-row"><small>${od > 0.004 ? `⚠ ${fmt.money(od)} vadesi geçmiş` : site.due_day ? `Son ödeme: her ayın ${esc(site.due_day)}. günü` : ''}</small>
    ${payOn() ? `<button class="btn sm" data-tab="pay">${ic('card')} Kartla Öde</button>` : `<button class="btn sm" data-act="pay">${ic('cash')} Nasıl öderim?</button>`}</div></div>`;
  if (bal < -0.004) return `<div class="balance credit"><span>Alacak Bakiyeniz</span><b>${fmt.money(-bal)}</b><div class="bl-row"><small>Sonraki aidatlarınızdan düşülecektir.</small></div></div>`;
  return `<div class="balance ok"><span>Aidat Durumu</span><b>Borcunuz yok ✓</b><div class="bl-row"><small>Tüm ödemeleriniz güncel. Teşekkür ederiz!</small><button class="btn sm" data-tab="account">Hesap dökümü</button></div></div>`;
}
function installBanner() {
  if (isStandalone() || Number(localStorage.getItem('sym_install_x') || 0) > Date.now()) return '';
  if (!S.installEvt && !isIOS()) return '';
  return `<div class="install"><img src="icons/icon-192.png" alt=""><div><b>Uygulamayı yükleyin</b>Ana ekranınızdan tek dokunuşla açın.</div><button class="btn" data-act="install">Yükle</button><button class="x" data-act="install-x" aria-label="Kapat">×</button></div>`;
}
function homeView() {
  const d = S.data, m = d.member || {};
  const first = (m.full_name || '').split(' ')[0];
  const cargo = (d.cargo || []).filter(c => !c.delivered_at);
  const td = today();
  const myRes = (d.reservations || []).filter(r => r.date >= td && r.status !== 'İptal').sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time)).slice(0, 3);
  const openReq = (d.requests || []).filter(r => !['Çözüldü', 'İptal'].includes(r.status)).slice(0, 3);
  const vis = (d.visitors || []).filter(v => v.status === 'Bekleniyor' && v.expected_date === td);
  const anns = (d.announcements || []).slice(0, 3);
  const fac = (id) => ((d.facilities || []).find(f => f.id === id) || {}).name || 'Ortak alan';
  return `
    <div class="hello"><h2>Merhaba ${esc(first)} 👋</h2><p>${esc(longDate())}</p></div>
    ${installBanner()}
    ${balanceCard()}
    ${cargo.length ? `<div class="alert purple" data-go="cargo">${ic('package')}<div><b>${cargo.length} kargonuz yönetimde sizi bekliyor</b>${esc(cargo.map(c => c.company).filter(Boolean).join(', '))}</div></div>` : ''}
    ${pendingPolls().length ? `<div class="alert blue" data-go="polls">${ic('poll')}<div><b>${pendingPolls().length === 1 ? 'Bir anket oyunuzu bekliyor' : pendingPolls().length + ' anket oyunuzu bekliyor'}</b>${esc(pendingPolls().map(p => p.title).join(', '))}</div></div>` : ''}
    ${vis.length ? `<div class="alert blue" data-go="visitors">${ic('guest')}<div><b>Bugün ${vis.length} misafiriniz bekleniyor</b>${esc(vis.map(v => v.guest_name).join(', '))}</div></div>` : ''}
    <div class="quick">
      ${[['wrench', 'orange', 'Arıza Bildir', 'data-act="newreq"'], ['calendar', 'blue', 'Rezervasyon', 'data-tab="reserve"'], ['guest', 'green', 'Misafir Bildir', 'data-go="visitors"'], ['megaphone', 'purple', 'Duyurular', 'data-go="ann"'],
      ['package', 'teal', 'Kargolarım', 'data-go="cargo"'], ['gavel', 'blue', 'Kararlar', 'data-go="meetings"'], ['phone', 'red', 'Telefonlar', 'data-go="contacts"'], ['cash', 'green', 'Ödeme Bilgisi', 'data-act="pay"']]
      .map(([i, c, l, a]) => `<button ${a}><span class="qi ${c}">${ic(i)}</span>${l}</button>`).join('')}
    </div>
    <div class="card-h"><h3>Son Duyurular</h3>${(d.announcements || []).length > 3 ? '<a data-go="ann">Tümü</a>' : ''}</div>
    ${anns.length ? anns.map(a => annCard(a, true)).join('') : `<div class="card muted small center">Henüz duyuru yok.</div>`}
    ${myRes.length ? `<div class="sec-title">Yaklaşan Rezervasyonlarım</div><div class="list">${myRes.map(r => `<div class="li" data-tab="reserve"><span class="li-ic qi blue">${ic('calendar')}</span><div class="li-b"><b>${esc(fac(r.facility_id))}</b><small>${esc(fmt.rel(r.date))} · ${esc(r.start_time)}–${esc(r.end_time)}</small></div>${badge(r.status)}</div>`).join('')}</div>` : ''}
    ${openReq.length ? `<div class="sec-title">Açık Taleplerim</div><div class="list">${openReq.map(r => `<div class="li" data-tab="requests"><span class="li-ic qi orange">${ic('wrench')}</span><div class="li-b"><b>${esc(r.title)}</b><small>${esc(r.category || '')} · ${esc(fmt.date(r.created_at))}</small></div>${badge(r.status)}</div>`).join('')}</div>` : ''}
    ${S.at ? `<p class="ver">Son güncelleme: ${esc(fmt.dt(localTs(S.at)))}</p>` : ''}`;
}
function longDate() { const d = new Date(); return `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}, ${['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'][d.getDay()]}`; }

function annCard(a, clamp) {
  const urgent = a.priority === 'Acil' || a.priority === 'Yüksek';
  return `<div class="ann ${a.pinned ? 'pinned' : ''} ${urgent ? 'urgent' : ''} ${clamp ? 'clamp' : ''}" data-act="ann-toggle">
    <h4>${a.pinned ? '📌 ' : ''}${esc(a.title)}</h4>
    <div class="meta"><span>${esc(fmt.date(a.publish_date))}</span>${a.category ? badge(a.category, 'blue') : ''}${urgent ? badge(a.priority, 'red') : ''}</div>
    ${a.body ? `<p>${esc(a.body)}</p>` : ''}</div>`;
}

// ---------------- HESABIM ----------------
function payInfoHtml() {
  const s = S.data.site || {}, u = S.data.unit || {};
  const ref = `${blk(u.block)} Daire ${u.no || ''} - ${(S.data.member || {}).full_name || ''}`;
  return `
    ${s.site_iban ? `<div class="muted small">${esc(s.site_bank || 'Banka hesabı')} · Alıcı: ${esc(s.site_name || '')}</div>
      <div class="iban">${esc(s.site_iban)}</div>
      <div class="row2"><button class="btn sm" data-copy="${esc(String(s.site_iban).replace(/\s/g, ''))}">${ic('copy')} IBAN Kopyala</button><button class="btn sm" data-copy="${esc(ref)}">${ic('copy')} Açıklamayı Kopyala</button></div>
      <p class="muted small" style="margin-top:10px">Havale/EFT açıklamasına mutlaka şunu yazın: <b>${esc(ref)}</b></p>`
      : `<p class="muted small">Banka bilgisi henüz tanımlanmamış. Ödeme için yönetimle iletişime geçin${s.site_phone ? ': <a href="tel:' + esc(s.site_phone) + '">' + esc(s.site_phone) + '</a>' : '.'}</p>`}`;
}
function accountView() {
  const d = S.data, u = d.unit || {};
  const led = d.ledger || [];
  const f = S.acctFilter;
  const list = led.filter(l => f === 'all' || (f === 'debt' ? l.kind === 'Tahakkuk' : l.kind === 'Tahsilat'));
  const year = String(new Date().getFullYear());
  const paidYear = led.filter(l => l.kind === 'Tahsilat' && String(l.date).startsWith(year)).reduce((s, l) => s + Number(l.amount), 0);
  const groups = {};
  for (const l of list) { const k = String(l.date || '').slice(0, 7) || 'Tarihsiz'; (groups[k] = groups[k] || []).push(l); }
  return `
    ${balanceCard()}
    <div class="card"><div class="kv"><span>Vadesi geçmiş</span><b class="${Number(u.overdue) > 0 ? 'amt-neg' : ''}">${fmt.money(u.overdue)}</b></div>
      <div class="kv"><span>${year} yılında ödenen</span><b class="amt-pos">${fmt.money(paidYear)}</b></div>
      <div class="kv"><span>Daire</span><b>${esc(unitName(u))}${u.area_m2 ? ' · ' + esc(u.area_m2) + ' m²' : ''}</b></div></div>
    ${onlinePaysCard()}
    <div class="card"><div class="card-h"><h3>${ic('cash')} ${payOn() ? 'Havale / EFT ile ödeme' : 'Ödeme Bilgileri'}</h3></div>${payInfoHtml()}</div>
    <div class="seg">${[['all', 'Tümü'], ['debt', 'Borçlar'], ['pay', 'Ödemeler']].map(([k, l]) => `<button data-acct="${k}" class="${f === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    ${list.length ? `<div class="list">${Object.entries(groups).map(([k, items]) => `<div class="month-h">${esc(k === 'Tarihsiz' ? k : fmt.month(k))}</div>${items.map(ledgerRow).join('')}`).join('')}</div>`
      : `<div class="empty">${ic('receipt')}<p>Kayıt bulunmuyor.</p></div>`}`;
}
function ledgerRow(l) {
  if (l.kind === 'Tahsilat') return `<div class="li" data-led="${esc(l.id)}"><span class="li-ic qi green">${ic('cash')}</span><div class="li-b"><b>Ödeme${l.method ? ' · ' + esc(l.method) : ''}</b><small>${esc(fmt.date(l.date))}${l.receipt_no ? ' · Makbuz ' + esc(l.receipt_no) : ''}</small></div><div class="li-r amt-pos">+${fmt.money(l.amount)}</div></div>`;
  const rem = Number(l.remaining) || 0;
  return `<div class="li" data-led="${esc(l.id)}"><span class="li-ic qi ${rem > 0.004 ? 'orange' : 'blue'}">${ic('receipt')}</span><div class="li-b"><b>${esc(l.type || 'Borç')}${l.period ? ' · ' + esc(fmt.period(l.period)) : ''}</b><small>${esc(l.description || ('Son ödeme: ' + fmt.date(l.date)))}</small></div>
    <div class="li-r">${fmt.money(l.amount)}<small>${rem > 0.004 ? (rem < Number(l.amount) - 0.004 ? badge('Kalan ' + fmt.money(rem), 'red') : badge('Ödenmedi', 'red')) : badge('Ödendi', 'green')}</small></div></div>`;
}
function ledgerDetail(id) {
  const l = (S.data.ledger || []).find(x => String(x.id) === String(id)); if (!l) return;
  const rows = l.kind === 'Tahsilat'
    ? [['İşlem', 'Ödeme'], ['Tarih', fmt.date(l.date)], ['Tutar', fmt.money(l.amount)], ['Ödeme şekli', l.method], ['Makbuz no', l.receipt_no], ['Açıklama', l.description]]
    : [['İşlem', 'Borçlandırma (' + (l.type || '') + ')'], ['Dönem', fmt.period(l.period)], ['Son ödeme tarihi', fmt.date(l.date)], ['Tutar', fmt.money(l.amount)], ['Ödenen', fmt.money(Number(l.amount) - Number(l.remaining || 0))], ['Kalan', fmt.money(l.remaining)], ['Açıklama', l.description]];
  Sheet.open(`<h3>İşlem Detayı</h3>${rows.filter(r => r[1]).map(([k, v]) => `<div class="kv"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}<button class="btn block" style="margin-top:16px" data-close>Kapat</button>`);
}

// ---------------- TALEPLER ----------------
const REQ_CATS = ['Arıza', 'Şikayet', 'Talep', 'Öneri', 'Temizlik', 'Güvenlik', 'Gürültü', 'Otopark'];
function requestsView() {
  const list = S.data.requests || [];
  return `<button class="btn primary block" data-act="newreq" style="margin-bottom:14px">${ic('plus')} Yeni Arıza / Talep Bildir</button>
    ${list.length ? list.map(r => `<div class="item">
      <div class="item-h"><b>${esc(r.title)}</b>${badge(r.status)}</div>
      <div class="meta">${esc([r.category, r.location, fmt.dt(r.created_at)].filter(Boolean).join(' · '))}</div>
      ${r.description ? `<p>${esc(r.description)}</p>` : ''}
      ${r.resolution ? `<div class="res"><b>Yönetim:</b> ${esc(r.resolution)}${r.resolved_at ? ` <small>(${esc(fmt.date(r.resolved_at))})</small>` : ''}</div>` : ''}
      ${r.status === 'Gönderildi' ? `<div class="meta" style="margin-top:8px">⏳ Yönetime iletildi, kısa süre içinde işleme alınacak.</div>` : ''}
    </div>`).join('') : `<div class="empty">${ic('wrench')}<p>Henüz bir talebiniz yok.<br>Arıza, şikayet veya önerilerinizi buradan iletebilirsiniz.</p></div>`}`;
}
function newRequestSheet() {
  let cat = 'Arıza', pri = 'Normal';
  Sheet.open(`<h3>Arıza / Talep Bildir</h3>
    <form id="reqForm">
      <div class="fld"><label>Kategori</label><div class="chips" data-chips="cat">${REQ_CATS.map(c => `<button type="button" class="chip ${c === cat ? 'on' : ''}" data-v="${c}">${c}</button>`).join('')}</div></div>
      <div class="fld"><label>Başlık</label><input name="title" maxlength="150" placeholder="Örn: Mutfak lavabosu su sızdırıyor" required></div>
      <div class="fld"><label>Konum</label><input name="location" list="locs" placeholder="Örn: Daire içi, asansör, otopark"><datalist id="locs">${['Daire içi', 'Asansör', 'Otopark', 'Bahçe', 'Giriş / Lobi', 'Merdiven', 'Çatı', 'Çocuk Parkı', 'Havuz', 'Spor Salonu'].map(x => `<option value="${x}">`).join('')}</datalist></div>
      <div class="fld"><label>Açıklama</label><textarea name="description" maxlength="2000" placeholder="Sorunu kısaca anlatın…"></textarea></div>
      <div class="fld"><label>Öncelik</label><div class="chips" data-chips="pri">${['Normal', 'Yüksek', 'Acil'].map(c => `<button type="button" class="chip ${c === pri ? 'on' : ''}" data-v="${c}">${c}</button>`).join('')}</div></div>
      <button class="btn primary block" type="submit">${ic('check')} Gönder</button>
    </form>`, (sh) => {
    sh.querySelectorAll('[data-chips]').forEach(g => g.addEventListener('click', (e) => {
      const b = e.target.closest('.chip'); if (!b) return;
      g.querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === b));
      if (g.dataset.chips === 'cat') cat = b.dataset.v; else pri = b.dataset.v;
    }));
    const f = sh.querySelector('#reqForm');
    f.onsubmit = async (e) => {
      e.preventDefault();
      if (f.title.value.trim().length < 3) return toast('Lütfen kısa bir başlık yazın.', 'error');
      const b = f.querySelector('[type=submit]'); b.disabled = true; b.textContent = 'Gönderiliyor…';
      try {
        await call('member_new_request', { p_title: f.title.value, p_category: cat, p_location: f.location.value, p_description: f.description.value, p_priority: pri });
        Sheet.close(); toast('Talebiniz yönetime iletildi ✓');
        if (S.view !== 'requests') go('requests', true);
        refresh(true);
      } catch (err) { toast(err.message, 'error'); b.disabled = false; b.textContent = 'Gönder'; }
    };
  });
}

// ---------------- REZERVASYON ----------------
function facHours(f) { return { open: f.open_time || '08:00', close: f.close_time || '22:00' }; }
function reserveView() {
  const d = S.data, facs = d.facilities || [];
  if (!facs.length) return `<div class="empty">${ic('calendar')}<p>Rezervasyona açık ortak alan bulunmuyor.</p></div>` + myReservations();
  const R = S.rsv;
  if (!R.fac || !facs.some(f => f.id === R.fac)) R.fac = facs[0].id;
  const f = facs.find(x => x.id === R.fac);
  const { open, close } = facHours(f);
  const days = []; for (let i = 0; i < 14; i++) days.push(addDays(today(), i));
  if (!days.includes(R.date)) R.date = days[0];
  const slots = buildSlots(f, R.date);
  const sel = R.a != null ? `${slots[R.a].s} – ${slots[R.b].e}` : '';
  return `
    <div class="sec-title" style="margin-top:0">Ortak Alan</div>
    <div class="fac-scroll">${facs.map(x => { const h = facHours(x); return `<div class="fac-card ${x.id === R.fac ? 'on' : ''}" data-fac="${x.id}"><b>${esc(x.name)}</b><small>${esc(h.open)}–${esc(h.close)}${x.capacity ? ' · ' + esc(x.capacity) + ' kişi' : ''}</small></div>`; }).join('')}</div>
    <div class="card" style="padding:12px 14px">
      <div class="kv"><span>Çalışma saatleri</span><b>${esc(open)} – ${esc(close)}</b></div>
      <div class="kv"><span>Ücret</span><b>${Number(f.fee) > 0 ? fmt.money(f.fee) : 'Ücretsiz'}</b></div>
      ${f.max_hours ? `<div class="kv"><span>En fazla süre</span><b>${esc(f.max_hours)} saat</b></div>` : ''}
    </div>
    ${f.rules ? `<div class="rules">📋 ${esc(f.rules)}</div>` : ''}
    <div class="sec-title">Tarih</div>
    <div class="days">${days.map(x => { const dd = new Date(x + 'T00:00'); return `<div class="day ${x === R.date ? 'on' : ''}" data-day="${x}"><small>${x === today() ? 'Bugün' : DAY3[dd.getDay()]}</small><b>${dd.getDate()}</b></div>`; }).join('')}</div>
    <div class="sec-title">Saat <span style="text-transform:none;font-weight:500">— başlangıç saatine, sonra bitiş saatine dokunun</span></div>
    <div class="legend"><span><i></i>Boş</span><span><i class="b"></i>Dolu</span><span><i class="s"></i>Seçili</span></div>
    ${slots.length ? `<div class="slots">${slots.map((s, i) => `<button class="slot ${s.busy ? 'busy' : ''} ${s.past ? 'past' : ''} ${R.a != null && i >= R.a && i <= R.b ? 'sel' : ''}" data-slot="${i}" ${s.busy || s.past ? 'disabled' : ''}>${s.s}</button>`).join('')}</div>` : '<p class="muted small">Bu alan için saat aralığı tanımlı değil.</p>'}
    ${sel ? `<div class="selbar">Seçilen: ${esc(fmt.rel(R.date))}, ${esc(sel)} (${R.b - R.a + 1} saat)</div>` : ''}
    <form id="rsvForm">
      <div class="row2">
        <div class="fld"><label>Kişi sayısı</label><input name="guests" type="number" inputmode="numeric" min="1" ${f.capacity ? `max="${esc(f.capacity)}"` : ''} value="1"></div>
        <div class="fld"><label>Not (isteğe bağlı)</label><input name="notes" maxlength="200" placeholder="Örn: doğum günü"></div>
      </div>
      <button class="btn primary block" type="submit" ${sel ? '' : 'disabled'}>${ic('check')} Rezervasyon Talebi Gönder</button>
      <p class="muted small center" style="margin-top:8px">Talebiniz yönetim onayından sonra kesinleşir.</p>
    </form>
    ${myReservations()}`;
}
function buildSlots(f, date) {
  const { open, close } = facHours(f);
  const busy = (S.data.busy || []).filter(b => b.facility_id === f.id && b.date === date);
  const out = [];
  const nowM = toMin(nowTime());
  for (let m = toMin(open); m + 60 <= toMin(close); m += 60) {
    const s = fromMin(m), e = fromMin(m + 60);
    out.push({ s, e, busy: busy.some(b => b.start < e && b.end > s), past: date === today() && m <= nowM });
  }
  return out;
}
function onSlot(i) {
  const R = S.rsv, f = (S.data.facilities || []).find(x => x.id === R.fac);
  const slots = buildSlots(f, R.date);
  const max = Number(f.max_hours) || 24;
  if (R.a != null && R.a === R.b && R.a === i) { R.a = R.b = null; }
  else if (R.a != null && R.a === R.b && i > R.a) {
    const ok = slots.slice(R.a, i + 1).every(s => !s.busy && !s.past);
    if (!ok) { toast('Seçtiğiniz aralıkta dolu saat var.', 'error'); return; }
    if (i - R.a + 1 > max) { toast(`Bu alan için en fazla ${max} saat seçebilirsiniz.`, 'error'); return; }
    R.b = i;
  } else { R.a = R.b = i; }
  render();
}
function myReservations() {
  const d = S.data, td = today();
  const list = (d.reservations || []).slice().sort((a, b) => (b.date + b.start_time).localeCompare(a.date + a.start_time));
  const fac = (id) => ((d.facilities || []).find(f => f.id === id) || {}).name || 'Ortak alan';
  if (!list.length) return '';
  return `<div class="sec-title">Rezervasyonlarım</div>${list.map(r => `<div class="item">
    <div class="item-h"><b>${esc(fac(r.facility_id))}</b>${badge(r.status)}</div>
    <div class="meta">${esc(fmt.rel(r.date))} · ${esc(r.start_time)}–${esc(r.end_time)}${r.guests ? ' · ' + esc(r.guests) + ' kişi' : ''}</div>
    ${r.notes ? `<p>${esc(r.notes)}</p>` : ''}
    ${r.date >= td && r.status !== 'İptal' ? `<div class="acts"><button class="btn sm danger" data-cancel-rsv="${r.kind}:${r.id}">İptal Et</button></div>` : ''}
  </div>`).join('')}`;
}

// ---------------- DİĞER ----------------
function moreView() {
  const d = S.data, m = d.member || {}, u = d.unit || {};
  const cargo = (d.cargo || []).filter(c => !c.delivered_at).length;
  const li = (go, icn, color, title, sub, extra = '') => `<div class="li" ${go}><span class="li-ic qi ${color}">${ic(icn)}</span><div class="li-b"><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</div>${extra}${ic('chev', 'chev')}</div>`;
  return `
    <div class="card profile-head" data-go="profile" style="cursor:pointer"><div class="avatar">${esc((m.full_name || '?').slice(0, 1))}</div><b>${esc(m.full_name)}</b><div class="muted small">${esc(unitName(u))} · ${esc(fmt.phone(m.phone))}</div></div>
    <div class="list">
      ${li('data-go="ann"', 'megaphone', 'purple', 'Duyurular', `${(d.announcements || []).length} duyuru`)}
      ${li('data-go="cargo"', 'package', 'teal', 'Kargolarım', cargo ? `${cargo} kargo teslim alınmayı bekliyor` : 'Bekleyen kargo yok', cargo ? badge(String(cargo), 'red') : '')}
      ${li('data-go="visitors"', 'guest', 'green', 'Ziyaretçi Bildirimi', 'Misafirinizi güvenliğe önceden bildirin')}
      ${S.data.polls === undefined ? '' : li('data-go="polls"', 'poll', 'purple', 'Anketler', pendingPolls().length ? `${pendingPolls().length} anket oyunuzu bekliyor` : 'Site anketlerine oy verin', pendingPolls().length ? badge(String(pendingPolls().length), 'red') : '')}
      ${li('data-go="meetings"', 'gavel', 'blue', 'Toplantılar & Kararlar', 'Genel kurul ve yönetim kararları')}
      ${li('data-go="contacts"', 'phone', 'red', 'Önemli Telefonlar', 'Yönetim, güvenlik, acil durum')}
      ${li('data-act="pay"', 'cash', 'green', 'Ödeme Bilgileri', 'IBAN ve açıklama')}
    </div>
    <div class="list">
      ${li('data-go="profile"', 'lock', 'blue', 'Profil, Bildirimler & Gizlilik', 'Şifre, anlık bildirimler, kişisel veriler')}
      ${!isStandalone() ? li('data-act="install"', 'download', 'purple', 'Uygulamayı Ana Ekrana Ekle', 'Tek dokunuşla açın') : ''}
      ${li('data-act="logout"', 'logout', 'red', 'Çıkış Yap', '')}
    </div>
    ${siteContact()}
    <p class="ver">Site Yönetim Mobil v${APP_VERSION}</p>`;
}
function siteContact() {
  const s = S.data.site || {};
  if (!s.site_phone && !s.site_address && !s.site_email) return '';
  return `<div class="card"><div class="card-h"><h3>${ic('building')} Site Yönetimi</h3></div>
    ${s.manager_name ? `<div class="kv"><span>Yönetici</span><b>${esc(s.manager_name)}</b></div>` : ''}
    ${s.site_phone ? `<div class="kv"><span>Telefon</span><b><a href="tel:${esc(s.site_phone)}">${esc(s.site_phone)}</a></b></div>` : ''}
    ${s.site_email ? `<div class="kv"><span>E-posta</span><b><a href="mailto:${esc(s.site_email)}">${esc(s.site_email)}</a></b></div>` : ''}
    ${s.site_address ? `<div class="kv"><span>Adres</span><b>${esc(s.site_address)}</b></div>` : ''}</div>`;
}
function annView() {
  const list = S.data.announcements || [];
  return list.length ? list.map(a => annCard(a, false)).join('') : `<div class="empty">${ic('megaphone')}<p>Yayında duyuru bulunmuyor.</p></div>`;
}
function cargoView() {
  const list = S.data.cargo || [];
  const wait = list.filter(c => !c.delivered_at), done = list.filter(c => c.delivered_at);
  const row = (c) => `<div class="li"><span class="li-ic qi ${c.delivered_at ? 'green' : 'purple'}">${ic('package')}</span><div class="li-b"><b>${esc(c.company || 'Kargo')}${c.package_type ? ' · ' + esc(c.package_type) : ''}</b><small>${c.delivered_at ? `Teslim: ${esc(fmt.dt(c.delivered_at))}${c.delivered_to ? ' · ' + esc(c.delivered_to) : ''}` : `Geliş: ${esc(fmt.dt(c.arrived_at))}${c.recipient ? ' · ' + esc(c.recipient) : ''}`}</small></div>${c.delivered_at ? badge('Teslim Edildi', 'green') : badge('Sizi Bekliyor', 'orange')}</div>`;
  if (!list.length) return `<div class="empty">${ic('package')}<p>Kargo kaydı bulunmuyor.</p></div>`;
  return `${wait.length ? `<div class="alert purple">${ic('package')}<div><b>${wait.length} kargonuz yönetim ofisinde</b>Kimliğinizle teslim alabilirsiniz.</div></div><div class="list">${wait.map(row).join('')}</div>` : ''}
    ${done.length ? `<div class="sec-title">Son 30 gün teslim edilenler</div><div class="list">${done.map(row).join('')}</div>` : ''}`;
}
function visitorsView() {
  const list = S.data.visitors || [];
  const qr = S.data.push !== undefined;
  const row = (v) => {
    const pi = v.qr_token ? passInfo(v) : null;
    const st = pi ? (v.status === 'İptal' ? badge('İptal') : pi.expired ? badge('Süresi doldu', 'gray') : pi.spent ? badge('Kullanıldı', 'green') : v.status === 'Geldi' ? badge('Geldi · geçerli', 'green') : badge('Geçerli', 'blue')) : badge(v.status);
    return `<div class="item"><div class="item-h"><b>${esc(v.guest_name)}</b>${st}</div>
      <div class="meta">${pi ? '🎫 ' + esc(pi.range) + ' · ' + esc(pi.uses) + (pi.max !== 1 && pi.used ? ` (${pi.used} giriş)` : '') : esc(fmt.rel(v.expected_date))}${v.plate ? ' · 🚗 ' + esc(v.plate) : ''}${v.phone ? ' · ' + esc(v.phone) : ''}</div>${v.notes ? `<p>${esc(v.notes)}</p>` : ''}
      <div class="acts">${pi && pi.valid ? `<button class="btn sm primary" data-pass="${v.id}">${ic('qr')} Kartı Göster / Gönder</button>` : ''}${(v.status === 'Bekleniyor' || (pi && pi.valid)) ? `<button class="btn sm danger" data-cancel-vis="${v.id}">İptal Et</button>` : ''}</div></div>`;
  };
  return `<button class="btn primary block" data-act="newvis" style="margin-bottom:10px">${ic('plus')} ${qr ? 'Misafir Kartı Oluştur' : 'Misafir / Ziyaretçi Bildir'}</button>
    <p class="muted small" style="margin:0 4px 14px">${qr ? 'Misafiriniz için <b>QR\'lı giriş kartı</b> oluşturun ve WhatsApp ile gönderin. Kapıda kartı okutunca girişi kaydedilir, size bildirim gelir.' : 'Bildirdiğiniz misafirler güvenlik/kapı görevlisinin ekranına düşer; girişte bekletilmezler.'}</p>
    ${list.length ? list.map(row).join('') : `<div class="empty">${ic('guest')}<p>Bildirilmiş ziyaretçi yok.</p></div>`}`;
}
function newVisitorSheet() {
  const qr = S.data.push !== undefined;   // bulut 1.8: QR misafir kartı
  Sheet.open(`<h3>${qr ? 'Misafir Kartı Oluştur' : 'Ziyaretçi Bildir'}</h3><form id="visForm">
    <div class="fld"><label>Ziyaretçinin Adı Soyadı</label><input name="name" maxlength="100" required></div>
    ${qr ? `<div class="row2"><div class="fld"><label>Geçerlilik</label><select name="days"><option value="1">Yalnızca o gün</option><option value="2">2 gün</option><option value="3">3 gün</option><option value="7">1 hafta</option></select></div>
    <div class="fld"><label>Giriş hakkı</label><select name="multi"><option value="0">Tek giriş</option><option value="1">Sınırsız (süre boyunca)</option></select></div></div>` : ''}
    <div class="row2"><div class="fld"><label>${qr ? 'Başlangıç Tarihi' : 'Geliş Tarihi'}</label><input name="date" type="date" min="${today()}" value="${today()}" required></div>
    <div class="fld"><label>Araç Plakası</label><input name="plate" maxlength="20" placeholder="06 ABC 123" autocapitalize="characters"></div></div>
    <div class="fld"><label>Telefon (isteğe bağlı)</label><input name="phone" type="tel" maxlength="20"></div>
    <div class="fld"><label>Not (isteğe bağlı)</label><input name="notes" maxlength="200" placeholder="Örn: akşam 19:00 civarı, 3 kişi"></div>
    <button class="btn primary block" type="submit">${qr ? ic('qr') + ' Kartı Oluştur' : ic('check') + ' Bildir'}</button></form>`, (sh) => {
    const f = sh.querySelector('#visForm');
    f.onsubmit = async (e) => {
      e.preventDefault();
      const b = f.querySelector('[type=submit]'); b.disabled = true;
      try {
        const args = { p_name: f.name.value, p_phone: f.phone.value, p_plate: f.plate.value, p_date: f.date.value, p_notes: f.notes.value };
        if (qr) { args.p_days = Number(f.days.value) || 1; args.p_multi = f.multi.value === '1'; }
        const r = await call('member_new_visitor', args);
        Sheet.close();
        if (S.view !== 'visitors') go('visitors');
        if (r && r.token) {
          const v = { id: r.id, guest_name: f.name.value.trim(), plate: f.plate.value.trim(), phone: f.phone.value, expected_date: f.date.value, valid_until: r.valid_until, max_uses: args.p_multi ? 0 : 1, used_count: 0, status: 'Bekleniyor', qr_token: r.token };
          (S.data.visitors = S.data.visitors || []).unshift(v);
          render(); passSheet(v, true);
        } else toast('Ziyaretçiniz güvenliğe bildirildi ✓');
        refresh(true);
      } catch (err) { toast(err.message, 'error'); b.disabled = false; }
    };
  });
}
// ---------------- KARTLA ÖDEME (v1.6.0) ----------------
// Kart numarası ve CVV yalnızca bu ekranda (bellekte) tutulur; buluta / yerel depoya ASLA gönderilmez.
// Buluta yalnızca maskeli bilgi gider: marka, son 4 hane, son kullanma, kart sahibinin adı.
function payOn() { const p = S.data && S.data.pay; return !!(p && p.enabled); }
function payPreview() { const p = S.data && S.data.pay; return !!(p && (p.mode === 'preview' || p.provider === 'onizleme')); }
// 1.6.1: canlı ödeme akışı — 'hosted' (kuruluşun/bankanın güvenli sayfası) | 'card' (uygulama içi kart formu → doğrudan PayTR)
function payFlow() { const p = (S.data && S.data.pay) || {}; return payPreview() ? 'preview' : p.flow === 'card' ? 'card' : 'hosted'; }
function payStatus(o) {
  if (o.status === 'Önizleme') return badge('Önizleme', 'orange');
  if (o.status === 'Ödendi') return o.imported ? badge('Tahsil edildi', 'green') : badge('Alındı · işleniyor', 'green');
  if (o.status === 'Başarısız') return badge('Başarısız', 'red');
  if (o.status === 'Yarım kaldı') return badge('Yarım kaldı', 'gray');
  return badge('Bekliyor', 'orange');
}
const Card = {
  brand(n) {
    n = String(n || '').replace(/\D/g, '');
    if (/^4/.test(n)) return 'Visa';
    if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(n)) return 'Mastercard';
    if (/^3[47]/.test(n)) return 'American Express';
    if (/^(9792|65)/.test(n)) return 'Troy';
    return n.length >= 2 ? 'Kart' : '';
  },
  luhn(n) { let s = 0, alt = false; for (let i = n.length - 1; i >= 0; i--) { let d = +n[i]; if (alt) { d *= 2; if (d > 9) d -= 9; } s += d; alt = !alt; } return s % 10 === 0; },
  fmt(n) { const d = String(n || '').replace(/\D/g, '').slice(0, 19); return Card.brand(d) === 'American Express' ? d.replace(/^(\d{0,4})(\d{0,6})(\d{0,5}).*/, (m, a, b, c) => [a, b, c].filter(Boolean).join(' ')) : d.replace(/(\d{4})(?=\d)/g, '$1 '); },
  expired(m, y) { if (!m || !y) return false; y = y < 100 ? 2000 + y : y; const n = new Date(); return y < n.getFullYear() || (y === n.getFullYear() && m < n.getMonth() + 1); },
  label(c) { return `${c.brand} •••• ${c.last4}`; },
  exp(c) { return c.exp_month ? `${String(c.exp_month).padStart(2, '0')}/${String(c.exp_year).slice(-2)}` : '—'; },
  logo(b) { return `<span class="cbrand ${({ Visa: 'visa', Mastercard: 'mc', Troy: 'troy', 'American Express': 'amex' })[b] || ''}">${b === 'Mastercard' ? '<i></i><i></i>' : esc(b === 'American Express' ? 'AMEX' : (b || 'KART').toUpperCase())}</span>`; },
  // form → doğrulanmış maskeli kart (hata varsa {err})
  read(f) {
    const num = String(f.cc.value || '').replace(/\D/g, ''), br = Card.brand(num);
    const holder = String(f.holder.value || '').trim().replace(/\s+/g, ' ');
    const m = /^(\d{1,2})\s*\/?\s*(\d{2}|\d{4})$/.exec(String(f.exp.value || '').trim());
    const cvv = String(f.cvv.value || '').replace(/\D/g, '');
    if (num.length < 15 || num.length > 19 || !Card.luhn(num)) return { err: 'Kart numarası hatalı. Lütfen kontrol edin.', field: 'cc' };
    if (holder.length < 3) return { err: 'Kart üzerindeki adı yazın.', field: 'holder' };
    if (!m || +m[1] < 1 || +m[1] > 12) return { err: 'Son kullanma tarihini AA/YY biçiminde yazın (örn. 08/28).', field: 'exp' };
    const mo = +m[1], yr = m[2].length === 2 ? 2000 + +m[2] : +m[2];
    if (Card.expired(mo, yr)) return { err: 'Kartın son kullanma tarihi geçmiş.', field: 'exp' };
    if (cvv.length !== (br === 'American Express' ? 4 : 3)) return { err: `Güvenlik kodu (CVV) ${br === 'American Express' ? 4 : 3} haneli olmalı.`, field: 'cvv' };
    return { card: { brand: br, last4: num.slice(-4), exp_month: mo, exp_year: yr, holder } };
  },
  formHtml(opts) {
    const p = S.data.pay || {};
    return `<div class="ccard" data-ccprev><div class="cc-top"><span class="cc-chip"></span><span data-ccbrand>${Card.logo('')}</span></div>
        <div class="cc-num" data-ccnum>•••• •••• •••• ••••</div>
        <div class="cc-bot"><div><small>KART SAHİBİ</small><b data-ccname>AD SOYAD</b></div><div><small>SON KUL.</small><b data-ccexp>AA/YY</b></div></div></div>
      <div class="fld"><label>Kart numarası</label><input name="cc" inputmode="numeric" autocomplete="cc-number" placeholder="0000 0000 0000 0000" maxlength="23" required></div>
      <div class="fld"><label>Kart üzerindeki ad soyad</label><input name="holder" autocomplete="cc-name" autocapitalize="characters" placeholder="AD SOYAD" maxlength="60" required></div>
      <div class="row2 cc-row"><div class="fld"><label>Son kullanma (AA/YY)</label><input name="exp" inputmode="numeric" autocomplete="cc-exp" placeholder="08/28" maxlength="7" required></div>
        <div class="fld"><label>Güvenlik kodu (CVV)</label><input name="cvv" type="password" inputmode="numeric" autocomplete="cc-csc" placeholder="•••" maxlength="4" required></div></div>
      ${opts.saveOpt && p.save ? `<label class="chk-row"><input type="checkbox" name="save" ${opts.saveDefault ? 'checked' : ''}><span><b>Kartımı kaydet</b><small>Sonraki ödemelerde kart bilgisi girmeden ödeyin.</small></span></label>` : ''}
      ${opts.autoOpt && p.auto ? `<label class="chk-row"><input type="checkbox" name="auto"><span><b>Aidatlarım bu karttan otomatik ödensin</b><small>Yeni aidat tahakkuk edildiğinde borcunuz bu karttan çekilir; size bildirim gelir. İstediğiniz zaman kapatabilirsiniz.</small></span></label>` : ''}`;
  },
  bind(f) {
    const q = (k) => f.closest('.sheet').querySelector(k);
    const upd = () => {
      const n = String(f.cc.value).replace(/\D/g, ''), br = Card.brand(n);
      q('[data-ccnum]').textContent = n ? Card.fmt(n) : '•••• •••• •••• ••••';
      q('[data-ccbrand]').innerHTML = Card.logo(br);
      q('[data-ccname]').textContent = (f.holder.value || 'AD SOYAD').toLocaleUpperCase('tr-TR');
      q('[data-ccexp]').textContent = f.exp.value || 'AA/YY';
      q('[data-ccprev]').className = 'ccard ' + (({ Visa: 'visa', Mastercard: 'mc', Troy: 'troy', 'American Express': 'amex' })[br] || '');
      f.cvv.maxLength = br === 'American Express' ? 4 : 3;
    };
    f.cc.addEventListener('input', () => { const p0 = f.cc.selectionStart, before = f.cc.value.length; f.cc.value = Card.fmt(f.cc.value); if (p0 != null && p0 < before) try { f.cc.setSelectionRange(p0, p0); } catch { } upd(); });
    f.exp.addEventListener('input', (e) => { let v = f.exp.value.replace(/[^\d]/g, '').slice(0, 4); if (v.length >= 3) v = v.slice(0, 2) + '/' + v.slice(2); else if (v.length === 2 && e.inputType !== 'deleteContentBackward') v += '/'; f.exp.value = v; upd(); });
    f.holder.addEventListener('input', upd); f.cvv.addEventListener('input', () => { f.cvv.value = f.cvv.value.replace(/\D/g, ''); });
    if (f.save && f.auto) { const s2 = () => { f.auto.disabled = !f.save.checked; if (!f.save.checked) f.auto.checked = false; }; f.save.addEventListener('change', s2); s2(); }
    upd();
  },
  wipe(f) { ['cc', 'cvv', 'exp', 'holder'].forEach(k => { if (f[k]) f[k].value = ''; }); }
};
function payAmount() {
  // 1.6.1: ödenmiş ama yönetim eşitlemesiyle henüz tahsilata dönüşmemiş kart ödemeleri borçtan düşülür (sunucu da aynı hesabı yapar)
  const paidNew = (S.data.online_payments || []).filter(o => o.status === 'Ödendi' && !o.imported).reduce((t, o) => t + (Number(o.amount) || 0), 0);
  const bal = Math.max(0, Math.round(((Number((S.data.unit || {}).balance) || 0) - paidNew) * 100) / 100), p = S.data.pay || {};
  const min = Math.min(Math.max(1, Number(p.min) || 1), bal), X = S.payx = S.payx || { mode: 'all', custom: '', card: null };
  let amt = X.mode === 'half' ? Math.round(bal / 2 * 100) / 100 : X.mode === 'custom' ? Math.round(Number(String(X.custom).replace(',', '.')) * 100) / 100 : bal;
  if (!(amt > 0)) amt = 0;
  return { bal, min, amt, ok: amt >= min - 0.001 && amt <= bal + 0.001 };
}
function payView() {
  if (!payOn()) return `<div class="empty">${ic('card')}<p>Kartla ödeme bu dairede henüz açık değil.</p><button class="btn" data-tab="account">Hesabım</button></div>`;
  const d = S.data, p = d.pay || {}, cards = d.cards || [], X = S.payx = S.payx || { mode: 'all', custom: '', card: null };
  const { bal, min, amt, ok } = payAmount();
  const usable = cards.filter(c => !Card.expired(c.exp_month, c.exp_year));
  if (X.card !== 'new' && !usable.some(c => c.id === X.card)) X.card = usable.length ? (usable.find(c => c.auto_pay) || usable[0]).id : 'new';
  const auto = cards.find(c => c.auto_pay);
  const list = (d.online_payments || []).slice(0, 6);
  return `
    ${payPreview() ? `<div class="alert orange pay-prev">${ic('info')}<div><b>Önizleme</b>Kartla ödeme deneme aşamasında. Deneyebilirsiniz ama <u>kartınızdan para çekilmez</u> ve borcunuz düşmez.</div></div>`
      : p.test ? `<div class="alert orange pay-prev">${ic('info')}<div><b>Test modu</b>Ödeme sistemi deneniyor; yalnızca kuruluşun test kartları çalışır, gerçek para çekilmez.</div></div>` : ''}
    <div class="pay-hero"><span>Güncel borcunuz</span><b>${fmt.money(bal)}</b>${Number((d.unit || {}).overdue) > 0.004 ? `<small>⚠ ${fmt.money(d.unit.overdue)} vadesi geçmiş</small>` : ''}</div>
    ${bal > 0.004 ? `
    <div class="card"><div class="card-h"><h3>Ödenecek tutar</h3></div>
      <div class="seg">${[['all', 'Tamamı'], ...(bal >= 2 * min ? [['half', 'Yarısı']] : []), ['custom', 'Başka tutar']].map(([k, l]) => `<button data-pamt="${k}" class="${X.mode === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${X.mode === 'custom' ? `<div class="fld" style="margin-top:10px"><input data-pcustom type="number" inputmode="decimal" step="0.01" min="${min}" max="${bal}" value="${esc(X.custom)}" placeholder="Tutar (₺)"><small class="muted">En az ${fmt.money(min)}, en fazla ${fmt.money(bal)}</small></div>` : ''}
    </div>
    ${!payPreview() && !(p.save && usable.length) ? '' : `<div class="card"><div class="card-h"><h3>Kart</h3>${p.save && payPreview() ? `<a data-act="cardadd">+ Kart ekle</a>` : ''}</div>
      <div class="pcards">${usable.map(c => `<button class="pcard ${X.card === c.id ? 'on' : ''}" data-pcard="${c.id}">${Card.logo(c.brand)}<span class="pc-b"><b>•••• ${esc(c.last4)}</b><small>${esc(c.holder || '')} · ${Card.exp(c)}</small></span>${c.auto_pay ? badge('Otomatik', 'green') : ''}<i class="radio"></i></button>`).join('')}
        <button class="pcard ${X.card === 'new' ? 'on' : ''}" data-pcard="new"><span class="cbrand new">${ic('plus')}</span><span class="pc-b"><b>Yeni kart ile öde</b><small>${payFlow() === 'hosted' ? 'Kart bilgileri güvenli ödeme sayfasında girilir' : 'Kredi veya banka kartı'}</small></span><i class="radio"></i></button></div>
    </div>`}
    <button class="btn primary block pay-go" data-act="paygo" ${ok ? '' : 'disabled'}>${ic('lock')} ${ok ? fmt.money(amt) + ' Öde' : 'Tutarı kontrol edin'}</button>
    <p class="muted small center pay-sec">${ic('lock')} Ödemeler 3D Secure ile korunur${!payPreview() && p.label ? ' · ' + esc(p.label) + ' güvencesiyle' : ''}. Kart numaranız ve CVV kodunuz siteye ve uygulamaya kaydedilmez.</p>`
    : `<div class="card center"><p>Ödenecek borcunuz bulunmuyor. ✓</p></div>`}
    ${p.auto ? `<div class="card auto-card"><div class="card-h"><h3>${ic('refresh')} Otomatik ödeme</h3>${auto ? badge('Açık', 'green') : badge('Kapalı', 'gray')}</div>
      ${auto ? `<p class="small">Yeni aidat tahakkuk edildiğinde borcunuz <b>${esc(Card.label(auto))}</b> kartınızdan otomatik ödenir. Her çekimden sonra bildirim alırsınız.${Card.expired(auto.exp_month, auto.exp_year) ? ' <b class="amt-neg">Kartın süresi dolmuş, lütfen yeni kart ekleyin.</b>' : ''}</p>
        <button class="btn sm" data-cardauto="${auto.id}" data-on="0" style="margin-top:8px">Otomatik ödemeyi kapat</button>`
      : `<p class="small muted">Aidatlarınızı her ay hatırlamanıza gerek kalmaz: kayıtlı bir kartı seçip otomatik ödemeyi açın; yeni aidat tahakkuk edildiğinde borcunuz o karttan çekilir.</p>
        ${usable.length ? `<div class="row2" style="margin-top:8px">${usable.slice(0, 2).map(c => `<button class="btn sm" data-cardauto="${c.id}" data-on="1">${esc(Card.label(c))} ile aç</button>`).join('')}</div>`
          : !payPreview() ? `<p class="small" style="margin-top:8px">${ic('info')} Kartınız ilk ödemenizde kaydedilir: ödeme yaparken <b>“Kartımı kaydet”</b> ve <b>“Aidatlarım bu karttan otomatik ödensin”</b> seçeneklerini işaretleyin.</p>`
          : p.save ? `<button class="btn sm" data-act="cardadd" data-auto="1" style="margin-top:8px">+ Kart ekle ve otomatik ödemeyi aç</button>` : ''}`}
    </div>` : ''}
    ${cards.length ? `<div class="sec-title">Kayıtlı kartlarım</div><div class="list">${cards.map(c => `<div class="li">${Card.logo(c.brand)}<div class="li-b"><b>${esc(Card.label(c))}</b><small>${esc(c.holder || '')} · Son kul. ${Card.exp(c)}${Card.expired(c.exp_month, c.exp_year) ? ' · süresi doldu' : ''}</small></div>${c.auto_pay ? badge('Otomatik', 'green') : ''}<button class="icon-btn" data-carddel="${c.id}" aria-label="Kartı sil">${ic('trash')}</button></div>`).join('')}</div>` : ''}
    ${list.length ? `<div class="sec-title">Son kart ödemelerim</div><div class="list">${list.map(o => `<div class="li"><span class="li-ic qi green">${ic('card')}</span><div class="li-b"><b>${fmt.money(o.amount)}${o.kind === 'Otomatik' ? ' · Otomatik' : ''}</b><small>${esc(fmt.dt(localTs(o.paid_at || o.created_at)))}${o.card ? ' · ' + esc(o.card) : ''}${o.error ? ' · ' + esc(o.error) : ''}</small></div>${payStatus(o)}</div>`).join('')}</div>` : ''}
    <p class="muted small center" style="margin-top:14px">Havale / EFT ile ödemek için <a data-act="pay">banka bilgileri</a>.</p>`;
}
function onlinePaysCard() {
  if (!payOn()) return '';
  const bal = Number((S.data.unit || {}).balance) || 0, auto = (S.data.cards || []).find(c => c.auto_pay);
  return `<div class="card"><div class="card-h"><h3>${ic('card')} Kartla Ödeme</h3>${payPreview() ? badge('Önizleme', 'orange') : ''}</div>
    <p class="muted small">Kredi veya banka kartınızla ödeyin, kartınızı kaydedin, isterseniz aidatlarınız otomatik ödensin.${auto ? ` <b>Otomatik ödeme açık (${esc(Card.label(auto))}).</b>` : ''}</p>
    <button class="btn primary block" data-tab="pay" style="margin-top:10px">${ic('card')} ${bal > 0.004 ? 'Kartla Öde (' + fmt.money(bal) + ')' : 'Kartlarım ve otomatik ödeme'}</button></div>`;
}
async function payProcess(args, info) {
  // 3D Secure / işlem ekranı; önizlemede para çekilmez
  Sheet.open(`<div class="pay-proc"><div class="spinner"></div><h3>Ödeme işleniyor…</h3><p class="muted small">${payPreview() ? 'Önizleme: gerçek ödemede bu adımda bankanızın 3D Secure (SMS şifre) ekranı açılır.' : 'Bankanızın doğrulama ekranı açılıyor.'}</p></div>`);
  const t0 = Date.now();
  try {
    const r = await call('member_card_pay', args);
    await new Promise(res => setTimeout(res, Math.max(0, 1400 - (Date.now() - t0))));
    S.payx = { mode: 'all', custom: '', card: r.card_id || null };
    Sheet.open(`<div class="pay-done"><div class="pd-ic">✓</div><h3>${r.preview ? 'Önizleme tamamlandı' : 'Ödemeniz alındı'}</h3>
      <p><b>${fmt.money(r.amount)}</b> · ${esc(r.card || '')}</p>
      ${r.preview ? `<p class="muted small" style="margin-top:8px">Bu bir <b>önizlemedir: kartınızdan para çekilmedi</b>, borcunuz değişmedi. Gerçek ödemeye geçildiğinde bu tutar kartınızdan çekilecek ve makbuzunuz kesilecek.</p>` : `<p class="muted small" style="margin-top:8px">Borcunuz ve makbuzunuz birkaç dakika içinde güncellenir.</p>`}
      ${info.saved ? `<p class="small" style="margin-top:8px">💳 Kartınız kaydedildi${info.auto ? ' ve <b>otomatik ödeme talimatınız</b> alındı' : ''}.</p>` : ''}
      <button class="btn primary block" style="margin-top:16px" data-close>Tamam</button></div>`);
    refresh(true);
  } catch (err) {
    Sheet.open(`<div class="pay-done fail"><div class="pd-ic">!</div><h3>Ödeme yapılamadı</h3><p class="small">${esc(err.offline ? 'İnternet bağlantınızı kontrol edin.' : err.message)}</p><p class="muted small" style="margin-top:6px">Kartınızdan para çekilmedi.</p>
      <button class="btn primary block" style="margin-top:16px" data-close>Tamam</button></div>`);
  }
}
// Canlı ödeme (1.6.1): sunucu fonksiyonu → { url } güvenli sayfa | { form } bankaya/PayTR'ye form | { done } kayıtlı kartla sonuç
function payReturnUrl() { return location.origin + location.pathname + (CFG.central ? siteQuery({ y: CFG.siteY, raw: CFG.siteRaw }) : ''); }
async function payStart(body) {
  const r = await fetch(`${FN_BASE()}/baslat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ token: S.token, return: payReturnUrl() }, body)) });
  let d = null; try { d = await r.json(); } catch { }
  if (!d) throw new Error(r.status === 404 ? 'Ödeme sunucusu kurulmamış. Lütfen yönetime bildirin.' : 'Ödeme sunucusuna ulaşılamadı (' + r.status + ').');
  if (d.code === 'SESSION') { const e = new Error(d.error); e.session = true; throw e; }
  if (d.error) throw new Error(d.error);
  return d;
}
// Gizli formu kurup gönderir (sayfa kuruluşa/bankaya geçer). extra: kart alanları (yalnızca PayTR Direkt API)
function payPost(form, extra) {
  const f = document.createElement('form'); f.method = 'POST'; f.action = form.action; f.style.display = 'none';
  const add = (k, v) => { const i = document.createElement('input'); i.type = 'hidden'; i.name = k; i.value = v == null ? '' : String(v); f.appendChild(i); };
  Object.entries(form.fields || {}).forEach(([k, v]) => add(k, v));
  Object.entries(extra || {}).forEach(([k, v]) => add(k, v));
  document.body.appendChild(f); f.submit();
  setTimeout(() => { f.querySelectorAll('input').forEach(i => { i.value = ''; }); f.remove(); }, 4000);
}
function payFail(err) {
  if (err && err.session) { Sheet.close(); forceLogout(err.message); return; }
  Sheet.close(); toast(err.message === 'Failed to fetch' ? 'Ödeme sunucusuna ulaşılamadı. İnternet bağlantınızı kontrol edin.' : err.message, 'error');
}
async function payRedirect(amt, opts) {
  opts = opts || {};
  Sheet.open(`<div class="pay-proc"><div class="spinner"></div><h3>Güvenli ödeme sayfası açılıyor…</h3><p class="muted small">Kart bilgilerinizi ödeme kuruluşunun${(S.data.pay || {}).label ? ' (' + esc(S.data.pay.label) + ')' : ''} güvenli sayfasında gireceksiniz.</p></div>`);
  try {
    const d = await payStart({ amount: amt, save: !!opts.save, auto: !!opts.auto });
    try { sessionStorage.setItem('sym_pay', JSON.stringify({ oid: d.oid, amt, at: Date.now(), save: !!opts.save, auto: !!opts.auto })); } catch { }
    if (d.url) { location.href = d.url; return; }
    if (d.form) { payPost(d.form); return; }
    throw new Error('Ödeme başlatılamadı.');
  } catch (err) { payFail(err); }
}
// Kayıtlı kartla ödeme: çekimi sunucu yapar (kart anahtarı telefonda değil, bulutta durur)
async function payStored(amt, c) {
  Sheet.open(`<div class="pay-proc"><div class="spinner"></div><h3>Ödeme işleniyor…</h3><p class="muted small">${esc(Card.label(c))} kartınızdan ${fmt.money(amt)} çekiliyor.</p></div>`);
  try {
    const d = await payStart({ amount: amt, card_id: c.id });
    if (d.done && (d.paid || d.pending)) {
      Sheet.open(`<div class="pay-done"><div class="pd-ic">✓</div><h3>${d.pending ? 'Ödemeniz işleniyor' : 'Ödemeniz alındı'}</h3><p><b>${fmt.money(d.amount || amt)}</b> · ${esc(d.card || Card.label(c))}</p>
        <p class="muted small" style="margin-top:8px">${d.pending ? 'Ödeme kuruluşu sonucu birkaç saniye içinde bildirir.' : 'Borcunuz ve makbuzunuz birkaç dakika içinde (yönetim eşitlemesinde) güncellenir.'}</p>
        <button class="btn primary block" style="margin-top:16px" data-close>Tamam</button></div>`);
    } else {
      Sheet.open(`<div class="pay-done fail"><div class="pd-ic">!</div><h3>Ödeme yapılamadı</h3><p class="small">${esc(String(d.error || 'Ödeme onaylanmadı').replace(/^(iyzico|PayTR): /, ''))}</p>
        <p class="muted small" style="margin-top:6px">Kartınızdan para çekilmedi. Başka bir kartla deneyebilirsiniz.</p><button class="btn primary block" style="margin-top:16px" data-close>Tamam</button></div>`);
    }
    S.payx = { mode: 'all', custom: '', card: c.id };
    refresh(true);
  } catch (err) { payFail(err); }
}
// Kuruluşun sayfasına gitmeden önce kart kaydetme / otomatik ödeme tercihi (iyzico, PayTR)
function payHostedSheet(amt) {
  const p = S.data.pay || {};
  if (!p.save) return payRedirect(amt);
  Sheet.open(`<h3>${ic('card')} Yeni kart ile öde</h3><div class="kv"><span>Tutar</span><b>${fmt.money(amt)}</b></div>
    <form id="payHosted"><label class="chk-row"><input type="checkbox" name="save" checked><span><b>Kartımı kaydet</b><small>Sonraki ödemelerde kart bilgisi girmeden ödeyin. Kartınızı ödeme kuruluşu${p.label ? ' (' + esc(p.label) + ')' : ''} saklar; uygulamada yalnızca son 4 hane görünür.</small></span></label>
    ${p.auto ? `<label class="chk-row"><input type="checkbox" name="auto"><span><b>Aidatlarım bu karttan otomatik ödensin</b><small>Yeni aidat tahakkuk edildiğinde borcunuz bu karttan çekilir; size bildirim gelir.</small></span></label>` : ''}
    <button class="btn primary block" type="submit" style="margin-top:14px">${ic('lock')} Güvenli ödeme sayfasına geç</button></form>
    <p class="muted small center" style="margin-top:8px">Kart bilgilerinizi ödeme kuruluşunun${p.label ? ' (' + esc(p.label) + ')' : ''} güvenli sayfasında gireceksiniz.${p.provider === 'iyzico' ? ' Kartın kaydedilmesi için o sayfada da “Kartımı kaydet” seçeneğini işaretleyin.' : ''}</p>
    <button class="btn block" style="margin-top:8px" data-close>Vazgeç</button>`, (el) => {
    const f = el.querySelector('#payHosted');
    f.save.addEventListener('change', () => { if (f.auto) { f.auto.disabled = !f.save.checked; if (!f.save.checked) f.auto.checked = false; } });
    f.addEventListener('submit', (e) => { e.preventDefault(); const save = f.save.checked, auto = !!(save && f.auto && f.auto.checked); payRedirect(amt, { save, auto }); });
  });
}
// PayTR Direkt API: kart bilgisi uygulama içi formdan DOĞRUDAN PayTR'ye gönderilir (bizim sunucumuza gelmez)
function payCardSheet(amt) {
  Sheet.open(`<h3>${ic('card')} Kart bilgileri</h3><form id="cardForm" autocomplete="on">${Card.formHtml({ saveOpt: true, saveDefault: true, autoOpt: true })}
      <button class="btn primary block" type="submit" style="margin-top:14px">${ic('lock')} ${fmt.money(amt)} Öde</button></form>
    <p class="muted small center" style="margin-top:8px">Kart bilgileriniz doğrudan ödeme kuruluşuna${(S.data.pay || {}).label ? ' (' + esc(S.data.pay.label) + ')' : ''} gönderilir; site ve uygulama kart numaranızı görmez, kaydetmez.</p>
    <button class="btn block" style="margin-top:8px" data-close>Vazgeç</button>`, (el) => {
    const f = el.querySelector('#cardForm'); Card.bind(f);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const r = Card.read(f); if (r.err) { toast(r.err, 'error'); f[r.field] && f[r.field].focus(); return; }
      const save = !!(f.save && f.save.checked), auto = !!(save && f.auto && f.auto.checked), b = f.querySelector('[type=submit]'); b.disabled = true;
      const raw = { cc_owner: r.card.holder, card_number: String(f.cc.value).replace(/\D/g, ''), expiry_month: String(r.card.exp_month).padStart(2, '0'),
        expiry_year: String(r.card.exp_year).slice(-2), cvv: String(f.cvv.value).replace(/\D/g, '') };
      try {
        const d = await payStart({ amount: amt, save, auto });
        if (!d.form || !d.form.card) throw new Error('Ödeme başlatılamadı.');
        try { sessionStorage.setItem('sym_pay', JSON.stringify({ oid: d.oid, amt, at: Date.now(), save, auto })); } catch { }
        const m = d.form.card, extra = {}; Object.keys(m).forEach(k => { extra[m[k]] = raw[k === 'holder' ? 'cc_owner' : k === 'number' ? 'card_number' : k === 'month' ? 'expiry_month' : k === 'year' ? 'expiry_year' : 'cvv']; });
        Card.wipe(f); Object.keys(raw).forEach(k => { raw[k] = ''; });
        Sheet.open(`<div class="pay-proc"><div class="spinner"></div><h3>Bankanızın doğrulama ekranı açılıyor…</h3></div>`);
        payPost(d.form, extra);
      } catch (err) { b.disabled = false; Object.keys(raw).forEach(k => { raw[k] = ''; }); payFail(err); }
    });
  });
}
function payGo() {
  const X = S.payx || {}, { amt, ok, min, bal } = payAmount();
  if (!ok) return toast(`Tutar ${fmt.money(min)} ile ${fmt.money(bal)} arasında olmalı.`, 'error');
  if (!payPreview()) {
    const c = X.card !== 'new' && (S.data.pay || {}).save ? (S.data.cards || []).find(k => k.id === X.card) : null;
    if (c) {
      Sheet.open(`<h3>Ödemeyi onaylayın</h3><div class="kv"><span>Tutar</span><b>${fmt.money(amt)}</b></div><div class="kv"><span>Kart</span><b>${esc(Card.label(c))}</b></div>
        <p class="muted small" style="margin-top:8px">Tutar kayıtlı kartınızdan hemen çekilir.</p>
        <button class="btn primary block" style="margin-top:14px" data-pconfirm>${fmt.money(amt)} Öde</button><button class="btn block" style="margin-top:8px" data-close>Vazgeç</button>`, (el) => {
        el.querySelector('[data-pconfirm]').onclick = () => payStored(amt, c);
      });
      return;
    }
    return payFlow() === 'card' ? payCardSheet(amt) : payHostedSheet(amt);
  }
  if (X.card !== 'new') {
    const c = (S.data.cards || []).find(k => k.id === X.card); if (!c) return;
    Sheet.open(`<h3>Ödemeyi onaylayın</h3><div class="kv"><span>Tutar</span><b>${fmt.money(amt)}</b></div><div class="kv"><span>Kart</span><b>${esc(Card.label(c))}</b></div>
      ${payPreview() ? '<p class="muted small" style="margin-top:8px">Önizleme: kartınızdan para çekilmez.</p>' : ''}
      <button class="btn primary block" style="margin-top:14px" data-pconfirm>${fmt.money(amt)} Öde</button><button class="btn block" style="margin-top:8px" data-close>Vazgeç</button>`, (el) => {
      el.querySelector('[data-pconfirm]').onclick = () => payProcess({ p_amount: amt, p_card_id: c.id, p_card: null }, {});
    });
    return;
  }
  Sheet.open(`<h3>${ic('card')} Kart bilgileri</h3><form id="cardForm" autocomplete="on">${Card.formHtml({ saveOpt: true, saveDefault: true, autoOpt: true })}
      <button class="btn primary block" type="submit" style="margin-top:14px">${ic('lock')} ${fmt.money(amt)} Öde</button></form>
    <p class="muted small center" style="margin-top:8px">${payPreview() ? '<b>Önizleme:</b> kartınızdan para çekilmez. ' : ''}Kart numarası ve CVV kaydedilmez.</p>
    <button class="btn block" style="margin-top:8px" data-close>Vazgeç</button>`, (el) => {
    const f = el.querySelector('#cardForm'); Card.bind(f);
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const r = Card.read(f); if (r.err) { toast(r.err, 'error'); f[r.field] && f[r.field].focus(); return; }
      const save = !!(f.save && f.save.checked), auto = !!(save && f.auto && f.auto.checked);
      Card.wipe(f);
      payProcess({ p_amount: amt, p_card_id: null, p_card: Object.assign({}, r.card, { save, auto }) }, { saved: save, auto });
    });
  });
}
function cardAddSheet(autoDefault) {
  Sheet.open(`<h3>${ic('card')} Kart ekle</h3><form id="cardAdd" autocomplete="on">${Card.formHtml({ autoOpt: true })}
      <button class="btn primary block" type="submit" style="margin-top:14px">Kartı Kaydet</button></form>
    <p class="muted small center" style="margin-top:8px">Kart numarası ve CVV kaydedilmez; yalnızca son 4 hane ve son kullanma tarihi görünür.${payPreview() ? ' Önizlemede kartınızdan para çekilmez.' : ''}</p>
    <button class="btn block" style="margin-top:8px" data-close>Vazgeç</button>`, (el) => {
    const f = el.querySelector('#cardAdd'); Card.bind(f);
    if (autoDefault && f.auto) f.auto.checked = true;
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const r = Card.read(f); if (r.err) { toast(r.err, 'error'); f[r.field] && f[r.field].focus(); return; }
      const auto = !!(f.auto && f.auto.checked), b = f.querySelector('[type=submit]'); b.disabled = true;
      try { const x = await call('member_card_add', { p_card: Object.assign({}, r.card, { auto }) }); Card.wipe(f); Sheet.close(); S.payx = Object.assign(S.payx || {}, { card: x.id }); toast(auto ? 'Kartınız kaydedildi, otomatik ödeme açıldı ✓' : 'Kartınız kaydedildi ✓'); refresh(true); }
      catch (err) { b.disabled = false; toast(err.message, 'error'); }
    });
  });
}
function payReturnSheet(kind) {
  let amt = null, save = false; try { const x = JSON.parse(sessionStorage.getItem('sym_pay') || 'null'); if (x) { amt = x.amt; save = !!x.save; } sessionStorage.removeItem('sym_pay'); } catch { }
  const msg = kind === 'ok' ? ['✅ Ödemeniz alındı', `${amt ? fmt.money(amt) + ' tutarındaki ödemeniz' : 'Ödemeniz'} onaylandı. Borcunuz ve makbuzunuz birkaç dakika içinde (yönetim eşitlemesinde) güncellenir.${save ? ' Kartınız kaydedildiyse Kartla Öde bölümünde görünür.' : ''}`]
    : kind === 'bekle' ? ['⏳ Ödemeniz işleniyor', 'Ödeme kuruluşu sonucu birkaç saniye içinde bildirir. Durumu Kartla Öde → Son kart ödemelerim bölümünden takip edebilirsiniz.']
      : ['❌ Ödeme tamamlanmadı', 'Kartınızdan para çekilmedi. Bilgilerinizi kontrol edip tekrar deneyebilirsiniz.'];
  Sheet.open(`<h3>${msg[0]}</h3><p style="margin-top:8px">${esc(msg[1])}</p>${!S.token ? '<p class="muted small" style="margin-top:8px">Uygulamaya geri dönüp hesabınızı kontrol edebilirsiniz.</p>' : ''}
    <button class="btn primary block" style="margin-top:16px" data-close>Tamam</button>`);
}

// ---------------- ANKETLER (v1.5.0) ----------------
function pendingPolls() { return ((S.data && S.data.polls) || []).filter(p => p.open && !(Array.isArray(p.my) && p.my.length)); }
function pollsView() {
  const list = S.data.polls || [];
  if (!list.length) return `<div class="empty">${ic('poll')}<p>Şu anda anket bulunmuyor.</p></div>`;
  return `<p class="muted small" style="margin-bottom:10px">Her daire bir oy verir. Oy süresi bitmeden oyunuzu değiştirebilirsiniz; son oyunuz geçerli olur.</p>` + list.map(pollCard).join('');
}
function pollCard(p) {
  const opts = Array.isArray(p.options) ? p.options : [], my = Array.isArray(p.my) ? p.my : [];
  const voted = my.length > 0, edit = S.pollEdit === p.id;
  const head = `<div class="card-h"><h3>${esc(p.title)}</h3>${p.open ? badge(voted ? 'Oy verdiniz' : 'Oylama açık', voted ? 'green' : 'blue') : badge('Sona erdi', 'gray')}</div>
    ${p.body ? `<p class="small" style="white-space:pre-line">${esc(p.body)}</p>` : ''}
    <p class="muted small">${p.ends ? (p.open ? 'Son gün: ' : 'Bitti: ') + esc(fmt.date(p.ends)) + ' · ' : ''}${Number(p.voters) || 0} daire oy verdi${p.anonymous ? ' · gizli oylama' : ''}</p>`;
  if (p.open && (!voted || edit)) {
    const type = p.multi ? 'checkbox' : 'radio';
    return `<div class="card poll" data-poll="${p.id}">${head}
      <div class="poll-opts">${opts.map((o, i) => `<label class="poll-o"><input type="${type}" name="pv${p.id}" value="${i}" ${my.includes(i) ? 'checked' : ''}><span>${esc(o)}</span></label>`).join('')}</div>
      ${p.multi ? '<p class="muted small">Birden fazla seçenek işaretleyebilirsiniz.</p>' : ''}
      <button class="btn primary block" data-vote="${p.id}" style="margin-top:10px">${voted ? 'Oyumu Güncelle' : 'Oy Ver'}</button></div>`;
  }
  const res = Array.isArray(p.results) ? p.results : null, tot = res ? Math.max(1, Number(p.voters) || res.reduce((a, b) => a + b, 0)) : 1;
  return `<div class="card poll">${head}
    ${voted ? `<p class="small"><b>Oyunuz:</b> ${esc(my.map(i => opts[i]).filter(Boolean).join(', '))}</p>` : (!p.open ? '<p class="muted small">Bu ankete oy vermediniz.</p>' : '')}
    ${res ? `<div class="poll-res">${opts.map((o, i) => `<div class="pr"><div class="pr-h"><span>${esc(o)}</span><b>${res[i] || 0} · %${Math.round((res[i] || 0) / tot * 100)}</b></div><div class="pr-bar"><i style="width:${Math.round((res[i] || 0) / tot * 100)}%"></i></div></div>`).join('')}</div>`
      : (!p.open ? '<p class="muted small">Sonuçlar yönetim tarafından duyurulacaktır.</p>' : '<p class="muted small">Sonuçlar anket bitince gösterilir.</p>')}
    ${p.open && voted ? `<button class="btn block" data-votechange="${p.id}" style="margin-top:10px">Oyumu Değiştir</button>` : ''}</div>`;
}
async function submitVote(btn) {
  const id = Number(btn.dataset.vote), card = btn.closest('[data-poll]');
  const ch = [...card.querySelectorAll('input:checked')].map(x => Number(x.value));
  if (!ch.length) { toast('Lütfen bir seçenek işaretleyin.', 'error'); return; }
  btn.disabled = true;
  try {
    await call('member_poll_vote', { p_poll: id, p_choices: ch });
    const p = (S.data.polls || []).find(x => x.id === id);
    if (p) { if (!(Array.isArray(p.my) && p.my.length)) p.voters = (Number(p.voters) || 0) + 1; p.my = ch; }
    S.pollEdit = null; render(); toast('Oyunuz kaydedildi ✓');
    refresh(true);
  } catch (e) { btn.disabled = false; toast(e.message, 'error'); }
}

function meetingsView() {
  const list = S.data.meetings || [];
  if (!list.length) return `<div class="empty">${ic('gavel')}<p>Toplantı kaydı bulunmuyor.</p></div>`;
  return `<div class="list">${list.map(m => `<div class="li" data-meet="${m.id}"><span class="li-ic qi blue">${ic('gavel')}</span><div class="li-b"><b>${esc(m.title || m.type)}</b><small>${esc(fmt.date(m.date))}${m.time ? ' · ' + esc(m.time) : ''}${m.location ? ' · ' + esc(m.location) : ''}</small></div>${badge(m.status)}</div>`).join('')}</div>`;
}
function meetingDetail(id) {
  const m = (S.data.meetings || []).find(x => String(x.id) === String(id)); if (!m) return;
  Sheet.open(`<h3>${esc(m.title || m.type)}</h3>
    <div class="kv"><span>Tür</span><b>${esc(m.type)}</b></div><div class="kv"><span>Tarih</span><b>${esc(fmt.date(m.date))} ${esc(m.time || '')}</b></div>
    ${m.location ? `<div class="kv"><span>Yer</span><b>${esc(m.location)}</b></div>` : ''}<div class="kv"><span>Durum</span><b>${badge(m.status)}</b></div>
    ${m.agenda ? `<div class="sec-title">Gündem</div><div class="rules">${esc(m.agenda)}</div>` : ''}
    ${m.decisions ? `<div class="sec-title">Alınan Kararlar</div><div class="rules" style="color:var(--text)">${esc(m.decisions)}</div>` : ''}
    <button class="btn block" style="margin-top:12px" data-close>Kapat</button>`);
}
function contactsView() {
  const list = S.data.contacts || [];
  const s = S.data.site || {};
  const groups = {};
  for (const c of list) (groups[c.category || 'Diğer'] = groups[c.category || 'Diğer'] || []).push(c);
  const row = (name, phone, note) => `<a class="li" href="tel:${esc(String(phone || '').replace(/\s/g, ''))}" style="color:inherit"><span class="li-ic qi red">${ic('phone')}</span><div class="li-b"><b>${esc(name)}</b><small>${esc(phone)}${note ? ' · ' + esc(note) : ''}</small></div><span class="badge green">Ara</span></a>`;
  return `${s.site_phone ? `<div class="sec-title" style="margin-top:0">Site Yönetimi</div><div class="list">${row(s.site_name || 'Yönetim Ofisi', s.site_phone, s.manager_name)}</div>` : ''}
    ${Object.entries(groups).map(([g, items]) => `<div class="sec-title">${esc(g)}</div><div class="list">${items.map(c => row(c.name, c.phone, c.notes)).join('')}</div>`).join('')}
    ${!list.length && !s.site_phone ? `<div class="empty">${ic('phone')}<p>Telefon rehberi henüz eklenmemiş.</p></div>` : ''}
    <div class="sec-title">Acil Durum</div><div class="list">${row('Acil Çağrı Merkezi', '112', 'Ambulans, itfaiye, polis')}${row('Doğalgaz Acil', '187', '')}${row('Elektrik Arıza', '186', '')}</div>`;
}
function profileView() {
  const d = S.data, m = d.member || {}, u = d.unit || {};
  return `<div class="card profile-head"><div class="avatar">${esc((m.full_name || '?').slice(0, 1))}</div><b>${esc(m.full_name)}</b><div class="muted small">${esc(m.type || '')}</div></div>
    <div class="card"><div class="kv"><span>Daire</span><b>${esc(unitName(u))}</b></div><div class="kv"><span>Telefon</span><b>${esc(fmt.phone(m.phone))}</b></div>
      <p class="muted small" style="margin-top:8px">Bilgilerinizde hata varsa site yönetimine bildirin.</p></div>
    <div class="card"><div class="card-h"><h3>${ic('lock')} Şifre Değiştir</h3></div>
      <form id="pwForm"><div class="fld"><label>Mevcut Şifre</label><input name="old" type="password" autocomplete="current-password" required></div>
      <div class="row2"><div class="fld"><label>Yeni Şifre</label><input name="p1" type="password" autocomplete="new-password" minlength="6" required></div><div class="fld"><label>Yeni Şifre (Tekrar)</label><input name="p2" type="password" autocomplete="new-password" required></div></div>
      <button class="btn primary block" type="submit">Şifreyi Değiştir</button></form></div>
    <div class="card" id="pushCard"></div>
    ${d.push !== undefined ? privacyCard() : ''}
    <button class="btn danger block" data-act="logout">${ic('logout')} Çıkış Yap</button>
    <p class="ver">Çıkış yaptığınızda bu cihazdaki kayıtlı bilgileriniz silinir.${CFG.central && CFG.siteName ? ` Bağlı site: <b>${esc(CFG.siteName)}</b>.` : ''}${CFG.central && MSites.others(CFG.url).length ? ` <a href="#" data-act="sites">Siteyi değiştir</a> ·` : ''} Sürüm ${APP_VERSION} · <a href="#" data-act="updcheck">Güncellemeleri denetle</a></p>`;
}

// ---------------- ana ekrana ekle ----------------
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); S.installEvt = e; if (S.data && S.view === 'home') render(); });
window.addEventListener('appinstalled', () => { S.installEvt = null; S.appInstalled = true; if (Setup.onInstalled) { Setup.onInstalled(); return; } toast('Uygulama yüklendi ✓'); render(); });
// ---------------- 1.8.2: ilk açılış kurulumu ----------------
// Tarayıcılar "Yükle" / "İzin ver" sorularını sayfanın kendisinin yanıtlamasına izin vermez (güvenlik kuralı); bu yüzden
// adımlar mümkün olan en az dokunuşa indirilir: Kayıt Ol / Giriş Yap dokunuşuyla yükleme sorusu hemen açılır, onaylanınca
// bildirim izni kendiliğinden istenir, sonunda "Uygulamayı Aç" ile uygulama kendi penceresinde (adres çubuğu olmadan) açılır.
// Ana ekran uygulamasında (standalone) bildirimler ilk açılışta kendiliğinden açılır.
const Setup = {
  onInstalled: null,
  done() { try { return localStorage.getItem('sym_setup') === 'done'; } catch { return true; } },
  mark() { try { localStorage.setItem('sym_setup', 'done'); } catch { } },
  openUrl() { return 'intent://' + location.host + location.pathname + siteQuery({ y: CFG.siteY, raw: CFG.siteRaw }) + '#Intent;scheme=' + location.protocol.replace(':', '') + ';action=android.intent.action.VIEW;S.browser_fallback_url=' + encodeURIComponent(appUrl()) + ';end'; },
  // Kayıt Ol / Giriş Yap dokunuşu sürerken (tarayıcı kullanıcı etkileşimi geçerliyken) yükleme sorusunu aç
  afterAuth() {
    if (isStandalone() || this.done() || !S.installEvt) return;
    const act = navigator.userActivation; if (act && !act.isActive) return;   // süre dolduysa ana sayfada kurulum penceresi açılır
    this.run(null);
  },
  // Ana sayfada bir kez: kurulum penceresi (tarayıcıda açılmışsa)
  maybeShow() {
    if (isStandalone() || this.done() || this._shown || !S.token || !S.data || S.view !== 'home') return;
    try { if (sessionStorage.getItem('sym_setup_shown')) return; } catch { }
    if (!S.installEvt && !isIOS() && !/Android/i.test(navigator.userAgent)) return;   // masaüstü tarayıcı: rahatsız etme
    setTimeout(() => {
      if (this._shown || isStandalone() || ($('#sheet-root') && $('#sheet-root').children.length)) return;
      this._shown = true; try { sessionStorage.setItem('sym_setup_shown', '1'); } catch { }
      if (isIOS()) {
        Sheet.open(`<h3>${ic('download')} Uygulamayı yükleyin</h3><p class="small">iPhone'da bu adım Apple kuralı gereği elle yapılır (bir kez):</p>
          <ol class="ios-steps"><li>Safari'nin alt çubuğundaki <b>Paylaş</b> (□↑) düğmesine dokunun.</li><li><b>"Ana Ekrana Ekle"</b> → <b>Ekle</b>.</li><li>Ana ekrandaki <b>Site Yönetim</b> simgesinden açın; bildirim izni orada tek dokunuşla istenir.</li></ol>
          <button class="btn primary block" style="margin-top:12px" data-close>Anladım</button>`, () => this.mark());
        return;
      }
      Sheet.open(`<div data-setup><h3>${ic('download')} Uygulamayı hazırlayalım</h3>
        <p class="small">Tek dokunuşla uygulama telefonunuza yüklenir ve bildirimler açılır. Ardından uygulama kendi penceresinde, adres çubuğu olmadan açılır.</p>
        <button class="btn primary block" style="margin-top:12px" data-setupgo>${ic('download')} Yükle ve Bildirimleri Aç</button>
        <button class="btn block" style="margin-top:8px" data-close>Daha sonra</button></div>`, (el) => {
        el.querySelector('[data-setupgo]').onclick = () => this.run(el.querySelector('[data-setup]'));
      });
    }, 900);
  },
  async run(box) {
    this._shown = true; try { sessionStorage.setItem('sym_setup_shown', '1'); } catch { }
    const show = (html) => {
      if (!box || !box.isConnected) { Sheet.open(`<div data-setup></div>`); box = $('[data-setup]'); }
      box.innerHTML = html;
    };
    let installed = false;
    if (S.installEvt) {
      const e = S.installEvt; S.installEvt = null;
      try { e.prompt(); const r = await e.userChoice; installed = !!(r && r.outcome === 'accepted'); } catch { }
      if (!installed && !box) { render(); return; }   // vazgeçti: ana sayfada "Yükle" kartı kalır
    }
    // bildirimler (izin daha önce reddedilmediyse) — site bilgisi henüz yüklenmediyse kısa süre bekle
    for (let i = 0; i < 40 && !S.data; i++) await new Promise(ok => setTimeout(ok, 250));
    let push = '';
    if (Push.supported() && Push.siteKey() && Notification.permission !== 'denied' && S.token) {
      try { await Push.enable({}); push = 'ok'; } catch (err) { push = err.message; }
    }
    const pushLine = push === 'ok' ? `<li>✓ Bildirimler açıldı</li>` : push ? `<li>Bildirimler: ${esc(push)}</li>` : '';
    if (!installed) {
      show(`<h3>Uygulamayı yükleyin</h3><ol class="ios-steps"><li>Chrome'un sağ üstündeki <b>⋮</b> menüsüne dokunun.</li><li><b>"Uygulamayı yükle"</b> / <b>"Ana ekrana ekle"</b>yi seçin.</li><li>Ana ekrandaki simgeden açın.</li></ol>
        ${pushLine ? `<ul class="setup-ok">${pushLine}</ul>` : ''}
        <a class="btn block" style="margin-top:10px" href="${esc(this.openUrl())}">Zaten yüklüyse: Uygulamayı Aç</a>
        <button class="btn primary block" style="margin-top:8px" data-close>Tamam</button>`);
      return;
    }
    this.mark();
    show(`<div class="center"><div class="spinner"></div><h3 style="margin-top:10px">Uygulama yükleniyor…</h3><ul class="setup-ok">${pushLine}</ul></div>`);
    if (!S.appInstalled) await new Promise((ok) => { const t = setTimeout(ok, 15000); this.onInstalled = () => { clearTimeout(t); ok(); }; });
    this.onInstalled = null;
    show(`<h3>✓ Hazır</h3><ul class="setup-ok"><li>✓ Uygulama telefonunuza yüklendi</li>${pushLine}</ul>
      <p class="small" style="margin-top:8px">Uygulamayı bir kez kendi penceresinde açın; bundan sonra ana ekrandaki <b>Site Yönetim</b> simgesini kullanın. Bu tarayıcı sekmesini kapatabilirsiniz.</p>
      <a class="btn primary block" style="margin-top:12px" href="${esc(this.openUrl())}">${ic('download')} Uygulamayı Aç</a>
      <p class="muted small center" style="margin-top:8px">Açılmazsa ana ekrandaki simgeye dokunun.</p>`);
  },
  // Ana ekran uygulamasında: bildirimleri kendiliğinden aç (kullanıcı kapatmadıysa). iPhone'da izin yalnızca dokunuşla istenebilir.
  async autoPush() {
    try {
      if (!S.token || !S.data || !Push.supported() || !Push.siteKey() || S.data.push === undefined) return;
      if (localStorage.getItem('sym_push_on') === '1' || localStorage.getItem('sym_push_off') === '1') return;
      const perm = Notification.permission;
      if (perm === 'granted') { await Push.enable({}); return; }   // izin zaten var (ör. tarayıcıda verildi): sessizce abone ol
      if (perm !== 'default' || !isStandalone() || localStorage.getItem('sym_push_asked')) return;
      localStorage.setItem('sym_push_asked', '1');
      if (isIOS()) {
        Sheet.open(`<h3>${ic('bell')} Bildirimler</h3><p class="small">Duyuru, kargo, misafir ve ödeme bildirimlerini almak için bir kez izin verin.</p>
          <button class="btn primary block" style="margin-top:12px" data-pushgo>${ic('bell')} Bildirimleri Aç</button><button class="btn block" style="margin-top:8px" data-close>Daha sonra</button>`, (el) => {
          el.querySelector('[data-pushgo]').onclick = async () => { try { await Push.enable({}); toast('Bildirimler açıldı ✓'); } catch (e) { toast(e.message, 'error'); } Sheet.close(); };
        });
        return;
      }
      await Push.enable({}); toast('Bildirimler açıldı ✓');
    } catch (e) { console.warn('bildirim', e); }
  }
};
async function doInstall() {
  if (S.installEvt) { S.installEvt.prompt(); const r = await S.installEvt.userChoice.catch(() => null); S.installEvt = null; if (r && r.outcome === 'accepted') toast('Yükleniyor…'); render(); return; }
  if (isIOS()) {
    Sheet.open(`<h3>iPhone'a Yükleme</h3><ol class="ios-steps"><li>Safari'nin alt çubuğundaki <b>Paylaş</b> düğmesine (□↑) dokunun.</li><li>Listeyi kaydırıp <b>"Ana Ekrana Ekle"</b>ye dokunun.</li><li>Sağ üstteki <b>Ekle</b>'ye dokunun.</li></ol><p class="muted small">Not: Bu işlem yalnızca <b>Safari</b> tarayıcısında yapılabilir. Ana ekrandaki simgeden ilk açılışta telefon numaranız ve şifrenizle bir kez giriş yapmanız gerekebilir.</p><button class="btn primary block" style="margin-top:12px" data-close>Anladım</button>`);
  } else {
    Sheet.open(`<h3>Ana Ekrana Ekleme</h3><ol class="ios-steps"><li>Tarayıcının sağ üstündeki <b>⋮</b> menüsüne dokunun.</li><li><b>"Uygulamayı yükle"</b> veya <b>"Ana ekrana ekle"</b> seçeneğine dokunun.</li><li>Onaylayın — uygulama simgesi ana ekranınıza eklenir.</li></ol><button class="btn primary block" style="margin-top:12px" data-close>Anladım</button>`);
  }
}
function maybeInstallTip() { if (!isStandalone() && (S.installEvt || isIOS())) doInstall(); }

// ---------------- olaylar ----------------
document.addEventListener('click', async (e) => {
  const t = e.target;
  const tab = t.closest('[data-tab]'); if (tab && !t.closest('.sheet')) { go(tab.dataset.tab, true); return; }
  const g = t.closest('[data-go]'); if (g) { go(g.dataset.go); return; }
  const au = t.closest('[data-auth]'); if (au) { S.authTab = au.dataset.auth; render(); return; }
  if (t.closest('[data-invclear]')) { clearInvite(); render(); const c = $('#regForm [name=code]'); if (c) c.focus(); return; }
  const ac = t.closest('[data-acct]'); if (ac) { S.acctFilter = ac.dataset.acct; render(); return; }
  const cp = t.closest('[data-copy]'); if (cp) { copyText(cp.dataset.copy); return; }
  const led = t.closest('[data-led]'); if (led) { ledgerDetail(led.dataset.led); return; }
  const mt = t.closest('[data-meet]'); if (mt) { meetingDetail(mt.dataset.meet); return; }
  const vt = t.closest('[data-vote]'); if (vt) { submitVote(vt); return; }
  const ve = t.closest('[data-votechange]'); if (ve) { S.pollEdit = Number(ve.dataset.votechange); render(); return; }
  const fc = t.closest('[data-fac]'); if (fc) { S.rsv.fac = Number(fc.dataset.fac); S.rsv.a = S.rsv.b = null; render(); return; }
  const dy = t.closest('[data-day]'); if (dy) { S.rsv.date = dy.dataset.day; S.rsv.a = S.rsv.b = null; render(); return; }
  const sl = t.closest('[data-slot]'); if (sl && !sl.disabled) { onSlot(Number(sl.dataset.slot)); return; }
  const cr = t.closest('[data-cancel-rsv]');
  if (cr) {
    if (!confirm('Bu rezervasyonu iptal etmek istiyor musunuz?')) return;
    const [kind, id] = cr.dataset.cancelRsv.split(':');
    try { await call('member_cancel_reservation', { p_kind: kind, p_id: Number(id) }); toast('Rezervasyon iptal edildi.'); refresh(true); } catch (err) { toast(err.message, 'error'); }
    return;
  }
  const ps = t.closest('[data-pass]'); if (ps) { const v = (S.data.visitors || []).find(x => String(x.id) === ps.dataset.pass); if (v) passSheet(v); return; }
  if (t.closest('[data-kvkkread]')) {
    e.preventDefault();
    const code = ($('#regForm [name=code]') || {}).value || '';
    const kv = await kvkkForCode(code);
    kvkkSheet(kv && kv.text);
    return;
  }
  const cv = t.closest('[data-cancel-vis]');
  if (cv) {
    if (!confirm('Ziyaretçi bildirimi iptal edilsin mi?')) return;
    try { await call('member_cancel_visitor', { p_id: Number(cv.dataset.cancelVis) }); toast('Bildirim iptal edildi.'); refresh(true); } catch (err) { toast(err.message, 'error'); }
    return;
  }
  const pa = t.closest('[data-pamt]');
  if (pa) { S.payx = Object.assign(S.payx || {}, { mode: pa.dataset.pamt }); render(); if (pa.dataset.pamt === 'custom') setTimeout(() => { const i = $('[data-pcustom]'); if (i) i.focus(); }, 30); return; }
  const pcd = t.closest('[data-pcard]');
  if (pcd) { S.payx = Object.assign(S.payx || {}, { card: pcd.dataset.pcard === 'new' ? 'new' : Number(pcd.dataset.pcard) }); render(); return; }
  const cau = t.closest('[data-cardauto]');
  if (cau) {
    const on = cau.dataset.on === '1'; cau.disabled = true;
    try { await call('member_card_update', { p_id: Number(cau.dataset.cardauto), p_auto: on, p_delete: false }); toast(on ? 'Otomatik ödeme açıldı ✓' : 'Otomatik ödeme kapatıldı.'); await refresh(true); }
    catch (err) { cau.disabled = false; toast(err.message, 'error'); }
    return;
  }
  const cdel = t.closest('[data-carddel]');
  if (cdel) {
    const c = (S.data.cards || []).find(k => k.id === Number(cdel.dataset.carddel));
    if (!confirm(`${c ? Card.label(c) : 'Kart'} silinsin mi?${c && c.auto_pay ? ' Otomatik ödeme de kapanır.' : ''}`)) return;
    try { await call('member_card_update', { p_id: Number(cdel.dataset.carddel), p_auto: false, p_delete: true }); toast('Kart silindi.'); await refresh(true); } catch (err) { toast(err.message, 'error'); }
    return;
  }
  const a = t.closest('[data-act]'); if (!a) return; if (a.tagName === 'A') e.preventDefault();
  switch (a.dataset.act) {
    case 'refresh': refresh(); break;
    case 'sites': sitesSheet(); break;
    case 'back': history.length > 1 ? history.back() : go('more', true); break;
    case 'newreq': newRequestSheet(); break;
    case 'newvis': newVisitorSheet(); break;
    case 'paynow': go('pay'); break;
    case 'paygo': payGo(); break;
    case 'cardadd': cardAddSheet(a.dataset.auto === '1'); break;
    case 'pay': Sheet.open(`<h3>Ödeme Bilgileri</h3>${payInfoHtml()}<button class="btn block" style="margin-top:14px" data-close>Kapat</button>`); break;
    case 'logout': if (confirm('Çıkış yapmak istiyor musunuz?')) logout(); break;
    case 'install': doInstall(); break;
    case 'updcheck': {
      toast('Denetleniyor…');
      Upd.check(true).then(v => { if (!v) toast(APP_BUILD === 'dev' ? 'Bu kurulum kendi adresinizden yayınlanıyor; güncellemeyi site yönetimi yükler.' : 'Sunucuya ulaşılamadı.', 'error'); else if (!Upd.pending) toast('Uygulamanız güncel: v' + APP_VERSION + ' ✓'); });
      break;
    }
    case 'install-x': localStorage.setItem('sym_install_x', String(Date.now() + 7 * 86400000)); render(); break;
    case 'ann-toggle': a.classList.toggle('clamp'); break;
    case 'kvkk-read': kvkkSheet(S.data.site && S.data.site.kvkk_text); break;
    case 'kvkk-dl': kvkkDownload(); break;
    case 'kvkk-req': kvkkRequestSheet(); break;
    case 'kvkk-del': deleteAccountSheet(); break;
  }
});

function afterRender() {
  const pc = $('#pushCard'); if (pc) pushCard(pc);
  const rf = $('#rsvForm');
  if (rf) rf.onsubmit = async (e) => {
    e.preventDefault();
    const R = S.rsv, f = (S.data.facilities || []).find(x => x.id === R.fac);
    if (R.a == null) return toast('Önce saat seçin.', 'error');
    const slots = buildSlots(f, R.date);
    const b = rf.querySelector('[type=submit]'); b.disabled = true; b.textContent = 'Gönderiliyor…';
    try {
      await call('member_new_reservation', { p_facility: f.id, p_date: R.date, p_start: slots[R.a].s, p_end: slots[R.b].e, p_guests: Number(rf.guests.value) || null, p_notes: rf.notes.value });
      R.a = R.b = null;
      toast('Rezervasyon talebiniz alındı. Yönetim onayından sonra kesinleşecek ✓');
      await refresh(true);
    } catch (err) { toast(err.message, 'error'); b.disabled = false; b.textContent = 'Rezervasyon Talebi Gönder'; refresh(true); }
  };
  const pf = $('#pwForm');
  if (pf) pf.onsubmit = async (e) => {
    e.preventDefault();
    if (pf.p1.value.length < 6) return toast('Yeni şifre en az 6 karakter olmalıdır.', 'error');
    if (pf.p1.value !== pf.p2.value) return toast('Yeni şifreler eşleşmiyor.', 'error');
    try { await call('member_change_password', { p_old: pf.old.value, p_new: pf.p1.value }); pf.reset(); toast('Şifreniz değiştirildi ✓'); }
    catch (err) { toast(err.message, 'error'); }
  };
}

// bildirime dokunulduğunda ilgili ekrana git
if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', (e) => {
  const m = e.data || {};
  if (m.sym === 'go' && m.s && CFG.central) {   // başka sitenin bildirimi → o siteye geç
    const p = parseSiteParam(m.s);
    if (p && p.u !== CFG.url && MSites.list().some(x => x.u === p.u)) { switchSite(p.u, String(m.v || 'home')); return; }
  }
  if (m.sym === 'go' && S.token) { const v = String(m.v || 'home'); if (SUB[v] || isTab(v)) { Sheet.close(); go(v); } refresh(true); }
});

// otomatik yenileme
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.token && (!S.at || Date.now() - new Date(S.at).getTime() > 60000)) refresh(true);
});
setInterval(() => { if (document.visibilityState === 'visible' && S.token) refresh(true); }, 5 * 60000);
window.addEventListener('online', () => { if (S.token) refresh(true); });

// ---------------- otomatik güncelleme (v1.4.1) ----------------
// Uygulama her açıldığında ve arka plandan öne geldiğinde merkezdeki version.json'a bakar. Yeni yayın varsa
// (kullanıcı bir form doldurmuyorsa) kendiliğinden yenilenir; doldururken kısa bir uyarı gösterir.
const Upd = {
  last: 0, pending: null,
  busy() { return !!document.querySelector('#sheet-root .sheet, form input:focus, form textarea:focus, form select:focus'); },
  async check(force) {
    if (APP_BUILD === 'dev' && !force) return null;
    if (!force && Date.now() - this.last < 30000) return null;
    this.last = Date.now();
    let v = null;
    try { const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' }); if (r.ok) v = await r.json(); } catch { }
    if (!v || !v.build || v.build === APP_BUILD) return v;
    this.pending = v;
    try { sessionStorage.setItem('sym_upd', v.version || ''); } catch { }   // SW değişimiyle (controllerchange) yenilenirse de "güncellendi" denir
    // önce yeni service worker kurulsun (yoksa sayfa iki kez yenilenir); en çok 4 sn beklenir
    try {
      const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.update();
        const sw = reg.installing || reg.waiting;
        if (sw) await new Promise(res => { const t = setTimeout(res, 4000); sw.addEventListener('statechange', () => { if (sw.state === 'activated' || sw.state === 'redundant') { clearTimeout(t); setTimeout(res, 300); } }); });
      }
    } catch { }
    this.apply();
    return v;
  },
  reload() { if (this.reloading) return; this.reloading = true; location.reload(); },
  apply() {
    if (!this.pending || this.reloading) return;
    if (!this.busy()) { this.reload(); return; }
    if (document.querySelector('.upd-bar')) return;
    const bar = document.createElement('div'); bar.className = 'upd-bar';
    bar.innerHTML = `<span>Yeni sürüm hazır${this.pending.version ? ' (v' + esc(this.pending.version) + ')' : ''}</span><button type="button">Güncelle</button>`;
    bar.querySelector('button').onclick = () => this.reload();
    document.body.appendChild(bar);
  }
};
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') Upd.check(); });
window.addEventListener('pageshow', (e) => { if (e.persisted) Upd.check(); });
document.addEventListener('focusout', () => { if (S.renderLater) setTimeout(() => { if (!document.querySelector('main input:focus')) { S.renderLater = false; render(); } }, 300); });
document.addEventListener('focusout', () => { if (Upd.pending) setTimeout(() => { if (!Upd.busy()) Upd.apply(); }, 400); });


// başlat
(async function start() {
  if (DIR_PENDING) {   // 1.8.1: kısa davet linki (?d=KOD) / site kimliği (?y=…)
    S.dirBusy = true; render();
    try { await dirResolve(DIR_PENDING); return; }   // başarılı: sayfa site bilgisiyle yeniden yüklenir
    catch (e) {
      S.dirBusy = false;
      if (e.net) { S.dirNetErr = e.message; render(); return; }
      S.dirErr = e.message || String(e);
      history.replaceState(null, '', location.pathname + location.hash);
      if (CFG.anonKey || CFG.needKey) setTimeout(() => toast(S.dirErr, 'error'), 400);
    }
  }
  if (CFG.needKey) {
    render();
    try { await resolveKey(); }
    catch (e) { S.keyErr = e.message || String(e); render(); return; }
  }
  const inv = readInviteFromUrl();
  const v = (location.hash || '').slice(1);
  if (v && (SUB[v] || isTab(v))) S.view = v;
  const payRet = (/[?&]odeme=(ok|hata|bekle)\b/.exec(location.search) || [])[1];   // v1.5.0: ödeme sayfasından dönüş
  if (payRet) S.view = 'account';
  // ?davet=… adresten silinir; merkezi uygulamada site bilgisi kalır ki iPhone'da "Ana Ekrana Ekle" ile açılan uygulama da siteyi bilsin.
  // 1.8.1: kısa kimlik (?y=…) varsa o kalır; bağlantı bilgisi (?s=…) yalnızca eski davetlerle gelinmişse.
  history.replaceState({ view: S.view }, '', location.pathname + (CFG.central ? siteQuery({ y: CFG.siteY, raw: CFG.siteRaw }) : '') + '#' + S.view);
  if (inv && !S.token) startWithInvite(inv);
  render();
  if (inv && S.token) {
    const who = (S.data && S.data.member && S.data.member.full_name) || 'bir hesap';
    Sheet.open(`<h3>Davet linki</h3><p>Bu telefonda şu anda <b>${esc(who)}</b> olarak giriş yapılmış.</p>
      <p class="muted small" style="margin-top:8px">Davet linki başka bir aile üyesi için veya yeni şifre belirlemeniz için gönderilmiş olabilir. Davetle kayıt olmak için önce çıkış yapılması gerekir.</p>
      <button class="btn primary block" style="margin-top:16px" data-invswitch>Çıkış Yap ve Davetle Kayıt Ol</button>
      <button class="btn block" style="margin-top:8px" data-invkeep>Vazgeç, mevcut hesapta kal</button>`, (el) => {
      el.querySelector('[data-invswitch]').onclick = async () => { Sheet.close(); try { await rpc('member_logout', { p_token: S.token }); } catch { } clearSession(); startWithInvite(inv); render(); };
      el.querySelector('[data-invkeep]').onclick = () => { clearInvite(); Sheet.close(); };
    });
  }
  if (payRet) setTimeout(() => payReturnSheet(payRet), 300);
  try { localStorage.removeItem('sym_moved'); } catch { }   // 1.4.1'den kalan bayrak
  if (S.token) refresh(true);
  try { const u = sessionStorage.getItem('sym_upd'); if (u !== null) { sessionStorage.removeItem('sym_upd'); setTimeout(() => toast('Uygulama güncellendi' + (u ? ': v' + u : '') + ' ✓'), 600); } } catch { }
  setTimeout(() => Upd.check(), 1500);
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    const hadCtrl = !!navigator.serviceWorker.controller; let reloaded = false;
    navigator.serviceWorker.register('sw.js').then(reg => {
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => { }); });
    }).catch(() => { });
    // yeni sürüm yayınlandığında uygulama kendiliğinden yenilenir
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadCtrl || reloaded) return;
      reloaded = true;
      if (!Upd.pending) { Upd.pending = { version: '' }; try { sessionStorage.setItem('sym_upd', ''); } catch { } }
      Upd.apply();   // form açıksa "Yeni sürüm hazır" uyarısı, değilse yenile
    });
  }
})();
