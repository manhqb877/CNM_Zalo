'use client';

import Image from 'next/image';
import { useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import {
  AlertTriangle,
  Bell,
  Bookmark,
  ChevronRight,
  Heart,
  MessageSquare,
  UserPlus,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react';

import { DashboardIcon } from '../atoms/dashboard-icon';
import type {
  DashboardActivityItem,
  DashboardFriendActivityItem,
  DashboardIconName,
  DashboardNotificationItem,
  DashboardStatItem,
} from '../home-dashboard.types';

type IconComponent = ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;

interface DashboardCardProps {
  title: string;
  icon: IconComponent;
  badge?: string | number;
  actionLabel?: string;
  onAction?: () => void;
  children: ReactNode;
  className?: string;
}

export function DashboardCard({
  title,
  icon: Icon,
  badge,
  actionLabel,
  onAction,
  children,
  className = '',
}: DashboardCardProps) {
  return (
    <section className={`zync-dashboard-card p-4 sm:p-5 ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="zync-icon-block h-9 w-9 shrink-0 rounded-2xl">
            <Icon className="h-[18px] w-[18px]" aria-hidden />
          </span>
          <h2 className="font-ui-title truncate text-base text-text-primary">{title}</h2>
          {badge !== undefined && Number(badge) > 0 && (
            <span className="zync-count-badge h-5 min-w-5 rounded-full px-1.5 text-[11px] font-bold">
              {Number(badge) > 99 ? '99+' : badge}
            </span>
          )}
        </div>

        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            className="zync-soft-badge shrink-0 gap-1 px-3 py-1.5 text-xs font-semibold transition hover:border-border-mint hover:bg-surface-tint hover:text-status-text"
          >
            {actionLabel}
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

interface StatCardProps {
  item: DashboardStatItem;
  onClick: () => void;
  compactLabel?: string;
}

export function StatCard({ item, onClick, compactLabel }: StatCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="zync-stat-card group min-h-[124px] p-4 text-left active:scale-[0.99]"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="zync-icon-block h-10 w-10 rounded-2xl">
          <DashboardIcon name={item.icon} className="h-[18px] w-[18px]" />
        </span>
        {item.badge && (
          <span className="zync-count-badge rounded-full px-2.5 py-1 text-[11px] font-bold">
            {item.badge}
          </span>
        )}
      </div>
      <div className="mt-5">
        <p className="font-ui-title text-3xl leading-none text-text-primary">{item.value}</p>
        <p className="font-ui-content mt-1.5 truncate text-sm font-semibold text-text-secondary">
          {compactLabel ?? item.label}
        </p>
      </div>
    </button>
  );
}

interface RecentActivityItemProps {
  item: DashboardActivityItem;
  onClick: () => void;
}

export function RecentActivityItem({ item, onClick }: RecentActivityItemProps) {
  const [imageError, setImageError] = useState(false);

  const avatarUrl = item.avatarUrl || (item as any).avatar || (item as any).photoUrl || (item as any).imageUrl || (item as any).profile?.avatarUrl;
  const showImage = avatarUrl && !imageError;
  const hasImage = Boolean(avatarUrl && /^(https?:\/\/|\/)/.test(avatarUrl));

  return (
    <button
      type="button"
      onClick={onClick}
      className="zync-list-item grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[1.2rem] px-2.5 py-2.5 text-left active:scale-[0.99]"
    >
      <span className="zync-icon-block relative h-11 w-11 rounded-2xl text-sm font-bold flex items-center justify-center overflow-hidden border border-border-light">
        {showImage && hasImage ? (
          <Image
            src={avatarUrl}
            alt={item.title}
            width={44}
            height={44}
            className="h-full w-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : item.icon ? (
          <DashboardIcon name={item.icon} className="h-[18px] w-[18px]" />
        ) : (
          item.initials
        )}
        {item.isUnread && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-bg-card bg-accent" />}
      </span>

      <span className="min-w-0">
        <span className="font-ui-title block truncate text-sm text-text-primary">{item.title}</span>
        <span className="font-ui-content mt-0.5 block truncate text-xs font-medium text-text-secondary">{item.message}</span>
      </span>

      <span className="font-ui-meta whitespace-nowrap text-[10px] text-text-tertiary">{item.timeLabel}</span>
    </button>
  );
}

function notificationIcon(type: DashboardNotificationItem['type']): IconComponent {
  if (type === 'new_message') return MessageSquare as IconComponent;
  if (type === 'friend_request' || type === 'friend_accepted') return UserPlus as IconComponent;
  if (type === 'group_invite' || type === 'group_update') return Users as IconComponent;
  if (type === 'post_like') return Heart as IconComponent;
  if (type === 'post_bookmark') return Bookmark as IconComponent;
  return Bell as IconComponent;
}

export function NotificationItem({ item, onClick }: { item: DashboardNotificationItem; onClick: () => void }) {
  const Icon = notificationIcon(item.type);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`zync-list-item grid w-full grid-cols-[auto_1fr] gap-3 rounded-[1.2rem] px-2.5 py-2.5 text-left active:scale-[0.99] ${
        item.isRead ? '' : 'bg-status-bg'
      }`}
    >
      <span className="zync-icon-block relative h-10 w-10 shrink-0 overflow-hidden rounded-2xl">
        {item.avatarUrl ? (
          <Image src={item.avatarUrl} alt={item.title} width={40} height={40} className="h-full w-full object-cover" />
        ) : (
          <Icon className="h-[18px] w-[18px]" aria-hidden />
        )}
        {!item.isRead && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-accent" />}
      </span>

      <span className="min-w-0">
        <span className="font-ui-title block truncate text-sm text-text-primary">{item.title}</span>
        <span className="font-ui-content mt-0.5 block line-clamp-2 text-xs font-medium leading-5 text-text-secondary">{item.body}</span>
        <span className="font-ui-meta mt-1 block text-[10px] text-text-tertiary">{item.timeLabel}</span>
      </span>
    </button>
  );
}

export function FriendActivityPill({ item, onClick }: { item: DashboardFriendActivityItem; onClick: () => void }) {
  const online = item.action === 'online';
  const StatusIcon = (online ? Wifi : WifiOff) as IconComponent;

  return (
    <button
      type="button"
      onClick={onClick}
      className="zync-list-item flex w-full items-center gap-3 rounded-[1.2rem] px-2.5 py-2.5 text-left"
    >
      <span className="relative h-10 w-10 shrink-0">
        {item.userAvatar ? (
          <Image src={item.userAvatar} alt={item.userName} width={40} height={40} className="h-10 w-10 rounded-full object-cover" />
        ) : (
          <span className="zync-icon-block flex h-10 w-10 rounded-full text-xs font-bold">{item.initials}</span>
        )}
        <span className={`absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-bg-card ${online ? 'zync-status-badge' : 'bg-bg-hover text-text-tertiary ring-1 ring-border-light'}`}>
          <StatusIcon className="h-2.5 w-2.5" aria-hidden />
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="font-ui-title block truncate text-sm text-text-primary">{item.userName}</span>
        <span className="font-ui-content block truncate text-xs text-text-secondary">{online ? 'Đang trực tuyến' : item.target ?? 'Ngoại tuyến'}</span>
      </span>
      <span className={`h-2 w-2 rounded-full ${online ? 'bg-accent' : 'bg-border'}`} />
    </button>
  );
}

export function QuickActionCard({
  title,
  label,
  icon,
  onClick,
}: {
  title: string;
  label: string;
  icon: IconComponent;
  onClick: () => void;
}) {
  const Icon = icon;

  return (
    <button
      type="button"
      onClick={onClick}
      className="zync-quick-action-card group p-4 text-left active:scale-[0.99]"
    >
      <span className="zync-icon-block zync-icon-block-primary mb-4 h-11 w-11 rounded-2xl transition group-hover:bg-accent group-hover:text-bg-card">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span className="font-ui-title block text-sm text-text-primary">{title}</span>
      <span className="font-ui-content mt-1 block text-xs text-text-secondary">{label}</span>
    </button>
  );
}

export function EmptyState({
  icon = AlertTriangle as IconComponent,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon?: IconComponent;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const Icon = icon;

  return (
    <div className="zync-empty-state flex min-h-[180px] flex-col items-center justify-center rounded-[1.35rem] px-5 py-8 text-center">
      <span className="zync-icon-block h-12 w-12 rounded-2xl text-text-tertiary">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <p className="font-ui-title mt-3 text-sm text-text-primary">{title}</p>
      <p className="font-ui-content mt-1 max-w-[240px] text-xs leading-5 text-text-secondary">{description}</p>
      {actionLabel && onAction && (
        <button type="button" onClick={onAction} className="zync-soft-button mt-4 px-4 py-2 text-xs">
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function iconNameForStat(statId: string): DashboardIconName {
  if (statId === 'stat-2') return 'friends';
  if (statId === 'stat-3') return 'group';
  if (statId === 'stat-4') return 'bell';
  return 'message';
}
