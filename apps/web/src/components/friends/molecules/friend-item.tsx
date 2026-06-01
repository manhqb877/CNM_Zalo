import type { FriendUser } from '@/services/friends';
import { UserX } from 'lucide-react';
import { FriendsActionButton } from '../atoms/friends-action-button';
import { FriendsAvatar } from '../atoms/friends-avatar';

interface FriendItemProps {
  friend: FriendUser;
  onUnfriend: (friendId: string) => Promise<void>;
  onBlock: (userId: string) => Promise<void>;
  isLoading: boolean;
}

export function FriendItem({ friend, onUnfriend, onBlock, isLoading }: FriendItemProps) {
  return (
    <article className="group rounded-[1.4rem] border border-border bg-[var(--surface-glass)] p-4 shadow-sm transition-all hover:border-border-hover">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <FriendsAvatar
            name={friend.displayName}
            avatarUrl={friend.avatarUrl}
          />
          <div className="min-w-0 flex-1">
            <p className="font-ui-title text-base text-text-primary">{friend.displayName}</p>
            {friend.username && (
              <p className="font-ui-meta text-xs text-text-tertiary">@{friend.username}</p>
            )}
            {friend.bio ? (
              <p className="font-ui-content mt-1 text-sm text-text-secondary line-clamp-1">
                {friend.bio}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <FriendsActionButton
            label="Hủy kết bạn"
            variant="neutral"
            disabled={isLoading}
            onClick={() => {
              void onUnfriend(friend.id);
            }}
          />
          <FriendsActionButton
            label="Chặn"
            variant="danger"
            disabled={isLoading}
            onClick={() => {
              void onBlock(friend.id);
            }}
          />
        </div>
      </div>
    </article>
  );
}
