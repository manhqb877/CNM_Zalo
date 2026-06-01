import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { NotificationsSheet } from '../components/NotificationsSheet';
import { useNotifications } from '../hooks/useNotifications';
import type { NotificationAnchorRect } from '../services/notifications';
import { useAuthStore } from '../store/useAuthStore';
import { socketService } from '../services/socket';
import { InAppNotificationOverlay, type InAppToastItem } from '../components/InAppNotificationOverlay';
import { useRouter } from 'expo-router';
import type { AppNotification } from '../services/notifications';

export type { NotificationAnchorRect };

type NotificationsContextValue = ReturnType<typeof useNotifications> & {
  sheetVisible: boolean;
  openNotificationSheet: (anchor?: NotificationAnchorRect | null) => void;
  closeNotificationSheet: () => void;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const notificationsApi = useNotifications(isAuthenticated);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [anchorRect, setAnchorRect] = useState<NotificationAnchorRect | null>(null);
  const [toasts, setToasts] = useState<InAppToastItem[]>([]);
  const overflowCountRef = useRef<number>(0);
  const SUMMARY_TOAST_ID = 'toast-summary';
  const router = useRouter();
  const lastToastAtRef = useRef<number>(0);

  const openNotificationSheet = useCallback(
    (anchor?: NotificationAnchorRect | null) => {
      setAnchorRect(anchor ?? null);
      setSheetVisible(true);
      void notificationsApi.loadNotifications();
    },
    [notificationsApi],
  );

  const closeNotificationSheet = useCallback(() => {
    setSheetVisible(false);
    setAnchorRect(null);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const navigateFromNotification = useCallback(
    (n: AppNotification) => {
      const postId = n.data?.postId || n.data?.communityPostId;

      if (n.conversationId) {
        router.push({
          pathname: '/chat-room',
          params: {
            conversationId: n.conversationId,
            name: n.title.replace(/^Tin nhắn mới từ\s+/i, '').replace(/^Nhóm:\s*/i, '') || 'Chat',
            avatarUrl: '',
            isGroup: n.type === 'group_invite' || n.type === 'group_update' || n.title.toLowerCase().includes('nhóm') ? 'true' : 'false',
          },
        });
        return;
      }

      if (n.type === 'friend_request' || n.type === 'friend_accepted') {
        router.push('/(tabs)/friends');
        return;
      }

      if (postId) {
        router.push({ pathname: '/post-detail', params: { postId } });
        return;
      }

      router.push('/(tabs)/community');
    },
    [router],
  );

  const toastNotificationRef = useRef<Map<string, AppNotification>>(new Map());

  const onPressToastItem = useCallback(
    (id: string) => {
      const n = toastNotificationRef.current.get(id);
      if (!n) {
        dismissToast(id);
        return;
      }
      if (!n.read) {
        void notificationsApi.markRead([n._id]);
      }
      dismissToast(id);
      navigateFromNotification(n);
    },
    [dismissToast, navigateFromNotification, notificationsApi],
  );

  // Listen socket events globally to show in-app toast on every screen.
  useEffect(() => {
    if (!isAuthenticated) return;

    let off: (() => void) | undefined;
    let cancelled = false;

    const attach = () => {
      const sock = socketService.getSocket();
      if (!sock || cancelled) return;
      const handler = (notification: AppNotification) => {
        const now = Date.now();
        // Lightweight dedupe to avoid toast spam bursts
        if (now - lastToastAtRef.current < 250) return;
        lastToastAtRef.current = now;

        const id = `toast-${notification._id}-${now}`;
        toastNotificationRef.current.set(id, notification);

        const icon =
          notification.type === 'new_message'
            ? '💬'
            : notification.type === 'friend_request'
              ? '🤝'
              : notification.type === 'friend_accepted'
                ? '🎉'
                : notification.type === 'group_invite' || notification.type === 'group_update'
                  ? '👥'
                  : '🔔';

        setToasts((prev) => {
          // Remove existing summary from the list for easier composing
          const withoutSummary = prev.filter((t) => t.id !== SUMMARY_TOAST_ID);
          const incoming: InAppToastItem = {
            id,
            title: notification.title,
            body: notification.body,
            icon,
            createdAt: now,
            variant: 'single',
          };

          // If we still have room (<2), keep as-is and reset overflow
          if (withoutSummary.length < 2) {
            overflowCountRef.current = 0;
            return [incoming, ...withoutSummary].slice(0, 2);
          }

          // We already have 2 singles; keep newest on top, and show summary as 2nd item
          overflowCountRef.current += 1;
          const summary: InAppToastItem = {
            id: SUMMARY_TOAST_ID,
            title: `${overflowCountRef.current + 1} thông báo mới`,
            body: 'Nhấn để xem danh sách thông báo',
            icon: '🔔',
            createdAt: now,
            variant: 'summary',
          };
          return [incoming, summary];
        });
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

  const value = useMemo(
    () => ({
      ...notificationsApi,
      sheetVisible,
      openNotificationSheet,
      closeNotificationSheet,
    }),
    [notificationsApi, sheetVisible, openNotificationSheet, closeNotificationSheet],
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
      <InAppNotificationOverlay
        items={toasts}
        topOffset={0}
        onPressItem={(id) => {
          if (id === SUMMARY_TOAST_ID) {
            // Open notifications list (dropdown) and reset overflow
            overflowCountRef.current = 0;
            setToasts([]);
            openNotificationSheet(null);
            return;
          }
          onPressToastItem(id);
        }}
        onDismissItem={(id) => {
          toastNotificationRef.current.delete(id);
          dismissToast(id);
        }}
      />
      <NotificationsSheet
        visible={sheetVisible}
        anchorRect={anchorRect}
        onClose={closeNotificationSheet}
        notifications={notificationsApi.notifications}
        isLoading={notificationsApi.isLoading}
        error={notificationsApi.error}
        hasMore={notificationsApi.hasMore}
        onLoadMore={notificationsApi.loadMore}
        onMarkRead={notificationsApi.markRead}
        onMarkAllRead={notificationsApi.markAllRead}
      />
    </NotificationsContext.Provider>
  );
}

export function useNotificationsContext(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error('useNotificationsContext must be used within NotificationsProvider');
  }
  return ctx;
}
