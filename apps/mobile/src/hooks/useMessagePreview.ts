import { useCallback, useEffect, useRef, useState } from 'react';
import { socketService } from '../services/socket';

export interface MessagePreviewItem {
  id: string;
  senderName: string;
  body: string;
  conversationId: string;
  fromUserId: string;
  isGroup: boolean;
  avatarInitial: string;
  timestamp: number;
}

interface Notification {
  _id: string;
  type: string;
  title: string;
  body: string;
  conversationId?: string;
  fromUserId?: string;
  data?: Record<string, string>;
}

const MAX_PREVIEWS = 2;
const AUTO_DISMISS_MS = 6000;

export function useMessagePreview(activeConversationId: string | null) {
  const [previews, setPreviews] = useState<MessagePreviewItem[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pausedRef = useRef<Set<string>>(new Set());

  const dismissPreview = useCallback((id: string) => {
    setPreviews((prev) => prev.filter((p) => p.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    pausedRef.current.delete(id);
  }, []);

  const startDismissTimer = useCallback(
    (id: string) => {
      const existing = timersRef.current.get(id);
      if (existing) clearTimeout(existing);

      const timer = setTimeout(() => {
        if (!pausedRef.current.has(id)) {
          dismissPreview(id);
        }
      }, AUTO_DISMISS_MS);
      timersRef.current.set(id, timer);
    },
    [dismissPreview],
  );

  const pauseDismiss = useCallback((id: string) => {
    pausedRef.current.add(id);
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const resumeDismiss = useCallback(
    (id: string) => {
      pausedRef.current.delete(id);
      startDismissTimer(id);
    },
    [startDismissTimer],
  );

  const quickReply = useCallback((conversationId: string, content: string): boolean => {
    if (!content.trim()) return false;
    const idempotencyKey = `qr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return socketService.sendQuickReply(conversationId, content.trim(), idempotencyKey);
  }, []);

  useEffect(() => {
    const socket = socketService.getSocket();
    if (!socket) return;

    const handleNotification = (notification: Notification) => {
      if (notification.type !== 'new_message') return;
      if (!notification.conversationId) return;
      if (notification.conversationId === activeConversationId) return;

      let senderName = 'Nguoi dung';
      const titleMatch = notification.title.match(/^Tin nhắn mới từ (.+)$/);
      if (titleMatch) senderName = titleMatch[1];

      const nameParts = senderName.trim().split(/\s+/).filter(Boolean);
      const avatarInitial = nameParts[0]?.[0]?.toUpperCase() ?? 'N';

      const isGroup = notification.data?.action === 'open_chat' && notification.title.includes('nhóm');

      const previewId = `preview-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

      const newItem: MessagePreviewItem = {
        id: previewId,
        senderName,
        body: notification.body,
        conversationId: notification.conversationId,
        fromUserId: notification.fromUserId ?? '',
        isGroup,
        avatarInitial,
        timestamp: Date.now(),
      };

      setPreviews((prev) => {
        const updated = [newItem, ...prev];
        if (updated.length > MAX_PREVIEWS) {
          const removed = updated.slice(MAX_PREVIEWS);
          removed.forEach((r) => {
            const timer = timersRef.current.get(r.id);
            if (timer) {
              clearTimeout(timer);
              timersRef.current.delete(r.id);
            }
          });
          return updated.slice(0, MAX_PREVIEWS);
        }
        return updated;
      });

      startDismissTimer(previewId);
    };

    socket.on('new_notification', handleNotification);
    return () => {
      socket.off('new_notification', handleNotification);
    };
  }, [activeConversationId, startDismissTimer]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => clearTimeout(timer));
      timersRef.current.clear();
    };
  }, []);

  return {
    previews,
    dismissPreview,
    pauseDismiss,
    resumeDismiss,
    quickReply,
  };
}
