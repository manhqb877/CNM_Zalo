'use client';

import { useState } from 'react';
import Image from 'next/image';
import { MessageSquare } from 'lucide-react';
import { StatusBadge } from './status-badge';
import { DigestPreview } from './digest-preview';
import type { AiAssistantItem } from '@zync/shared-types';
import { ButtonSpinner } from '@/components/shared/loading-system';

interface ConversationItemProps {
  /** Tên conversation */
  name: string;
  /** Avatar URL */
  avatarUrl?: string;
  /** Loại conversation */
  type: 'direct' | 'group';
  /** Số tin chưa đọc */
  unreadCount: number;
  /** Thời gian tin mới nhất (ISO) */
  latestMessageAt?: string;
  /** AI state từ AiAssistantItem */
  aiItem?: AiAssistantItem;
  /** Detail digest (nếu có, từ socket inline) */
  digestDetail?: {
    summary?: {
      title: string;
      overview: string;
      bullets: string[];
    };
    futureSignals?: {
      questionsForUser: string[];
      actionItems: Array<{ text: string; sourceMessageRefs: string[] }>;
      suggestedReplies: string[];
    };
    generatedAt?: string;
    omittedOlderCount?: number;
  };
  /** User đang loading item này */
  loading?: boolean;
  /** Đang regenerate */
  regenerating?: boolean;
  /** Handler bấm Tóm tắt */
  onSummarize?: (conversationId: string) => void;
  /** Handler bấm Tạo lại */
  onRegenerate?: (conversationId: string) => void;
  /** Handler bấm Mở chat */
  onOpenChat?: (conversationId: string) => void;
  /** Handler bấm Nhắc tôi */
  onCreateReminder?: (actionItem: { text: string; sourceMessageRefs: string[] }) => void;
}

function formatTimeAgo(isoDate?: string): string {
  if (!isoDate) return '';
  const now = Date.now();
  const date = new Date(isoDate).getTime();
  const diff = Math.floor((now - date) / 1000);

  if (diff < 60) return `${diff} giây trước`;
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  return `${Math.floor(diff / 86400)} ngày trước`;
}

export function ConversationItem({
  name,
  avatarUrl,
  type,
  unreadCount,
  latestMessageAt,
  aiItem,
  digestDetail,
  loading = false,
  regenerating = false,
  onSummarize,
  onRegenerate,
  onOpenChat,
  onCreateReminder,
}: ConversationItemProps) {
  const [expanded, setExpanded] = useState(false);
  const isLoading = loading || regenerating;

  const conversationId = aiItem?.conversationId ?? '';
  const aiStatus = aiItem?.status ?? 'not_started';
  const isReady = aiStatus === 'ready';
  const showDigest = isReady && (expanded || digestDetail?.summary);

  return (
    <div className="rounded-2xl border border-border bg-[var(--surface-card)] p-4 transition hover:border-border-strong">
      {/* Header row */}
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-[var(--surface-glass)]">
          {avatarUrl ? (
            <Image src={avatarUrl} alt={name} fill className="object-cover" sizes="40px" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-xs font-semibold text-text-secondary">
              {name.slice(0, 2).toUpperCase()}
            </span>
          )}
          {type === 'group' && (
            <div className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[9px] text-white">
              G
            </div>
          )}
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <p className="truncate font-semibold text-text-primary">{name}</p>
            <StatusBadge status={aiStatus} />
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-text-tertiary">
            <span>{unreadCount} tin chưa đọc</span>
            {latestMessageAt && (
              <>
                <span>·</span>
                <span>{formatTimeAgo(latestMessageAt)}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Digest preview (expandable) */}
      {showDigest && (
        <DigestPreview
          item={aiItem!}
          detail={digestDetail}
          regenerating={regenerating}
          onRegenerate={onRegenerate ? () => onRegenerate(conversationId) : undefined}
          onCreateReminder={onCreateReminder}
        />
      )}

      {/* Expand button */}
      {isReady && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-2 text-xs text-accent hover:underline"
        >
          Xem chi tiết tóm tắt
        </button>
      )}

      {/* Action buttons */}
      <div className="mt-3 flex items-center gap-2">
        {/* Tóm tắt / Thử lại */}
        {aiStatus !== 'ready' && (
          <button
            type="button"
            onClick={() => onSummarize?.(conversationId)}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? (
              <ButtonSpinner size="xs" tone="light" />
            ) : (
              <MessageSquare className="h-3 w-3" aria-hidden />
            )}
            {aiStatus === 'failed' ? 'Thử lại' : 'Tóm tắt'}
          </button>
        )}

        {/* Tạo lại (khi đã ready) */}
        {isReady && (
          <button
            type="button"
            onClick={() => onRegenerate?.(conversationId)}
            disabled={regenerating}
            className="inline-flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {regenerating ? (
              <ButtonSpinner size="xs" tone="muted" />
            ) : null}
            Tạo lại
          </button>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Mở chat */}
        <button
          type="button"
          onClick={() => onOpenChat?.(conversationId)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-[var(--surface-glass)] px-3 py-1.5 text-xs font-medium text-text-primary transition hover:bg-[var(--surface-glass-strong)]"
        >
          Mở chat
        </button>
      </div>
    </div>
  );
}
