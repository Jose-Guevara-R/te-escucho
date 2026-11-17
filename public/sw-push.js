/* Zero-PII & Staff Emergency Web Push Service Worker Extension for Te Escucho (Desktop PWA + Android) */

self.addEventListener('push', (event) => {
  let payload = {
    title: 'Espacio Inspira',
    body: 'Tienes una nueva cápsula de bienestar disponible para revisar a tu ritmo.',
    url: '/?open=vault',
    tag: 'te-escucho-calm-update',
    requireInteraction: false,
    renotify: false,
    urgent: false,
  };

  try {
    if (event.data) {
      const parsed = event.data.json();
      if (parsed && typeof parsed === 'object') {
        payload = {
          title: typeof parsed.title === 'string' ? parsed.title : payload.title,
          body: typeof parsed.body === 'string' ? parsed.body : payload.body,
          url: typeof parsed.url === 'string' ? parsed.url : payload.url,
          tag: typeof parsed.tag === 'string' ? parsed.tag : payload.tag,
          requireInteraction: Boolean(parsed.requireInteraction),
          renotify: Boolean(parsed.renotify),
          urgent: Boolean(parsed.urgent),
        };
      }
    }
  } catch {
    // Keep neutral fallback copy on parse error to never leak sensitive text
  }

  const options = {
    body: payload.body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: payload.tag,
    renotify: payload.renotify,
    requireInteraction: payload.requireInteraction,
    silent: false,
    data: { url: payload.url },
    ...(payload.urgent ? { vibrate: [220, 110, 220, 110, 280] } : {}),
  };

  event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(async (clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            await client.focus();
            client.postMessage({ type: 'TE_ESCUCHO_OPEN_CASE', url: targetUrl });
            return client;
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
        return undefined;
      })
  );
});
