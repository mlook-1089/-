// Service Worker — إشعارات Web Push لمنصة حلقة ابن كثير

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
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
