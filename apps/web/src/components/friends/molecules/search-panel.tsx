import type { FriendUser } from '@/services/friends';
import { Search, UserPlus, UserX, X } from 'lucide-react';
import { useState } from 'react';
import { FriendsAvatar } from '../atoms/friends-avatar';
import { AppLoader } from '@/components/shared/loading-system';

interface SearchPanelProps {
  searchKeyword: string;
  searchResults: FriendUser[];
  /** Từ khóa đã gọi API tìm kiếm thành công lần cuối (null = chưa tìm) */
  lastSubmittedSearchQuery: string | null;
  isSearchLoading: boolean;
  isActionLoading: boolean;
  onSearchKeywordChange: (value: string) => void;
  onSearch: () => Promise<void>;
  onClearSearch: () => void;
  onSendRequest: (toUserId: string) => Promise<void>;
}

export function SearchPanel({
  searchKeyword,
  searchResults,
  lastSubmittedSearchQuery,
  isSearchLoading,
  isActionLoading,
  onSearchKeywordChange,
  onSearch,
  onClearSearch,
  onSendRequest,
}: SearchPanelProps) {
  const [isFocused, setIsFocused] = useState(false);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void onSearch();
    }
    if (e.key === 'Escape') {
      onClearSearch();
    }
  };

  const trimmed = searchKeyword.trim();
  const showResults = searchResults.length > 0;
  const showEmpty =
    !isSearchLoading &&
    searchResults.length === 0 &&
    lastSubmittedSearchQuery !== null &&
    trimmed === lastSubmittedSearchQuery;
  const showInitial =
    !isSearchLoading &&
    searchResults.length === 0 &&
    (lastSubmittedSearchQuery === null || trimmed !== lastSubmittedSearchQuery);

  return (
    <div className="space-y-4">
      <div
        className={`relative flex w-full items-stretch overflow-hidden rounded-2xl border border-border bg-[var(--surface-glass)] shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] transition-all duration-300 focus-within:border-[rgba(20,184,166,0.46)] focus-within:bg-[var(--surface-glass-strong)] focus-within:shadow-[0_0_0_4px_var(--ring-soft)] ${
          isFocused ? 'scale-[1.01]' : ''
        }`}
      >
        <div className="relative min-h-12 min-w-0 flex-1">
          <Search
            className={`pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 transition-colors ${
              isFocused ? 'text-[var(--accent)]' : 'text-[var(--text-tertiary)]'
            }`}
            aria-hidden
          />
          <input
            type="text"
            value={searchKeyword}
            onChange={(e) => onSearchKeywordChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="Tìm bạn bè bằng tên hoặc @username..."
            className="h-12 w-full min-w-0 border-0 bg-transparent py-0 pl-10 text-[0.95rem] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] disabled:opacity-60"
            style={{ paddingRight: searchKeyword ? '2.25rem' : '0.5rem' }}
            disabled={isSearchLoading}
          />
          {searchKeyword ? (
            <button
              type="button"
              onClick={onClearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              aria-label="Xóa tìm kiếm"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => {
            void onSearch();
          }}
          disabled={isSearchLoading || !trimmed}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 border-l border-border/70 bg-accent px-4 text-sm font-medium text-[var(--bg-primary)] shadow-sm transition hover:brightness-105 disabled:pointer-events-none disabled:opacity-45 sm:min-w-[7.5rem] sm:px-5"
        >
          <Search className="h-4 w-4" />
          <span>Tìm kiếm</span>
        </button>
      </div>

      <p className="font-ui-meta text-[0.7rem] text-[var(--text-tertiary)]">
        Tối thiểu 2 ký tự. Có thể tìm theo tên hiển thị, username (có hoặc không có @), hoặc email.
      </p>

      {isSearchLoading && (
        <AppLoader layout="bare" size="md" tone="teal" message="Đang tìm kiếm..." className="py-8" />
      )}

      {showResults && (
        <div className="space-y-3">
          <p className="font-ui-meta text-xs text-[var(--text-tertiary)]">
            Tìm thấy {searchResults.length} người
          </p>
          {searchResults.map((user) => (
            <article
              key={user.id}
              className="zync-soft-card flex items-center gap-4 p-4 transition-all hover:border-[var(--accent)]/30"
            >
              <FriendsAvatar name={user.displayName} avatarUrl={user.avatarUrl} size="md" />

              <div className="min-w-0 flex-1">
                <p className="font-ui-title truncate text-sm text-[var(--text-primary)]">
                  {user.displayName}
                </p>
                {user.username && (
                  <p className="font-ui-meta text-xs text-[var(--text-tertiary)]">
                    @{user.username}
                  </p>
                )}
                {user.bio && (
                  <p className="font-ui-content mt-0.5 line-clamp-1 text-xs text-[var(--text-secondary)]">
                    {user.bio}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => { void onSendRequest(user.id); }}
                disabled={isSearchLoading || isActionLoading}
                className="zync-soft-button flex shrink-0 items-center gap-1.5 px-4 py-2 text-sm"
              >
                <UserPlus className="h-4 w-4" />
                Kết bạn
              </button>
            </article>
          ))}
        </div>
      )}

      {showEmpty && (
        <div className="zync-soft-card-muted flex flex-col items-center gap-3 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--bg-hover)]">
            <UserX className="h-6 w-6 text-[var(--text-tertiary)]" />
          </div>
          <div>
            <p className="font-ui-title text-sm text-[var(--text-primary)]">
              Không tìm thấy người dùng
            </p>
            <p className="font-ui-content mt-1 text-xs text-[var(--text-secondary)]">
              Thử từ khóa khác hoặc kiểm tra lại chính tả
            </p>
          </div>
        </div>
      )}

      {showInitial && (
        <div className="zync-soft-card flex flex-col items-center gap-3 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent)]/10">
            <Search className="h-6 w-6 text-[var(--accent)]" />
          </div>
          <div>
            <p className="font-ui-title text-sm text-[var(--text-primary)]">
              Tìm bạn mới
            </p>
            <p className="font-ui-content mt-1 text-xs text-[var(--text-secondary)]">
              Nhập tên hoặc @username rồi nhấn Tìm kiếm
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
