/* eslint-disable no-restricted-globals */

const ICON_PATH = '/icon-192.png';
const BADGE_PATH = '/icon-badge.png';
const DEFAULT_URL = '/';

// H3.1 – Listen to push events and display native notification
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Zync', body: event.data.text() };
  }

  const title = payload.title || 'Zync';
  const options = {
    body: payload.body || '',
    icon: ICON_PATH,
    badge: BADGE_PATH,
    vibrate: [200, 100, 200],
    tag: payload.data?.conversationId || 'zync-notification',
    renotify: true,
    data: payload.data || {},
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// H3.2 – Handle notification click → focus/open tab with deep link
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  let targetUrl = DEFAULT_URL;

  if (data.action === 'open_chat' && data.conversationId) {
    targetUrl = `/home?conv=${data.conversationId}`;
  } else if (data.action === 'open_friend_requests') {
    targetUrl = '/home?tab=friends';
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.navigate(targetUrl);
          return;
        }
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});

// H3.3 – Handle push subscription change → auto re-subscribe
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.registration.pushManager
      .subscribe(event.oldSubscription?.options || { userVisibleOnly: true })
      .then((subscription) => {
        const json = subscription.toJSON();
        return fetch('/api/notifications/web-push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: json.endpoint,
            keys: json.keys,
          }),
        });
      }),
  );
});
