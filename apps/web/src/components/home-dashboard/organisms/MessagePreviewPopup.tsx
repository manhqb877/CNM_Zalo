'use client';

import { useCallback, useRef, useState } from 'react';
import Image from 'next/image';
import type { MessagePreviewItem } from '@/hooks/use-message-preview';

interface MessagePreviewPopupProps {
  previews: MessagePreviewItem[];
  onDismiss: (id: string) => void;
  onPauseDismiss: (id: string) => void;
  onResumeDismiss: (id: string) => void;
  onQuickReply: (conversationId: string, content: string) => boolean | undefined;
  onNavigate: (conversationId: string) => void;
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function ReplyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 17 4 12 9 7" />
      <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
    </svg>
  );
}

function GroupIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function PreviewCard({
  preview,
  onDismiss,
  onPause,
  onResume,
  onQuickReply,
  onNavigate,
  index,
}: {
  preview: MessagePreviewItem;
  onDismiss: () => void;
  onPause: () => void;
  onResume: () => void;
  onQuickReply: (content: string) => boolean | undefined;
  onNavigate: () => void;
  index: number;
}) {
  const [isReplying, setIsReplying] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sentFeedback, setSentFeedback] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleOpenReply = useCallback(() => {
    setIsReplying(true);
    onPause();
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [onPause]);

  const handleCloseReply = useCallback(() => {
    setIsReplying(false);
    setReplyText('');
    onResume();
  }, [onResume]);

  const handleSendReply = useCallback(() => {
    if (!replyText.trim()) return;

    const success = onQuickReply(replyText.trim());
    if (success !== false) {
      setSentFeedback(true);
      setReplyText('');
      setIsReplying(false);
      setTimeout(() => {
        setIsDismissing(true);
        setTimeout(onDismiss, 300);
      }, 1200);
    }
  }, [replyText, onQuickReply, onDismiss]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        handleSendReply();
      }
      if (event.key === 'Escape') {
        handleCloseReply();
      }
    },
    [handleSendReply, handleCloseReply],
  );

  const handleDismiss = useCallback(() => {
    setIsDismissing(true);
    setTimeout(onDismiss, 300);
  }, [onDismiss]);

  const timeLabel = new Date(preview.timestamp).toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      className={`group relative w-[380px] overflow-hidden rounded-[1.6rem] zync-soft-glass transition-all ${
        isDismissing ? 'animate-preview-slide-out' : 'animate-preview-slide-in'
      }`}
      style={{ animationDelay: `${index * 60}ms` }}
      onMouseEnter={onPause}
      onMouseLeave={() => {
        if (!isReplying) onResume();
      }}
    >
      {!isReplying && !sentFeedback && (
        <div className="absolute left-0 right-0 top-0 h-[3px] overflow-hidden">
          <div className="h-full animate-preview-progress bg-gradient-to-r from-accent via-accent-strong to-[#7de0cf]" />
        </div>
      )}

      <button
        type="button"
        onClick={handleDismiss}
        className="absolute right-2.5 top-2.5 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-white/80 text-text-tertiary opacity-0 transition-opacity hover:text-text-primary group-hover:opacity-100"
        aria-label="Dong"
      >
        <CloseIcon className="h-3 w-3" />
      </button>

      <div className="relative">
        <div
          className="flex cursor-pointer gap-3 px-4 pb-3 pt-4"
          onClick={() => {
            if (!isReplying) onNavigate();
          }}
        >
          <div className="relative flex-shrink-0">
            <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-border bg-accent-light text-accent-strong">
              {preview.avatarUrl ? (
                <Image
                  src={preview.avatarUrl}
                  alt={preview.senderName}
                  width={44}
                  height={44}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-sm font-bold">
                  {preview.avatarInitials}
                </span>
              )}
            </div>
            {preview.isGroup && (
              <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-white bg-text-primary">
                <GroupIcon className="h-2.5 w-2.5 text-white" />
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[0.92rem] font-semibold text-text-primary">
                {preview.senderName}
              </span>
              <span className="flex-shrink-0 text-[0.7rem] tracking-wide text-text-tertiary">
                {timeLabel}
              </span>
            </div>
            <p className="mt-0.5 line-clamp-2 text-[0.82rem] leading-[1.5] text-text-secondary">
              {preview.body}
            </p>
          </div>
        </div>

        {sentFeedback && (
          <div className="flex items-center justify-center gap-2 border-t border-border-light px-4 py-2.5">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent-light">
              <svg viewBox="0 0 24 24" className="h-3 w-3 text-accent-strong" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
            <span className="text-[0.8rem] font-medium text-accent-strong">Da gui</span>
          </div>
        )}

        {!sentFeedback && (
          <div className="border-t border-border-light px-3 pb-3 pt-2">
            {isReplying ? (
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={replyText}
                  onChange={(event) => setReplyText(event.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Nhap tin nhan..."
                  className="zync-soft-input h-9 min-w-0 flex-1 text-[0.82rem]"
                />
                <button
                  type="button"
                  onClick={handleSendReply}
                  disabled={!replyText.trim()}
                  className="zync-soft-button flex h-9 w-9 flex-shrink-0 p-0"
                  aria-label="Gui"
                >
                  <SendIcon className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={handleCloseReply}
                  className="zync-soft-button-secondary flex h-9 w-9 flex-shrink-0 p-0"
                  aria-label="Huy"
                >
                  <CloseIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleOpenReply}
                  className="zync-soft-button-secondary flex h-8 flex-1 items-center justify-center gap-1.5 px-3 text-[0.78rem]"
                >
                  <ReplyIcon className="h-3.5 w-3.5" />
                  Tra loi nhanh
                </button>
                <button
                  type="button"
                  onClick={onNavigate}
                  className="zync-soft-button-secondary flex h-8 flex-1 items-center justify-center gap-1.5 px-3 text-[0.78rem]"
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                  Mo hoi thoai
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function MessagePreviewPopup({
  previews,
  onDismiss,
  onPauseDismiss,
  onResumeDismiss,
  onQuickReply,
  onNavigate,
}: MessagePreviewPopupProps) {
  if (previews.length === 0) return null;

  return (
    <div className="pointer-events-none absolute bottom-16 right-4 z-[60] flex flex-col-reverse gap-3">
      {previews.map((preview, index) => (
        <div key={preview.id} className="pointer-events-auto">
          <PreviewCard
            preview={preview}
            index={index}
            onDismiss={() => onDismiss(preview.id)}
            onPause={() => onPauseDismiss(preview.id)}
            onResume={() => onResumeDismiss(preview.id)}
            onQuickReply={(content) =>
              onQuickReply(preview.conversationId, content)
            }
            onNavigate={() => {
              onNavigate(preview.conversationId);
              onDismiss(preview.id);
            }}
          />
        </div>
      ))}
    </div>
  );
}
