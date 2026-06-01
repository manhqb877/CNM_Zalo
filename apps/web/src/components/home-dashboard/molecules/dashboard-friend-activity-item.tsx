'use client';

import Image from 'next/image';
import type { DashboardFriendActivityItem } from '../home-dashboard.types';
import { Wifi, WifiOff, FileText, Heart, MessageSquare, Share2 } from 'lucide-react';

interface DashboardFriendActivityItemProps {
  item: DashboardFriendActivityItem;
  onClick?: (item: DashboardFriendActivityItem) => void;
}

/**
 * Lấy icon dựa trên loại hoạt động
 */
function getActivityIcon(action: DashboardFriendActivityItem['action']) {
  switch (action) {
    case 'online':
      return Wifi;
    case 'offline':
      return WifiOff;
    case 'posted':
      return FileText;
    case 'reacted':
      return Heart;
    case 'commented':
      return MessageSquare;
    case 'shared':
      return Share2;
    default:
      return FileText;
  }
}

/**
 * Lấy màu sắc và label dựa trên loại hoạt động
 */
function getActivityStyle(action: DashboardFriendActivityItem['action']): { color: string; label: string } {
  switch (action) {
    case 'online':
      return { color: 'bg-emerald-500', label: 'Đang trực tuyến' };
    case 'offline':
      return { color: 'bg-[#97a7b8]', label: 'Offline' };
    case 'posted':
      return { color: 'bg-[#3b82f6]', label: 'Đã đăng' };
    case 'reacted':
      return { color: 'bg-[#ec4899]', label: 'Đã reaction' };
    case 'commented':
      return { color: 'bg-[#8b5cf6]', label: 'Đã bình luận' };
    case 'shared':
      return { color: 'bg-[#f59e0b]', label: 'Đã chia sẻ' };
    default:
      return { color: 'bg-[#97a7b8]', label: 'Hoạt động' };
  }
}

export function DashboardFriendActivityItemRow({ item, onClick }: DashboardFriendActivityItemProps) {
  const IconComponent = getActivityIcon(item.action);
  const { color: colorClass, label: actionLabel } = getActivityStyle(item.action);

  return (
    <article
      className="group flex cursor-pointer items-center gap-3 rounded-[1.1rem] border border-transparent px-3 py-2.5 transition-all hover:border-border hover:bg-bg-hover active:scale-[0.99]"
      onClick={() => onClick?.(item)}
    >
      {/* Avatar với badge trạng thái */}
      <div className="relative flex-shrink-0">
        {item.userAvatar ? (
          <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full ring-2 ring-white shadow-sm">
            <Image
              src={item.userAvatar}
              alt={item.userName}
              width={40}
              height={40}
              className="h-full w-full object-cover"
            />
          </span>
        ) : (
          <span className={`flex h-10 w-10 items-center justify-center rounded-full text-xs font-semibold text-white shadow-sm ring-2 ring-white ${item.toneClass}`}>
            {item.initials}
          </span>
        )}
        {/* Badge trạng thái */}
        <span className={`absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full ${colorClass} shadow-sm ring-1 ring-white`}>
          <IconComponent className="h-2.5 w-2.5 text-white" />
        </span>
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="font-ui-title truncate text-xs font-semibold text-text-primary">{item.userName}</p>
          {item.action === 'online' && (
            <span className="flex h-1.5 w-1.5 flex-shrink-0 animate-pulse rounded-full bg-emerald-400" />
          )}
        </div>
        <p className="font-ui-content mt-0.5 truncate text-[11px] font-medium text-text-secondary">
          {actionLabel}
          {item.target && (
            <span className="ml-1 font-normal text-text-secondary">{item.target}</span>
          )}
        </p>
      </div>

      {/* Time */}
      <span className="font-ui-meta flex-shrink-0 text-[10px] font-medium text-text-secondary">
        {item.timeLabel}
      </span>
    </article>
  );
}
