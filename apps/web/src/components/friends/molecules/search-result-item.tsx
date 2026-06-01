import type { FriendUser } from '@/services/friends';
import { FriendsActionButton } from '../atoms/friends-action-button';
import { FriendsAvatar } from '../atoms/friends-avatar';

interface SearchResultItemProps {
  user: FriendUser;
  isLoading: boolean;
  onSendRequest: (toUserId: string) => Promise<void>;
}

export function SearchResultItem({ user, isLoading, onSendRequest }: SearchResultItemProps) {
  return (
    <article className="rounded-[1.4rem] border border-border bg-[var(--surface-glass)] p-4 shadow-sm transition-all hover:border-border-hover">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <FriendsAvatar
            name={user.displayName}
            avatarUrl={user.avatarUrl}
          />
          <div className="min-w-0 flex-1">
            <p className="font-ui-title text-base text-text-primary">{user.displayName}</p>
            {user.username && (
              <p className="font-ui-meta text-xs text-text-tertiary">@{user.username}</p>
            )}
            {user.email && !user.username && (
              <p className="font-ui-meta text-xs text-text-tertiary">{user.email}</p>
            )}
            {user.bio ? (
              <p className="font-ui-content mt-0.5 text-xs text-text-secondary line-clamp-1">
                {user.bio}
              </p>
            ) : null}
          </div>
        </div>
        <FriendsActionButton
          label="Kết bạn"
          variant="primary"
          disabled={isLoading}
          onClick={() => {
            void onSendRequest(user.id);
          }}
        />
      </div>
    </article>
  );
}
