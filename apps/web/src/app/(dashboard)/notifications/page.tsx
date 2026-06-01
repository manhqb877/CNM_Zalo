'use client';

import { Suspense, useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ComponentType } from 'react';
import {
  Bell,
  Bookmark,
  Check,
  Heart,
  MessageCircle,
  UserCheck,
  Users,
} from 'lucide-react';
import { useNotifications } from '@/hooks/use-notifications';
import type { Notification } from '@/services/notifications';
import { PageLoading } from '@/components/shared/page-loading';
import { ZyncPageTransition } from '@/components/shared/ZyncPageTransition';

type NotificationIcon = ComponentType<{ className?: string }>;

const BellIcon = Bell as unknown as NotificationIcon;
const BookmarkIcon = Bookmark as unknown as NotificationIcon;
const CheckIcon = Check as unknown as NotificationIcon;
const HeartIcon = Heart as unknown as NotificationIcon;
const MessageCircleIcon = MessageCircle as unknown as NotificationIcon;
const UserCheckIcon = UserCheck as unknown as NotificationIcon;
const UsersIcon = Users as unknown as NotificationIcon;

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

type TabFilter = 'all' | 'unread';

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

function NotificationsPageContent() {
  const router = useRouter();
  const {
    notifications,
    unreadCount,
    isLoading,
    hasMore,
    loadMore,
    markRead,
    markAllRead,
  } = useNotifications();

  const [activeTab, setActiveTab] = useState<TabFilter>('all');

  const filteredNotifications = useMemo(() => {
    if (activeTab === 'unread') {
      return notifications.filter((n) => !n.read);
    }
    return notifications;
  }, [notifications, activeTab]);

  const handleClickNotification = useCallback(
    (notification: Notification) => {
      // Mark as read
      if (!notification.read) {
        void markRead([notification._id]);
      }

      // Navigate based on type
      const conversationId = notification.conversationId ?? notification.data?.conversationId;
      const action = notification.data?.action;

      if (action === 'group_deleted' || action === 'group_removed') {
        router.push('/home');
        return;
      }

      if (action === 'open_chat') {
        router.push(conversationId ? `/chat?conversationId=${conversationId}` : '/chat');
        return;
      }

      if (action === 'open_friend_requests') {
        router.push('/friends#requests');
        return;
      }

      if (notification.type === 'new_message' || notification.type === 'group_invite' || notification.type === 'group_update') {
        router.push(conversationId ? `/chat?conversationId=${conversationId}` : '/chat');
        return;
      }

      if (notification.type === 'friend_request' || notification.type === 'friend_accepted') {
        router.push('/friends#requests');
        return;
      }

      if (
        notification.type === 'community_post' ||
        notification.data?.action === 'open_community'
      ) {
        const postId = notification.data?.postId;
        router.push(postId ? `/community?post=${encodeURIComponent(postId)}` : '/community');
        return;
      }

      if (
        notification.type === 'post_like' ||
        notification.type === 'post_comment' ||
        notification.type === 'post_bookmark'
      ) {
        const postId = notification.data?.postId;
        router.push(postId ? `/community?post=${encodeURIComponent(postId)}` : '/community');
        return;
      }

      router.push('/home');
    },
    [markRead, router],
  );

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      if (isLoading || !hasMore) return;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80) {
        void loadMore();
      }
    },
    [isLoading, hasMore, loadMore],
  );

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-border-soft bg-[var(--surface)] px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-ui-title text-xl text-text-primary">Thông báo</h1>
          <p className="font-ui-content mt-1 text-sm text-text-secondary">
            {unreadCount > 0
              ? `${unreadCount} thông báo chưa đọc`
              : 'Tất cả thông báo đã đọc'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => void markAllRead()}
              className="zync-soft-button-ghost inline-flex items-center gap-1.5 px-3 py-1.5 text-sm"
            >
              <CheckIcon className="h-4 w-4" />
              Đánh dấu tất cả đã đọc
            </button>
          )}
        </div>
      </div>

      {/* Tab filter */}
      <div className="flex gap-1 border-b border-border-soft bg-[var(--surface)] px-6 py-2">
        <button
          type="button"
          onClick={() => setActiveTab('all')}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
            activeTab === 'all'
              ? 'bg-accent text-white shadow-sm'
              : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
          }`}
        >
          Tất cả
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('unread')}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
            activeTab === 'unread'
              ? 'bg-accent text-white shadow-sm'
              : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
          }`}
        >
          Chưa đọc
          {unreadCount > 0 && (
            <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white/20 px-1 text-xs">
              {unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* Notification list */}
      <div
        className="zync-scroll-area flex-1 overflow-y-auto px-4 py-4 sm:px-6"
        onScroll={handleScroll}
      >
        {/* Empty states */}
        {filteredNotifications.length === 0 && !isLoading && (
          <div className="flex flex-col items-center gap-4 px-4 py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-border bg-[var(--surface-glass)]">
              <BellIcon className="h-7 w-7 text-text-tertiary" />
            </div>
            <div>
              <p className="font-ui-title text-base text-text-primary">
                {activeTab === 'unread' ? 'Không có thông báo chưa đọc' : 'Chưa có thông báo nào'}
              </p>
              <p className="font-ui-content mt-1 text-sm text-text-tertiary">
                {activeTab === 'unread'
                  ? 'Bạn đã đọc tất cả thông báo.'
                  : 'Khi có hoạt động mới, thông báo sẽ hiển thị ở đây.'}
              </p>
            </div>
            {activeTab === 'unread' && notifications.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab('all')}
                className="zync-soft-button-ghost px-4 py-2 text-sm"
              >
                Xem tất cả thông báo
              </button>
            )}
          </div>
        )}

        {/* All-read banner */}
        {filteredNotifications.length > 0 && unreadCount === 0 && activeTab === 'all' && !isLoading && (
          <div className="mb-4 rounded-2xl border border-border-soft bg-[var(--surface-muted)] px-4 py-2.5 text-center text-sm font-medium text-text-secondary">
            ✓ Tất cả thông báo đã đọc
          </div>
        )}

        {/* Notification items */}
        <div className="space-y-2">
          {filteredNotifications.map((notification) => (
            <button
              key={notification._id}
              type="button"
              onClick={() => handleClickNotification(notification)}
              className={`flex w-full items-start gap-3.5 rounded-2xl border px-4 py-3.5 text-left transition ${
                notification.read
                  ? 'border-transparent bg-[var(--surface-glass)] hover:border-border hover:bg-[var(--surface-glass-strong)]'
                  : 'border-border-soft bg-[var(--accent-soft)] hover:border-border-strong'
              }`}
            >
              {/* Unread indicator */}
              <div className="mt-2 flex-shrink-0">
                {!notification.read ? (
                  <span className="block h-2.5 w-2.5 rounded-full bg-accent shadow-sm" />
                ) : (
                  <span className="block h-2.5 w-2.5 rounded-full bg-border" />
                )}
              </div>

              {/* Type icon */}
              <span className="mt-0.5 inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-border bg-[var(--surface-glass)] text-accent-strong">
                {(() => {
                  const Icon = TYPE_ICONS[notification.type] ?? BellIcon;
                  return <Icon className="h-4 w-4" />;
                })()}
              </span>

              {/* Content */}
              <div className="min-w-0 flex-1">
                <p className="font-ui-title text-sm leading-snug text-text-primary">
                  {notification.title}
                </p>
                <p className="font-ui-content mt-0.5 line-clamp-2 text-sm text-text-secondary">
                  {notification.body}
                </p>
                <p className="font-ui-content mt-1.5 text-xs text-text-tertiary">
                  {relativeTime(notification.createdAt)}
                </p>
              </div>
            </button>
          ))}
        </div>

        {/* Loading skeleton */}
        {isLoading && (
          <div className="space-y-2 py-2">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-border bg-[var(--surface-glass)] px-4 py-4"
              >
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 animate-pulse rounded-full bg-bg-hover" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 w-32 animate-pulse rounded bg-bg-hover" />
                    <div className="h-3 w-3/4 animate-pulse rounded bg-bg-hover" />
                    <div className="h-2.5 w-20 animate-pulse rounded bg-bg-hover" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <Suspense fallback={<PageLoading variant="generic" mode="panel" />}>
      <ZyncPageTransition className="flex h-full w-full min-h-0 min-w-0 flex-1 flex-col">
        <NotificationsPageContent />
      </ZyncPageTransition>
    </Suspense>
  );
}
