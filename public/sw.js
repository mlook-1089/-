// Service Worker — إشعارات Web Push + غلاف التطبيق للعمل دون اتصال (PWA) لمنصة حلقة ابن كثير

// غيّر رقم الإصدار عند تعديل قائمة الملفات المخزّنة مسبقاً
const CACHE_NAME = 'ibk-shell-v18';
const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon-180.png',
  '/icons/brand-mark.png',
  '/icons/brand-logo.png',
  '/icons/favicon-32.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // cache: 'reload' لتجاوز ذاكرة HTTP والحصول على أحدث نسخة
      Promise.all(PRECACHE_URLS.map((url) =>
        cache.add(new Request(url, { cache: 'reload' })).catch(() => {})
      ))
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('ibk-shell-') && k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }

  // الطلبات الخارجية (CDN، الخطوط...) تذهب للشبكة مباشرة دون تدخل
  if (url.origin !== self.location.origin) return;

  // واجهات API لا تُخزَّن ولا تُعترض إطلاقاً
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return;

  // ملف الـ Service Worker نفسه لا يُخزَّن
  if (url.pathname === '/sw.js') return;

  // التنقّل: الشبكة أولاً ثم النسخة المخزّنة من '/'
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok && url.pathname === '/') {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/', copy)).catch(() => {});
          }
          return res;
        })
        .catch(() =>
          caches.match('/').then((cached) => cached || new Response(
            '<!doctype html><meta charset="utf-8"><title>غير متصل</title><body dir="rtl" style="font-family:sans-serif;text-align:center;padding:40px">لا يوجد اتصال بالإنترنت</body>',
            { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          ))
        )
    );
    return;
  }

  // الملفات الثابتة من نفس الأصل: stale-while-revalidate
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res && res.ok && res.type === 'basic') {
              cache.put(req, res.clone()).catch(() => {});
            }
            return res;
          })
          .catch(() => cached);
        if (cached) {
          event.waitUntil(network.catch(() => {}));
          return cached;
        }
        return network.then((res) => res || Response.error());
      })
    )
  );
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { title: 'إشعار', body: (event.data && event.data.text && event.data.text()) || '' };
  }

  const title = payload.title || 'إشعار';
  const url = payload.url || '/';

  // أيقونة بسيطة عبر data-URI (دائرة خضراء) — تجنّباً للاعتماد على ملفات خارجية
  const icon = 'data:image/svg+xml;base64,' + btoa(
    '<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192">' +
    '<rect width="192" height="192" rx="32" fill="#0f766e"/>' +
    '<text x="96" y="120" font-size="90" text-anchor="middle" fill="#ffffff" font-family="sans-serif">ق</text>' +
    '</svg>'
  );

  const options = {
    body: payload.body || '',
    tag: payload.tag || undefined,
    icon: icon,
    badge: icon,
    dir: 'rtl',
    lang: 'ar',
    data: { url: url }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        // إن كانت نافذة مفتوحة، ركّز عليها ووجّهها
        if ('focus' in client) {
          try {
            if ('navigate' in client && targetUrl) client.navigate(targetUrl);
          } catch (e) {}
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
