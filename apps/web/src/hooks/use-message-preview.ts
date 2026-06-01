'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { getSocket, sendQuickReply } from '@/services/socket';
import { getAccessToken } from '@/utils/auth-token';
import type { Notification } from '@/services/notifications';

export interface MessagePreviewItem {
  id: string;
  senderName: string;
  body: string;
  conversationId: string;
  fromUserId: string;
  isGroup: boolean;
  avatarInitials: string;
  avatarUrl?: string;
  timestamp: number;
}

const MAX_PREVIEWS = 3;
const AUTO_DISMISS_MS = 8000;

interface UseMessagePreviewOptions {
  selectedConversationId: string;
  conversations: Array<{
    id: string;
    name: string;
    avatarUrl?: string;
    isGroup?: boolean;
    mutedUntil?: Date | string | null;
    members?: Array<{ _id: string; displayName: string; avatarUrl?: string }>;
  }>;
}

export function useMessagePreview({
  selectedConversationId,
  conversations,
}: UseMessagePreviewOptions) {
  const [previews, setPreviews] = useState<MessagePreviewItem[]>([]);
  const timersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
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

  const quickReply = useCallback(
    (conversationId: string, content: string) => {
      if (!content.trim()) return;

      const idempotencyKey = uuidv4();
      try {
        sendQuickReply(conversationId, content.trim(), idempotencyKey);
        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;

    const socket = getSocket(token);

    const handleNotification = (notification: Notification) => {
      if (notification.type !== 'new_message') return;
      if (notification.conversationId === selectedConversationId) return;
      if (!notification.conversationId) return;

      const conv = conversations.find(
        (c) => c.id === notification.conversationId,
      );

      const mutedUntil = conv?.mutedUntil ? new Date(conv.mutedUntil) : null;
      const isConversationMuted = Boolean(
        mutedUntil && !Number.isNaN(mutedUntil.getTime()) && mutedUntil.getTime() > Date.now(),
      );
      if (isConversationMuted) {
        return;
      }

      let senderName = 'Người dùng';
      let avatarInitials = 'ND';
      let avatarUrl: string | undefined;
      const isGroup = conv?.isGroup ?? false;

      if (conv) {
        if (isGroup) {
          const sender = conv.members?.find(
            (m) => m._id === notification.fromUserId,
          );
          senderName = sender?.displayName ?? conv.name;
          avatarUrl = sender?.avatarUrl;
        } else {
          const otherUser = conv.members?.find(
            (m) => m._id === notification.fromUserId,
          );
          senderName = otherUser?.displayName ?? conv.name;
          avatarUrl = otherUser?.avatarUrl ?? conv.avatarUrl;
        }
      } else {
        const titleMatch = notification.title.match(/^Tin nhắn mới từ (.+)$/);
        if (titleMatch) senderName = titleMatch[1];
      }

      const nameParts = senderName.trim().split(/\s+/).filter(Boolean);
      avatarInitials =
        nameParts.length > 1
          ? `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase()
          : nameParts[0]?.substring(0, 2).toUpperCase() ?? 'ND';

      const previewId = `preview-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

      const newItem: MessagePreviewItem = {
        id: previewId,
        senderName,
        body: notification.body,
        conversationId: notification.conversationId,
        fromUserId: notification.fromUserId ?? '',
        isGroup,
        avatarInitials,
        avatarUrl,
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
  }, [selectedConversationId, conversations, startDismissTimer]);

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
