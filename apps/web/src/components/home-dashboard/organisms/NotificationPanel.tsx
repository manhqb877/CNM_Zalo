'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { ComponentType } from 'react';
import { Bell, Bookmark, Heart, MessageCircle, Settings, UserCheck, Users, X } from 'lucide-react';
import type { Notification } from '@/services/notifications';

interface NotificationPanelProps {
  notifications: Notification[];
  isLoading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onMarkAllRead: () => void;
  onMarkRead: (ids: string[]) => void;
  onClickNotification: (notification: Notification) => void;
  onClose: () => void;
  onOpenSettings: () => void;
}

type NotificationIcon = ComponentType<{ className?: string }>;
const BellIcon = Bell as unknown as NotificationIcon;
const BookmarkIcon = Bookmark as unknown as NotificationIcon;
const HeartIcon = Heart as unknown as NotificationIcon;
const MessageCircleIcon = MessageCircle as unknown as NotificationIcon;
const SettingsIcon = Settings as unknown as NotificationIcon;
const UserCheckIcon = UserCheck as unknown as NotificationIcon;
const UsersIcon = Users as unknown as NotificationIcon;
const XIcon = X as unknown as NotificationIcon;

const TYPE_ICONS: Record<Notification['type'], NotificationIcon> = {
  new_message: MessageCircleIcon,
  friend_request: UsersIcon,
  friend_accepted: UserCheckIcon,
  group_invite: UsersIcon,
  group_update: UsersIcon,
  post_like: HeartIcon,
  post_comment: MessageCircleIcon,
  post_bookmark: BookmarkIcon,
  community_post: MessageCircleIcon,
};

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'vừa xong';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ngày trước`;
  return new Date(dateStr).toLocaleDateString('vi-VN');
}

export function NotificationPanel({
  notifications,
  isLoading,
  hasMore,
  onLoadMore,
  onMarkAllRead,
  onMarkRead,
  onClickNotification,
  onClose,
  onOpenSettings,
}: NotificationPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || isLoading || !hasMore) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 60) {
      onLoadMore();
    }
  }, [isLoading, hasMore, onLoadMore]);

  const handleClickItem = (notification: Notification) => {
    if (!notification.read) onMarkRead([notification._id]);
    onClickNotification(notification);
  };

  const unreadCount = notifications.filter((item) => !item.read).length;

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-[calc(100%+10px)] z-50 w-[400px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[var(--radius-card)] zync-notification-panel"
      style={{ animation: 'panelSlide 0.2s ease-out' }}
      role="dialog"
      aria-label="Danh sách thông báo"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border-soft bg-[var(--surface)] px-4 py-3">
        <div>
          <h3 className="font-ui-title text-base text-text-primary">Thông báo</h3>
          <p className="font-ui-content text-xs text-text-tertiary">{unreadCount} mục chưa đọc</p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button type="button" onClick={onMarkAllRead} className="zync-soft-button-ghost px-2.5 py-1 text-xs">
              Đọc hết
            </button>
          )}
          <button type="button" onClick={onOpenSettings} className="zync-soft-button-ghost h-8 w-8 p-0" aria-label="Cài đặt thông báo">
            <SettingsIcon className="h-4 w-4 shrink-0" />
          </button>
          <button type="button" onClick={onClose} className="zync-soft-button-ghost h-8 w-8 p-0" aria-label="Đóng">
            <XIcon className="h-4 w-4 shrink-0" />
          </button>
        </div>
      </div>

      <div ref={scrollRef} onScroll={handleScroll} className="zync-scroll-area max-h-[70vh] overflow-y-auto px-2 py-2">
        {notifications.length === 0 && !isLoading && (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <span className="zync-soft-badge">Inbox zero</span>
            <p className="font-ui-content text-sm text-text-secondary">Không có thông báo nào</p>
          </div>
        )}

        {notifications.length > 0 && unreadCount === 0 && !isLoading && (
          <div className="mb-2 rounded-[1.1rem] border border-border-soft bg-[var(--surface-muted)] px-3 py-2 text-center text-xs font-medium text-text-secondary">
            Tất cả thông báo đã đọc
          </div>
        )}

        {notifications.map((notification) => (
          <button
            key={notification._id}
            type="button"
            onClick={() => handleClickItem(notification)}
            className={`mb-2 flex w-full items-start gap-3 rounded-[1.15rem] border px-3.5 py-3 text-left transition ${
              notification.read
                ? 'border-transparent bg-[var(--surface-glass)] hover:border-border hover:bg-[var(--surface-glass-strong)]'
                : 'border-border-soft bg-[var(--accent-soft)] hover:border-border-strong'
            }`}
          >
            <div className="mt-1.5 flex-shrink-0">
              {!notification.read ? (
                <span className="block h-2.5 w-2.5 rounded-full bg-accent shadow-sm" />
              ) : (
                <span className="block h-2.5 w-2.5 rounded-full bg-border" />
              )}
            </div>

            <span className="mt-0.5 inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-border bg-[var(--surface-glass)] text-accent-strong">
              {(() => {
                const Icon = TYPE_ICONS[notification.type] ?? BellIcon;
                return <Icon className="h-3.5 w-3.5" />;
              })()}
            </span>

            <div className="min-w-0 flex-1">
              <p className="font-ui-title text-[13px] leading-snug text-text-primary">{notification.title}</p>
              <p className="font-ui-content mt-0.5 truncate text-xs text-text-secondary">{notification.body}</p>
              <p className="font-ui-content mt-1 text-[10px] text-text-tertiary">{relativeTime(notification.createdAt)}</p>
            </div>
          </button>
        ))}

        {isLoading && (
          <div className="space-y-2 px-2 py-2">
            {[1, 2, 3].map((item) => (
              <div key={item} className="rounded-[1.2rem] border border-border bg-[var(--surface-glass)] px-4 py-3">
                <div className="h-3 w-24 animate-pulse rounded bg-bg-hover" />
                <div className="mt-2 h-3 w-3/4 animate-pulse rounded bg-bg-hover" />
              </div>
            ))}
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes panelSlide {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
