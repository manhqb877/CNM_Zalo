'use client';

import { type ComponentType, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  Bell,
  Heart,
  MessageCircle,
  MessageSquare,
  SendHorizontal,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { getSocket, sendQuickReply } from '@/services/socket';
import { getAccessToken } from '@/utils/auth-token';
import type { Notification } from '@/services/notifications';
import { markAsRead } from '@/services/notifications';
import { ACCOUNT_SETTINGS_EVENT, loadCachedAccountSettings, type AccountSettings } from '@/services/account-settings';
import { isConversationVisible } from '@/services/active-conversation';

type ToastIcon = ComponentType<{ className?: string }>;
const MessageCircleIcon = MessageCircle as unknown as ToastIcon;
const UserPlusIcon = UserPlus as unknown as ToastIcon;
const UserCheckIcon = UserCheck as unknown as ToastIcon;
const UsersIcon = Users as unknown as ToastIcon;
const HeartIcon = Heart as unknown as ToastIcon;
const MessageSquareIcon = MessageSquare as unknown as ToastIcon;
const BellIcon = Bell as unknown as ToastIcon;
const SendHorizontalIcon = SendHorizontal as unknown as ToastIcon;
const XIcon = X as unknown as ToastIcon;

type ToastAction = {
  label: string;
  variant?: 'primary' | 'danger' | 'secondary';
  onClick: () => void;
};

type ToastItem = {
  id: string;
  notification: Notification;
  createdAt: number;
  variant?: 'info' | 'success' | 'warning' | 'error';
  onPress?: () => void;
  actions?: ToastAction[];
};

const MAX_TOASTS = 3;
const AUTO_DISMISS_MS = 5500;
const SUMMARY_ID = 'toast-summary';
export const WEB_IN_APP_TOAST_EVENT = 'zync:web-in-app-toast';

export type WebInAppToastDetail = {
  id?: string;
  type?: Notification['type'];
  title: string;
  body: string;
  variant?: ToastItem['variant'];
  durationMs?: number;
  dismiss?: boolean;
  onPress?: () => void;
  actions?: ToastItem['actions'];
};

export function showSystemToast(detail: WebInAppToastDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(WEB_IN_APP_TOAST_EVENT, {
    detail: {
      ...detail,
      id: detail.id ?? `system-toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    },
  }));
}

function IconForType({ type, isSummary }: { type?: Notification['type'], isSummary?: boolean }) {
  if (isSummary) return <BellIcon className="h-5 w-5 text-accent" />;
  switch (type) {
    case 'new_message': return <MessageCircleIcon className="h-5 w-5 text-blue-500" />;
    case 'friend_request': return <UserPlusIcon className="h-5 w-5 text-amber-500" />;
    case 'friend_accepted': return <UserCheckIcon className="h-5 w-5 text-emerald-500" />;
    case 'group_invite':
    case 'group_update':
      return <UsersIcon className="h-5 w-5 text-indigo-500" />;
    case 'post_like':
      return <HeartIcon className="h-5 w-5 text-rose-500" />;
    case 'post_comment':
      return <MessageSquareIcon className="h-5 w-5 text-purple-500" />;
    case 'post_bookmark': return <MessageSquareIcon className="h-5 w-5 text-amber-500" />;
    case 'community_post': return <BellIcon className="h-5 w-5 text-accent" />;
    default: return <BellIcon className="h-5 w-5 text-text-secondary" />;
  }
}

function timeLabel(ts: number): string {
  return new Date(ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function createIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `quick-reply-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function InAppNotificationToasts() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [items, setItems] = useState<ToastItem[]>([]);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const activeReplyToastIdsRef = useRef<Set<string>>(new Set());
  const overflowCountRef = useRef<number>(0);
  const toastEnabledRef = useRef<boolean>(true);

  const dismiss = useCallback((id: string) => {
    activeReplyToastIdsRef.current.delete(id);
    setItems((prev) => prev.filter((t) => t.id !== id));
    setReplyDrafts((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const scheduleDismiss = useCallback(
    (id: string, durationMs: number = AUTO_DISMISS_MS) => {
      const existing = timersRef.current.get(id);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        timersRef.current.delete(id);
        if (activeReplyToastIdsRef.current.has(id)) {
          return;
        }
        dismiss(id);
      }, durationMs);
      timersRef.current.set(id, timer);
    },
    [dismiss],
  );

  const pauseDismiss = useCallback((id: string) => {
    activeReplyToastIdsRef.current.add(id);
    const existing = timersRef.current.get(id);
    if (!existing) return;
    clearTimeout(existing);
    timersRef.current.delete(id);
  }, []);

  const resumeDismiss = useCallback((id: string, durationMs: number = 3500) => {
    activeReplyToastIdsRef.current.delete(id);
    scheduleDismiss(id, durationMs);
  }, [scheduleDismiss]);

  const navigateFrom = useCallback(
    async (n: Notification) => {
      try {
        if (!n.read) {
          await markAsRead([n._id]);
        }
      } catch {
        // best effort
      }

      if (n.type === 'friend_request' || n.type === 'friend_accepted') {
        router.push('/friends?tab=requests');
        return;
      }

      const data = n.data as Record<string, string> | undefined;
      if (data?.action === 'group_deleted' || data?.action === 'group_removed') {
        router.push('/home');
        return;
      }

      if (data?.action === 'open_community' && data?.postId) {
        router.push(`/community?post=${encodeURIComponent(data.postId)}`);
        return;
      }

      const conversationId = n.conversationId ?? data?.conversationId;
      if (conversationId) {
        router.push(`/chat?conversationId=${encodeURIComponent(conversationId)}`);
        return;
      }

      router.push('/home');
    },
    [router],
  );

  const handleQuickReply = useCallback((toastId: string, conversationId?: string) => {
    const content = replyDrafts[toastId]?.trim();
    if (!conversationId || !content) return;

    try {
      sendQuickReply(conversationId, content, createIdempotencyKey());
      dismiss(toastId);
      showSystemToast({
        title: 'Đã gửi trả lời',
        body: content,
        variant: 'success',
        durationMs: 2200,
      });
    } catch {
      showSystemToast({
        title: 'Không thể gửi trả lời',
        body: 'Kết nối socket chưa sẵn sàng. Vui lòng thử lại.',
        variant: 'error',
        durationMs: 3200,
      });
    }
  }, [dismiss, replyDrafts]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    toastEnabledRef.current = loadCachedAccountSettings().toastNotifications;

    const handleSettingsUpdate = (event: Event) => {
      const detail = (event as CustomEvent<AccountSettings>).detail;
      if (detail) {
        toastEnabledRef.current = detail.toastNotifications;
      }
    };

    window.addEventListener(ACCOUNT_SETTINGS_EVENT, handleSettingsUpdate);
    return () => window.removeEventListener(ACCOUNT_SETTINGS_EVENT, handleSettingsUpdate);
  }, []);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;

    const socket = getSocket(token);

    const handler = (notification: Notification) => {
      if (notification.type === 'new_message' && isConversationVisible(notification.conversationId)) {
        if (!notification.read) {
          void markAsRead([notification._id]).catch(() => {});
        }
        return;
      }

      if (!toastEnabledRef.current) {
        return;
      }

      const now = Date.now();
      const id = `toast-${notification._id}-${now}-${Math.random().toString(36).slice(2, 6)}`;

      overflowCountRef.current = 0;
      setItems((prev) => [
        { id, notification, createdAt: now, onPress: () => { void navigateFrom(notification); } },
        ...prev.filter((item) => item.notification._id !== notification._id),
      ].slice(0, MAX_TOASTS));
      scheduleDismiss(id);
    };

    socket.on('new_notification', handler);
    return () => {
      socket.off('new_notification', handler);
    };
  }, [navigateFrom, scheduleDismiss]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<WebInAppToastDetail>).detail;
      if (!detail?.id) return;
      if (detail.dismiss) {
        dismiss(detail.id);
        return;
      }
      if (!detail.title) return;

      const now = Date.now();
      const id = detail.id;
      const notification: Notification = {
        _id: id,
        userId: '',
        type: detail.type ?? 'community_post',
        title: detail.title,
        body: detail.body,
        read: true,
        createdAt: new Date(now).toISOString(),
      };

      const existingTimer = timersRef.current.get(id);
      if (existingTimer) clearTimeout(existingTimer);
      setItems((prev) => [
        {
          id,
          notification,
          createdAt: now,
          variant: detail.variant,
          onPress: detail.onPress,
          actions: detail.actions,
        },
        ...prev.filter((t) => t.id !== id),
      ].slice(0, MAX_TOASTS));
      scheduleDismiss(id, detail.durationMs ?? AUTO_DISMISS_MS);
    };

    window.addEventListener(WEB_IN_APP_TOAST_EVENT, handler);
    return () => window.removeEventListener(WEB_IN_APP_TOAST_EVENT, handler);
  }, [dismiss, scheduleDismiss]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => clearTimeout(timer));
      timersRef.current.clear();
    };
  }, []);

  const getDefaultActions = useCallback(
    (toast: ToastItem): ToastAction[] => {
      if (toast.actions) return toast.actions;
      if (!toast.onPress) return [];

      const primaryLabel = toast.notification.type === 'new_message'
        ? 'Mở hội thoại'
        : toast.notification.type === 'friend_request'
          ? 'Xem lời mời'
          : toast.notification.type === 'friend_accepted'
            ? 'Mở bạn bè'
            : 'Mở';

      return [
        {
          label: primaryLabel,
          variant: 'primary',
          onClick: toast.onPress,
        },
      ];
    },
    [],
  );

  const rendered = useMemo(() => {
    return items.map((toast) => {
      const isSummary = toast.id === SUMMARY_ID;
      const label = timeLabel(toast.createdAt);
      const actions = getDefaultActions(toast);
      const canQuickReply = toast.notification.type === 'new_message' && Boolean(toast.notification.conversationId);
      const draft = replyDrafts[toast.id] ?? '';

      return (
        <div
          key={toast.id}
          className="pointer-events-auto w-full overflow-hidden rounded-2xl border border-border bg-bg-card/95 text-text-primary shadow-[0_16px_60px_rgba(15,23,42,0.18)] backdrop-blur-xl dark:shadow-[0_16px_60px_rgba(0,0,0,0.45)] sm:w-[410px]"
          style={{ animation: 'toastSlideIn 0.22s cubic-bezier(0.16, 1, 0.3, 1)' }}
        >
          <div className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-bg-hover/70">
            <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-border bg-bg-hover text-base">
              <IconForType type={toast.notification.type} isSummary={isSummary} />
            </div>

            <div className="min-w-0 flex-1 pr-6">
              <div className="flex items-center justify-between gap-3">
                <p className="font-ui-title truncate text-sm text-text-primary">{toast.notification.title}</p>
                <span className="font-ui-content flex-shrink-0 text-[10px] text-text-tertiary">{label}</span>
              </div>
              <p className={`font-ui-content mt-1 ${isSummary ? 'line-clamp-1' : 'line-clamp-3'} text-xs leading-relaxed text-text-secondary`}>
                {toast.notification.body}
              </p>
              {toast.notification.conversationId && (
                <p className="font-ui-content mt-1 truncate text-[10px] text-text-tertiary">
                  Hội thoại: {toast.notification.data?.conversationName ?? toast.notification.title.replace(/^Tin nhắn mới từ\s+/i, '')}
                </p>
              )}

              {canQuickReply && (
                <form
                  className="mt-3 flex gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    handleQuickReply(toast.id, toast.notification.conversationId);
                  }}
                  onClick={(event) => event.stopPropagation()}
                  onFocus={() => pauseDismiss(toast.id)}
                  onBlur={(event) => {
                    const nextTarget = event.relatedTarget;
                    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
                      return;
                    }
                    resumeDismiss(toast.id);
                  }}
                >
                  <input
                    value={draft}
                    onChange={(event) => {
                      pauseDismiss(toast.id);
                      setReplyDrafts((prev) => ({ ...prev, [toast.id]: event.target.value }));
                    }}
                    placeholder="Trả lời nhanh..."
                    maxLength={1000}
                    className="min-w-0 flex-1 rounded-lg border border-border bg-bg-hover px-3 py-2 text-xs text-text-primary outline-none placeholder:text-text-tertiary focus:border-accent"
                  />
                  <button
                    type="submit"
                    disabled={!draft.trim()}
                    className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-accent text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="Gửi trả lời nhanh"
                  >
                    <SendHorizontalIcon className="h-4 w-4" />
                  </button>
                </form>
              )}

              {actions.length > 0 && (
                <div className="mt-3 flex gap-2">
                  {actions.map((action) => (
                    <span
                      key={action.label}
                      role="button"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        action.onClick();
                        dismiss(toast.id);
                      }}
                      className={`inline-flex flex-1 items-center justify-center rounded-lg px-3 py-2 text-xs font-semibold transition ${
                        action.variant === 'danger'
                          ? 'bg-red-500 text-white hover:bg-red-600'
                          : action.variant === 'secondary'
                            ? 'border border-border bg-bg-hover text-text-primary hover:bg-bg-active'
                            : 'bg-accent text-white hover:bg-accent-hover'
                      }`}
                    >
                      {action.label}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <span
              role="button"
              aria-label="Đóng"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                dismiss(toast.id);
              }}
              className="mt-0.5 inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
            >
              <XIcon className="h-4 w-4" />
            </span>
          </div>
        </div>
      );
    });
  }, [dismiss, getDefaultActions, handleQuickReply, items, pauseDismiss, replyDrafts, resumeDismiss]);

  if (!mounted || items.length === 0) return null;

  return createPortal(
    <div className="pointer-events-none fixed bottom-5 left-4 right-4 z-[9999] flex flex-col-reverse items-end gap-2 sm:left-auto sm:right-5">
      {rendered}
      <style jsx>{`
        @keyframes toastSlideIn {
          from { opacity: 0; transform: translate3d(24px, 10px, 0); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>,
    document.body,
  );
}
