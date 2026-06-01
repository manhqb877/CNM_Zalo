import type { FriendRequestItem } from '@/services/friends';
import { FriendsActionButton } from '../atoms/friends-action-button';
import { FriendsAvatar } from '../atoms/friends-avatar';

interface RequestItemProps {
  item: FriendRequestItem;
  type: 'incoming' | 'outgoing';
  isLoading: boolean;
  onAcceptRequest: (requestId: string) => Promise<void>;
  onRejectRequest: (requestId: string) => Promise<void>;
  onCancelRequest?: (requestId: string) => Promise<void>;
}

export function RequestItem({
  item,
  type,
  isLoading,
  onAcceptRequest,
  onRejectRequest,
  onCancelRequest,
}: RequestItemProps) {
  const dateLabel = new Date(item.createdAt).toLocaleString('vi-VN');

  return (
    <article className="rounded-[1.4rem] border border-border bg-[var(--surface-glass)] p-4 shadow-sm transition-all hover:border-border-hover">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <FriendsAvatar
            name={item.displayName}
            avatarUrl={item.avatarUrl}
          />
          <div className="min-w-0 flex-1">
            <p className="font-ui-title text-base text-text-primary">{item.displayName}</p>
            {item.username && (
              <p className="font-ui-meta text-xs text-text-tertiary">@{item.username}</p>
            )}
            <p className="font-ui-meta mt-0.5 text-xs text-text-tertiary">{dateLabel}</p>
          </div>
        </div>

        {type === 'incoming' ? (
          <div className="flex flex-wrap gap-2">
            <FriendsActionButton
              label="Chấp nhận"
              variant="primary"
              disabled={isLoading}
              onClick={() => {
                void onAcceptRequest(item.requestId);
              }}
            />
            <FriendsActionButton
              label="Từ chối"
              variant="danger"
              disabled={isLoading}
              onClick={() => {
                void onRejectRequest(item.requestId);
              }}
            />
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <FriendsActionButton
              label="Thu hồi"
              variant="neutral"
              disabled={isLoading}
              onClick={() => {
                void onCancelRequest?.(item.requestId);
              }}
            />
          </div>
        )}
      </div>
    </article>
  );
}
