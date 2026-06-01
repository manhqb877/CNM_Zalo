'use client';

import { useState } from 'react';
import { Bot, RefreshCw, MessageSquare, Bell } from 'lucide-react';
import { StatusBadge, DigestStatusDot } from './status-badge';
import type { AiAssistantItem } from '@zync/shared-types';
import { ButtonSpinner } from '@/components/shared/loading-system';

interface DigestPreviewProps {
  item: AiAssistantItem;
  detail?: {
    summary?: {
      title: string;
      overview: string;
      bullets: string[];
    };
    futureSignals?: {
      questionsForUser: string[];
      actionItems: Array<{ text: string }>;
      suggestedReplies: string[];
    };
    generatedAt?: string;
    omittedOlderCount?: number;
  };
  onRegenerate?: () => void;
  onCreateReminder?: (actionItem: { text: string; sourceMessageRefs: string[] }) => void;
  onSendReply?: (reply: string) => void;
  regenerating?: boolean;
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

export function DigestPreview({
  item,
  detail,
  onRegenerate,
  onCreateReminder,
  onSendReply,
  regenerating = false,
}: DigestPreviewProps) {
  const [expanded, setExpanded] = useState(false);

  if (item.status === 'not_started') {
    return null;
  }

  const summary = detail?.summary;

  return (
    <div className="mt-3 rounded-xl border border-accent/15 bg-accent/5 p-3">
      {/* Summary header */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="h-3.5 w-3.5 text-accent" aria-hidden />
          <span className="text-xs font-semibold text-accent">AI tóm tắt</span>
        </div>
        {detail?.generatedAt && (
          <span className="text-[11px] text-text-tertiary">{formatTimeAgo(detail.generatedAt)}</span>
        )}
      </div>

      {/* Title */}
      {summary?.title && (
        <p className="mb-1 text-sm font-semibold text-text-primary">{summary.title}</p>
      )}

      {/* Overview */}
      {summary?.overview && (
        <p className="mb-2 text-sm leading-relaxed text-text-secondary">{summary.overview}</p>
      )}

      {/* Bullets */}
      {summary?.bullets && summary.bullets.length > 0 && (
        <ul className="mb-3 space-y-1">
          {summary.bullets.slice(0, 6).map((bullet, index) => (
            <li key={`${bullet}-${index}`} className="flex items-start gap-2 text-sm text-text-secondary">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Omitted count */}
      {detail?.omittedOlderCount && detail.omittedOlderCount > 0 && (
        <p className="mb-2 text-[11px] text-text-tertiary">
          Đã bỏ qua {detail.omittedOlderCount} tin nhắn cũ hơn
        </p>
      )}

      {/* Expand for more */}
      {(summary?.bullets && summary.bullets.length > 3) && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mb-2 text-xs text-accent hover:underline"
        >
          Xem thêm...
        </button>
      )}

      {/* Action buttons */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {onRegenerate && (
          <button
            type="button"
            onClick={onRegenerate}
            disabled={regenerating}
            className="inline-flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-2.5 py-1.5 text-xs font-medium text-accent transition hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {regenerating ? <ButtonSpinner size="xs" tone="muted" /> : <RefreshCw className="h-3 w-3" aria-hidden />}
            Tạo lại
          </button>
        )}

        {detail?.futureSignals?.actionItems && detail.futureSignals.actionItems.length > 0 && onCreateReminder && (
          <button
            type="button"
            onClick={() => onCreateReminder({ text: detail.futureSignals!.actionItems[0].text, sourceMessageRefs: [] })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-700 transition hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
          >
            <Bell className="h-3 w-3" aria-hidden />
            Nhắc tôi
          </button>
        )}

        {detail?.futureSignals?.suggestedReplies && detail.futureSignals.suggestedReplies.length > 0 && (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-green-300 bg-green-50 px-2.5 py-1.5 text-xs font-medium text-green-700 transition hover:bg-green-100 dark:border-green-700 dark:bg-green-950/40 dark:text-green-400"
          >
            <MessageSquare className="h-3 w-3" aria-hidden />
            Gợi ý trả lời
          </button>
        )}
      </div>
    </div>
  );
}
