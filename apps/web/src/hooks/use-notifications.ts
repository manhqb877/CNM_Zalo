'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSocket } from '@/services/socket';
import { getAccessToken } from '@/utils/auth-token';
import {
  fetchNotifications,
  fetchUnreadCount,
  markAsRead as apiMarkAsRead,
  markAllAsRead as apiMarkAllAsRead,
  fetchPreferences,
  updatePreferences as apiUpdatePreferences,
  type Notification,
  type NotificationPreferences,
} from '@/services/notifications';
import { subscribeToPush, requestNotificationPermission } from '@/services/web-push';
import { isConversationVisible } from '@/services/active-conversation';

const NOTIFICATION_SOUND_URL = '/sounds/notification.mp3';

export function useNotifications() {
  // I1.1 – State
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const cursorRef = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // I1.2 – Load first page of notifications
  const loadNotifications = useCallback(async () => {
    try {
      setIsLoading(true);
      cursorRef.current = null;
      const result = await fetchNotifications(undefined, 20);
      setNotifications(result.notifications);
      cursorRef.current = result.nextCursor;
      setHasMore(result.nextCursor !== null);
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, []);

  // I1.3 – Load more (next page)
  const loadMore = useCallback(async () => {
    if (!hasMore || isLoading || !cursorRef.current) return;

    try {
      setIsLoading(true);
      const result = await fetchNotifications(cursorRef.current, 20);
      setNotifications((prev) => [...prev, ...result.notifications]);
      cursorRef.current = result.nextCursor;
      setHasMore(result.nextCursor !== null);
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, [hasMore, isLoading]);

  // I1.5 – Mark specific notifications as read (optimistic)
  const markRead = useCallback(async (ids: string[]) => {
    setNotifications((prev) =>
      prev.map((n) => (ids.includes(n._id) ? { ...n, read: true } : n)),
    );
    setUnreadCount((prev) => Math.max(0, prev - ids.length));

    try {
      await apiMarkAsRead(ids);
    } catch {
      // revert on error – refresh count
      const count = await fetchUnreadCount();
      setUnreadCount(count);
    }
  }, []);

  // I1.6 – Mark all as read (optimistic)
  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);

    try {
      await apiMarkAllAsRead();
    } catch {
      const count = await fetchUnreadCount();
      setUnreadCount(count);
    }
  }, []);

  // I1.7 – Refresh unread count
  const refreshUnreadCount = useCallback(async () => {
    try {
      const count = await fetchUnreadCount();
      setUnreadCount(count);
    } catch {
      // silent
    }
  }, []);

  // I1.10 – Load preferences
  const loadPreferences = useCallback(async () => {
    try {
      const prefs = await fetchPreferences();
      setPreferences(prefs);
    } catch {
      // silent
    }
  }, []);

  // I1.11 – Update preferences
  const updatePreferences = useCallback(
    async (prefs: { enablePush?: boolean; enableSound?: boolean; enableBadge?: boolean }) => {
      try {
        const updated = await apiUpdatePreferences(prefs);
        setPreferences(updated);
      } catch {
        // silent
      }
    },
    [],
  );

  // I1.8 – Play notification sound
  const playSound = useCallback(() => {
    if (!preferences?.enableSound) return;

    try {
      if (!audioRef.current) {
        audioRef.current = new Audio(NOTIFICATION_SOUND_URL);
        audioRef.current.volume = 0.5;
      }
      void audioRef.current.play().catch(() => {});
    } catch {
      // audio play can fail silently
    }
  }, [preferences?.enableSound]);

  // I1.4 – Subscribe to Socket.IO `new_notification` event
  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;

    const socket = getSocket(token);

    const handleNewNotification = (notification: Notification) => {
      if (notification.type === 'new_message' && isConversationVisible(notification.conversationId)) {
        void apiMarkAsRead([notification._id]).catch(() => {});
        setNotifications((prev) =>
          prev.some((item) => item._id === notification._id)
            ? prev.map((item) => (item._id === notification._id ? { ...item, read: true } : item))
            : prev,
        );
        return;
      }

      setNotifications((prev) => [notification, ...prev]);
      setUnreadCount((prev) => prev + 1);
      playSound();
    };

    socket.on('new_notification', handleNewNotification);

    return () => {
      socket.off('new_notification', handleNewNotification);
    };
  }, [playSound]);

  // I1.7 – Poll unread count when tab gets focus
  useEffect(() => {
    const handleFocus = () => {
      void refreshUnreadCount();
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [refreshUnreadCount]);

  // I1.9 – Auto-request push permission on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'default') return;

    const timer = setTimeout(() => {
      void (async () => {
        const perm = await requestNotificationPermission();
        if (perm === 'granted') {
          await subscribeToPush();
        }
      })();
    }, 5000);

    return () => clearTimeout(timer);
  }, []);

  return {
    notifications,
    unreadCount,
    preferences,
    isLoading,
    hasMore,
    loadNotifications,
    loadMore,
    markRead,
    markAllRead,
    refreshUnreadCount,
    loadPreferences,
    updatePreferences,
  };
}
