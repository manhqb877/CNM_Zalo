'use client';

import React, { useCallback, useState, useEffect, useRef } from 'react';
import {
  X,
  MessageCircle,
  UserPlus,
  Check,
} from 'lucide-react';
import type { UserProfileSummary } from '@/hooks/use-navigation-flow';
import { ButtonSpinner, PageSkeleton } from './loading-system';

interface UserProfileModalProps {
  visible: boolean;
  userId: string | null;
  currentUserId?: string;
  user?: UserProfileSummary;
  loading?: boolean;
  onClose: () => void;
  onSendMessage?: (userId: string) => void;
  onSendFriendRequest?: (userId: string) => Promise<boolean | void>;
}

function formatYear(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).getFullYear().toString();
  } catch {
    return '';
  }
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const selectors = [
    'button:not([disabled])',
    '[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ];
  return Array.from(container.querySelectorAll<HTMLElement>(selectors.join(',')));
}

export function UserProfileModal({
  visible,
  userId,
  currentUserId,
  user,
  loading,
  onClose,
  onSendMessage,
  onSendFriendRequest,
}: UserProfileModalProps) {
  const [friendRequestLoading, setFriendRequestLoading] = useState(false);
  const [friendRequestSent, setFriendRequestSent] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Reset state when modal closes or user changes
  useEffect(() => {
    if (!visible) {
      setFriendRequestSent(false);
      setFriendRequestLoading(false);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;

    const card = cardRef.current;
    if (card) {
      const focusables = getFocusableElements(card);
      focusables[0]?.focus();
    }

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !cardRef.current) {
        return;
      }

      const focusables = getFocusableElements(cardRef.current);
      if (focusables.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (!event.shiftKey && active === last) {
        event.preventDefault();
        first?.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last?.focus();
      }
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [visible, onClose]);

  const handleSendMessage = useCallback(() => {
    if (userId && onSendMessage) {
      onSendMessage(userId);
    }
  }, [userId, onSendMessage]);

  const handleSendFriendRequest = useCallback(async () => {
    if (!userId || !onSendFriendRequest) return;
    setFriendRequestLoading(true);
    try {
      const ok = await onSendFriendRequest(userId);
      if (ok !== false) {
        setFriendRequestSent(true);
      }
    } catch {
      // Error handled by parent
    } finally {
      setFriendRequestLoading(false);
    }
  }, [userId, onSendFriendRequest]);

  const isMe = userId === currentUserId;
  const initials = (user?.displayName ?? '??').slice(0, 2).toUpperCase();

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label="Thông tin người dùng"
        className="zync-soft-card zync-soft-card-elevated relative w-full max-w-md rounded-[1.8rem] border border-border/80 p-6 shadow-xl sm:p-7"
        style={{ animation: 'modal-pop-in 0.25s ease-out' }}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="zync-soft-button-ghost absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full p-0 text-text-secondary"
          aria-label="Đóng"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Loading state */}
        {loading && (
          <PageSkeleton rows={4} className="border-0 bg-transparent shadow-none" />
        )}

        {/* Content */}
        {!loading && user && (
          <div className="flex flex-col items-center">
            {/* Avatar */}
            <div
              className="mb-4 flex h-20 w-20 items-center justify-center overflow-hidden rounded-full text-xl font-semibold"
              style={{ backgroundColor: 'var(--accent-light)', color: 'var(--accent-primary)' }}
            >
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.displayName}
                  className="h-full w-full object-cover"
                />
              ) : (
                initials
              )}
            </div>

            {/* Name */}
            <h2 className="font-ui-title text-xl text-text-primary">{user.displayName}</h2>
            {user.username && (
              <p className="font-ui-meta mt-0.5 text-sm text-text-tertiary">@{user.username}</p>
            )}
            {(user.emailMasked || user.email) && (
              <p className="font-ui-content mt-1 text-xs text-text-tertiary">
                {user.emailMasked ?? user.email}
              </p>
            )}
            {user.bio && (
              <p className="font-ui-content mt-3 text-center text-sm leading-relaxed text-text-secondary">
                {user.bio}
              </p>
            )}

            {/* Stats */}
            <div className="mt-5 flex items-center gap-6">
              <div className="flex flex-col items-center">
                <span className="font-ui-title text-lg text-text-primary">
                  {user.friendCount ?? 0}
                </span>
                <span className="font-ui-meta text-xs text-text-tertiary">Bạn bè</span>
              </div>
              {user.mutualFriends !== undefined && !isMe && (
                <div className="flex flex-col items-center">
                  <span className="font-ui-title text-lg text-text-primary">
                    {user.mutualFriends}
                  </span>
                  <span className="font-ui-meta text-xs text-text-tertiary">Bạn chung</span>
                </div>
              )}
              {user.createdAt && (
                <div className="flex flex-col items-center">
                  <span className="font-ui-title text-lg text-text-primary">
                    {formatYear(user.createdAt)}
                  </span>
                  <span className="font-ui-meta text-xs text-text-tertiary">Tham gia</span>
                </div>
              )}
            </div>

            {/* Actions */}
            {!isMe && (
              <div className="mt-6 flex w-full flex-col gap-3">
                {/* Luôn hiển thị nút Nhắn tin */}
                <button
                  type="button"
                  onClick={handleSendMessage}
                  className="zync-soft-button flex w-full items-center justify-center gap-2 py-3 text-sm"
                >
                  <MessageCircle className="h-4 w-4" />
                  Nhắn tin
                </button>

                {!user.isFriend && (
                  friendRequestLoading ? (
                    <button
                      type="button"
                      disabled
                      className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm"
                      style={{
                        backgroundColor: 'var(--surface-muted)',
                        color: 'var(--text-tertiary)',
                        cursor: 'not-allowed',
                      }}
                    >
                      <ButtonSpinner size="sm" tone="muted" />
                      Đang gửi...
                    </button>
                  ) : friendRequestSent ? (
                    <button
                      type="button"
                      disabled
                      className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm"
                      style={{
                        backgroundColor: 'var(--surface-muted)',
                        color: 'var(--text-tertiary)',
                        cursor: 'not-allowed',
                      }}
                    >
                      <Check className="h-4 w-4" />
                      Đã gửi lời mời
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSendFriendRequest}
                      className="zync-soft-button-secondary flex w-full items-center justify-center gap-2 py-3 text-sm"
                    >
                      <UserPlus className="h-4 w-4" />
                      Kết bạn
                    </button>
                  )
                )}

                {user.isFriend && (
                  <div className="w-full rounded-xl border border-border bg-bg-hover px-3 py-2 text-center text-xs text-text-tertiary">
                    Đã là bạn bè
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Error state */}
        {!loading && !user && (
          <div className="py-8 text-center">
            <p className="font-ui-content text-sm text-text-tertiary">
              Không thể tải thông tin người dùng
            </p>
            <button
              type="button"
              onClick={onClose}
              className="zync-soft-button-secondary mt-4 px-4 py-2 text-sm"
            >
              Đóng
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes modal-pop-in {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(8px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
