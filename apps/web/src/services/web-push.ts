import { apiClient } from './api';

const SW_PATH = '/sw.js';

// H2.1 – Request browser notification permission
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    console.warn('This browser does not support notifications');
    return 'denied';
  }

  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';

  return Notification.requestPermission();
}

// H2.2 – Get VAPID public key from server
export async function getVapidKey(): Promise<string | null> {
  try {
    const { data } = await apiClient.get<{
      success: boolean;
      configured: boolean;
      vapidPublicKey: string | null;
    }>('/api/notifications/web-push/vapid-key');
    return data.vapidPublicKey;
  } catch {
    console.error('Failed to fetch VAPID key');
    return null;
  }
}

// H2.3 – Subscribe to push notifications via Service Worker
export async function subscribeToPush(): Promise<boolean> {
  try {
    const permission = await requestNotificationPermission();
    if (permission !== 'granted') return false;

    if (!('serviceWorker' in navigator)) {
      console.warn('Service Worker not supported');
      return false;
    }

    const registration = await navigator.serviceWorker.register(SW_PATH);
    await navigator.serviceWorker.ready;

    const vapidKey = await getVapidKey();
    if (!vapidKey) {
      console.warn('VAPID key not configured on server');
      return false;
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey).buffer as ArrayBuffer,
    });

    const json = subscription.toJSON();
    await apiClient.post('/api/notifications/web-push/subscribe', {
      endpoint: json.endpoint,
      keys: json.keys,
    });

    return true;
  } catch (err) {
    console.error('Failed to subscribe to push', err);
    return false;
  }
}

// H2.4 – Unsubscribe from push notifications
export async function unsubscribeFromPush(): Promise<boolean> {
  try {
    if (!('serviceWorker' in navigator)) return false;

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (!subscription) return true;

    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();

    await apiClient.delete('/api/notifications/web-push/unsubscribe', {
      data: { endpoint },
    });

    return true;
  } catch (err) {
    console.error('Failed to unsubscribe from push', err);
    return false;
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
