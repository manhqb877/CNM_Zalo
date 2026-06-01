import type { FriendUser } from '@/services/friends';
import { useState } from 'react';
import { FriendCard } from './friend-card';
import { ButtonSpinner, PageSkeleton } from '@/components/shared/loading-system';

interface FriendsListViewProps {
  friends: FriendUser[];
  nextCursor: string | null;
  isLoading: boolean;
  isLoadingMore: boolean;
  onUnfriend: (friendId: string) => Promise<void>;
  onBlock: (userId: string) => Promise<void>;
  onLoadMore: () => Promise<void>;
  onMessage?: (friendId: string) => void;
}

export function FriendsListView({
  friends,
  nextCursor,
  isLoading,
  isLoadingMore,
  onUnfriend,
  onBlock,
  onLoadMore,
  onMessage,
}: FriendsListViewProps) {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  if (friends.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-[var(--surface-muted)]/50 py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--bg-hover)]">
          <svg
            className="h-8 w-8 text-[var(--text-tertiary)]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
        </div>
        <div>
          <p className="font-ui-title text-base text-[var(--text-primary)]">Chưa có bạn bè nào</p>
          <p className="font-ui-content mt-1 text-sm text-[var(--text-secondary)]">
            Tìm kiếm và kết nối với mọi người
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with view mode toggle */}
      <div className="flex items-center justify-between">
        <p className="font-ui-meta text-sm text-[var(--text-tertiary)]">
          {friends.length} bạn bè
        </p>
        <div className="flex items-center gap-1 rounded-xl border border-border bg-[var(--surface-muted)] p-1">
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className={`rounded-lg p-1.5 transition-colors ${
              viewMode === 'grid'
                ? 'bg-[var(--accent)] text-white'
                : 'text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)]'
            }`}
            aria-label="Chế độ lưới"
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 16 16">
              <path d="M1 2a1 1 0 011-1h4.5a1 1 0 011 1v4.5a1 1 0 01-1 1H2a1 1 0 01-1-1V2zm1 0v4.5h6.5V2H2zm8.5 0a1 1 0 011 1v4.5a1 1 0 01-1 1h-4.5a1 1 0 01-1-1V2a1 1 0 011-1h4.5zM1 9.5a1 1 0 011-1h4.5a1 1 0 011 1v4.5a1 1 0 01-1 1H2a1 1 0 01-1-1V9.5zm1 0v4.5h6.5V9.5H2zm8.5 0a1 1 0 011 1v4.5a1 1 0 01-1 1h-4.5a1 1 0 01-1-1V9.5a1 1 0 011-1h4.5z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`rounded-lg p-1.5 transition-colors ${
              viewMode === 'list'
                ? 'bg-[var(--accent)] text-white'
                : 'text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)]'
            }`}
            aria-label="Chế độ danh sách"
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 16 16">
              <path fillRule="evenodd" d="M2.5 12a.5.5 0 01.5-.5h10a.5.5 0 010 1H3a.5.5 0 01-.5-.5zm0-4a.5.5 0 01.5-.5h10a.5.5 0 010 1H3a.5.5 0 01-.5-.5zm0-4a.5.5 0 01.5-.5h10a.5.5 0 010 1H3a.5.5 0 01-.5-.5z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <PageSkeleton key={i} rows={1} />
          ))}
        </div>
      )}

      {/* Grid View */}
      {!isLoading && viewMode === 'grid' && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {friends.map((friend, index) => (
            <div
              key={friend.id}
              className="zync-reveal-up"
              style={{ animationDelay: `${Math.min(index * 50, 300)}ms` }}
            >
              <FriendCard
                friend={friend}
                onUnfriend={onUnfriend}
                onBlock={onBlock}
                isLoading={isLoadingMore}
                onMessage={onMessage}
              />
            </div>
          ))}
        </div>
      )}

      {/* List View */}
      {!isLoading && viewMode === 'list' && (
        <div className="space-y-2">
          {friends.map((friend, index) => (
            <article
              key={friend.id}
              className="flex items-center gap-4 rounded-2xl border border-border bg-[var(--surface-card)] p-4 transition-all hover:border-[var(--accent)]/30 zync-reveal-up"
              style={{ animationDelay: `${Math.min(index * 30, 200)}ms` }}
            >
              <FriendCard
                friend={friend}
                onUnfriend={onUnfriend}
                onBlock={onBlock}
                isLoading={isLoadingMore}
                onMessage={onMessage}
              />
            </article>
          ))}
        </div>
      )}

      {/* Load More */}
      {nextCursor && !isLoading && (
        <div className="flex justify-center pt-4">
          <button
            type="button"
            onClick={() => { void onLoadMore(); }}
            disabled={isLoadingMore}
            className="zync-soft-button-secondary flex items-center gap-2 px-6 py-2.5 text-sm"
          >
            {isLoadingMore ? (
              <>
                <ButtonSpinner size="sm" tone="muted" />
                Đang tải...
              </>
            ) : (
              'Tải thêm bạn bè'
            )}
          </button>
        </div>
      )}
    </div>
  );
}
