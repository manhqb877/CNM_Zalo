'use client';

import type { AiItemStatus } from '@zync/shared-types';
import { ButtonSpinner } from '@/components/shared/loading-system';

interface StatusBadgeProps {
  status: AiItemStatus;
  className?: string;
}

const STATUS_CONFIG: Record<AiItemStatus, { label: string; colorClass: string; spinner?: boolean }> = {
  not_started: { label: 'Chưa bắt đầu', colorClass: 'text-text-tertiary' },
  queued: { label: 'Đang xếp hàng', colorClass: 'text-blue-500', spinner: true },
  processing: { label: 'Đang xử lý', colorClass: 'text-blue-500', spinner: true },
  ready: { label: 'Sẵn sàng', colorClass: 'text-green-600' },
  failed: { label: 'Lỗi', colorClass: 'text-red-500' },
};

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${config.colorClass} ${className}`}>
      {config.spinner && <ButtonSpinner size="xs" tone="muted" />}
      {config.label}
    </span>
  );
}

interface DigestStatusDotProps {
  status: AiItemStatus;
}

export function DigestStatusDot({ status }: DigestStatusDotProps) {
  const dotClass: Record<AiItemStatus, string> = {
    not_started: 'bg-gray-400',
    queued: 'bg-blue-400',
    processing: 'bg-blue-500 animate-pulse',
    ready: 'bg-green-500',
    failed: 'bg-red-500',
  };

  return (
    <span className={`inline-block h-2 w-2 rounded-full ${dotClass[status]}`} aria-hidden />
  );
}
