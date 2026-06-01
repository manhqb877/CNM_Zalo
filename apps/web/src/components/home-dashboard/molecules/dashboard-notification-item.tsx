'use client';

import Image from 'next/image';
import type { ComponentType } from 'react';
import type { DashboardNotificationItem } from '../home-dashboard.types';
import { Bell, Bookmark, MessageSquare, UserPlus, Users, Heart } from 'lucide-react';

interface DashboardNotificationItemProps {
  item: DashboardNotificationItem;
  onClick?: (item: DashboardNotificationItem) => void;
}

type DashboardNotificationIcon = ComponentType<{ className?: string }>;
const BellIcon = Bell as unknown as DashboardNotificationIcon;
const BookmarkIcon = Bookmark as unknown as DashboardNotificationIcon;
const MessageSquareIcon = MessageSquare as unknown as DashboardNotificationIcon;
const UserPlusIcon = UserPlus as unknown as DashboardNotificationIcon;
const UsersIcon = Users as unknown as DashboardNotificationIcon;
const HeartIcon = Heart as unknown as DashboardNotificationIcon;

/**
 * Lấy icon dựa trên loại notification
 */
function getNotificationIcon(type: DashboardNotificationItem['type']) {
  switch (type) {
    case 'new_message':
      return MessageSquareIcon;
    case 'friend_request':
      return UserPlusIcon;
    case 'friend_accepted':
      return UserPlusIcon;
    case 'group_invite':
    case 'group_update':
      return UsersIcon;
    case 'community_post':
    case 'post_comment':
      return MessageSquareIcon;
    case 'post_like':
      return HeartIcon;
    case 'post_bookmark':
      return BookmarkIcon;
    default:
      return BellIcon;
  }
}

/**
 * Lấy màu sắc dựa trên loại notification
 */
function getNotificationColor(type: DashboardNotificationItem['type']): string {
  switch (type) {
    case 'new_message':
      return 'bg-[#0f9d8e]';
    case 'friend_request':
    case 'friend_accepted':
      return 'bg-[#8b5cf6]';
    case 'group_invite':
    case 'group_update':
      return 'bg-[#f59e0b]';
    case 'community_post':
    case 'post_comment':
      return 'bg-[#0f9d8e]';
    case 'post_like':
      return 'bg-[#ec4899]';
    case 'post_bookmark':
      return 'bg-[#f59e0b]';
    default:
      return 'bg-[#97a7b8]';
  }
}

export function DashboardNotificationItemRow({ item, onClick }: DashboardNotificationItemProps) {
  const IconComponent = getNotificationIcon(item.type);
  const colorClass = getNotificationColor(item.type);

  return (
    <article
      className={`group grid cursor-pointer grid-cols-[auto_1fr] items-start gap-3 rounded-[1.2rem] border border-transparent px-3 py-3.5 transition-all hover:border-border hover:bg-bg-hover active:scale-[0.99] ${
        !item.isRead ? 'bg-accent-light/30' : ''
      }`}
      onClick={() => onClick?.(item)}
    >
      {/* Avatar / Icon */}
      <div className="relative">
        {item.avatarUrl ? (
          <span className={`flex h-11 w-11 items-center justify-center rounded-xl text-sm font-semibold text-white shadow-sm ${item.toneClass}`}>
            <Image
              src={item.avatarUrl}
              alt={item.title}
              width={44}
              height={44}
              className="h-full w-full rounded-xl object-cover"
            />
          </span>
        ) : (
          <span className={`flex h-11 w-11 items-center justify-center rounded-xl shadow-sm ${colorClass}`}>
            <IconComponent className="h-[18px] w-[18px] text-white" />
          </span>
        )}
        {/* Unread dot */}
        {!item.isRead && (
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-white" />
          </span>
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p className={`font-ui-title text-sm ${!item.isRead ? 'font-semibold text-text-primary' : 'font-medium text-text-primary/80'}`}>
          {item.title}
        </p>
        <p className="font-ui-content mt-0.5 line-clamp-2 text-xs font-medium text-text-secondary">
          {item.body}
        </p>
        <span className="font-ui-meta mt-1.5 inline-block text-[10px] font-medium text-text-secondary">
          {item.timeLabel}
        </span>
      </div>
    </article>
  );
}
