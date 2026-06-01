import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import {
  fetchNotifications,
  fetchUnreadCount,
  markAsRead as apiMarkAsRead,
  markAllAsRead as apiMarkAllAsRead,
  type AppNotification,
} from '../services/notifications';
import { socketService } from '../services/socket';

export function useNotifications(isAuthenticated: boolean) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const cursorRef = useRef<string | null>(null);

  const refreshUnreadCount = useCallback(async () => {
    try {
      const count = await fetchUnreadCount();
      setUnreadCount(count);
    } catch {
      setError('Không thể tải số thông báo chưa đọc');
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      cursorRef.current = null;
      const result = await fetchNotifications(undefined, 20);
      setNotifications(result.notifications);
      cursorRef.current = result.nextCursor;
      setHasMore(result.nextCursor !== null);
    } catch {
      setError('Không thể tải thông báo');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!hasMore || isLoading || !cursorRef.current) return;
    try {
      setIsLoading(true);
      setError(null);
      const result = await fetchNotifications(cursorRef.current, 20);
      setNotifications((prev) => [...prev, ...result.notifications]);
      cursorRef.current = result.nextCursor;
      setHasMore(result.nextCursor !== null);
    } catch {
      setError('Không thể tải thêm thông báo');
    } finally {
      setIsLoading(false);
    }
  }, [hasMore, isLoading]);

  const markRead = useCallback(
    async (ids: string[]) => {
      let newlyRead = 0;
      setNotifications((prev) => {
        const next = prev.map((n) => {
          if (ids.includes(n._id) && !n.read) {
            newlyRead += 1;
            return { ...n, read: true };
          }
          return n;
        });
        return next;
      });
      if (newlyRead > 0) {
        setUnreadCount((c) => Math.max(0, c - newlyRead));
      }

      try {
        await apiMarkAsRead(ids);
      } catch {
        await refreshUnreadCount();
      }
    },
    [refreshUnreadCount],
  );

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);

    try {
      await apiMarkAllAsRead();
    } catch {
      await refreshUnreadCount();
    }
  }, [refreshUnreadCount]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void refreshUnreadCount();
  }, [isAuthenticated, refreshUnreadCount]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const onAppState = (next: AppStateStatus) => {
      if (next === 'active') void refreshUnreadCount();
    };
    const sub = AppState.addEventListener('change', onAppState);
    return () => sub.remove();
  }, [isAuthenticated, refreshUnreadCount]);

  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;
    let off: (() => void) | undefined;

    const attach = () => {
      const sock = socketService.getSocket();
      if (!sock || cancelled) return;
      const handler = (notification: AppNotification) => {
        setNotifications((prev) => {
          if (prev.some((p) => p._id === notification._id)) return prev;
          return [notification, ...prev];
        });
        setUnreadCount((c) => (notification.read ? c : c + 1));
      };
      sock.on('new_notification', handler);
      off = () => sock.off('new_notification', handler);
    };

    void (async () => {
      await socketService.connect();
      if (cancelled) return;
      attach();
    })();

    return () => {
      cancelled = true;
      off?.();
    };
  }, [isAuthenticated]);

  return useMemo(
    () => ({
      notifications,
      unreadCount,
      isLoading,
      error,
      hasMore,
      loadNotifications,
      loadMore,
      markRead,
      markAllRead,
      refreshUnreadCount,
    }),
    [
      notifications,
      unreadCount,
      isLoading,
      error,
      hasMore,
      loadNotifications,
      loadMore,
      markRead,
      markAllRead,
      refreshUnreadCount,
    ],
  );
}
