'use client';

import React from 'react';
import { Users, MessageCircle, FileText, Search, WifiOff, AlertTriangle } from 'lucide-react';

export type EmptyStateVariant = 'no-friends' | 'no-messages' | 'no-posts' | 'no-results' | 'offline' | 'error';

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
}

export interface EmptyStateProps {
  variant: EmptyStateVariant;
  title?: string;
  description?: string;
  action?: EmptyStateAction;
  className?: string;
}

const EMPTY_STATE_CONFIG: Record<EmptyStateVariant, {
  icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
  defaultTitle: string;
  defaultDescription: string;
  defaultAction?: { label: string; actionType: 'navigate' | 'retry' | 'custom' };
}> = {
  'no-friends': {
    icon: Users,
    defaultTitle: 'Chưa có bạn bè',
    defaultDescription: 'Tìm và kết bạn với developer khác',
    defaultAction: { label: 'Khám phá →', actionType: 'navigate' },
  },
  'no-messages': {
    icon: MessageCircle,
    defaultTitle: 'Chưa có tin nhắn',
    defaultDescription: 'Bắt đầu cuộc trò chuyện đầu tiên',
    defaultAction: { label: 'Nhắn tin →', actionType: 'navigate' },
  },
  'no-posts': {
    icon: FileText,
    defaultTitle: 'Chưa có bài viết',
    defaultDescription: 'Chia sẻ kiến thức với cộng đồng',
    defaultAction: { label: 'Viết bài →', actionType: 'navigate' },
  },
  'no-results': {
    icon: Search,
    defaultTitle: 'Không tìm thấy kết quả',
    defaultDescription: 'Thử tìm với từ khóa khác',
  },
  'offline': {
    icon: WifiOff,
    defaultTitle: 'Không có kết nối',
    defaultDescription: 'Kiểm tra kết nối internet',
    defaultAction: { label: 'Thử lại', actionType: 'retry' },
  },
  'error': {
    icon: AlertTriangle,
    defaultTitle: 'Đã xảy ra lỗi',
    defaultDescription: 'Vui lòng thử lại sau',
    defaultAction: { label: 'Thử lại', actionType: 'retry' },
  },
};

export function EmptyState({
  variant,
  title,
  description,
  action,
  className = '',
}: EmptyStateProps) {
  const config = EMPTY_STATE_CONFIG[variant];
  const IconComponent = config.icon;

  const displayTitle = title ?? config.defaultTitle;
  const displayDescription = description ?? config.defaultDescription;
  const displayAction = action ?? (config.defaultAction
    ? { label: config.defaultAction.label, onClick: () => {} }
    : undefined);

  return (
      <div
        className={`flex flex-col items-center justify-center gap-4 p-8 text-center animate-zync-fade-in ${className}`}
      >
      <div
        className="flex items-center justify-center w-16 h-16 rounded-full"
        style={{ backgroundColor: 'var(--bg-hover)' }}
      >
        <IconComponent size={32} className="opacity-40" style={{ color: 'var(--text-secondary)' }} />
      </div>

      <div className="flex flex-col gap-1">
        <h3
          className="text-lg font-semibold"
          style={{ color: 'var(--text-primary)' }}
        >
          {displayTitle}
        </h3>
        <p
          className="text-sm max-w-xs"
          style={{ color: 'var(--text-secondary)' }}
        >
          {displayDescription}
        </p>
      </div>

      {displayAction && (
        <button
          type="button"
          onClick={displayAction.onClick}
          className="mt-2 px-5 py-2 rounded-xl text-sm font-medium transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
          style={{
            backgroundColor: 'var(--accent-primary)',
            color: '#fff',
          }}
        >
          {displayAction.label}
        </button>
      )}
    </div>
  );
}

export default EmptyState;
