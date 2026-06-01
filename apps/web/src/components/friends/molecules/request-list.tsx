import type { FriendRequestItem } from '@/services/friends';
import { ArrowRightLeft, Check, X } from 'lucide-react';
import { FriendsAvatar } from '../atoms/friends-avatar';

/**
 * Format thời gian tương đối (ví dụ: "2 giờ trước", "3 ngày trước")
 */
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return 'Vừa xong';
  if (diffMinutes < 60) return `${diffMinutes} phút trước`;
  if (diffHours < 24) return `${diffHours} giờ trước`;
  if (diffDays < 7) return `${diffDays} ngày trước`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} tuần trước`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} tháng trước`;
  return `${Math.floor(diffDays / 365)} năm trước`;
}

interface RequestListProps {
  incomingRequests: FriendRequestItem[];
  outgoingRequests: FriendRequestItem[];
  isLoading: boolean;
  onAcceptRequest: (requestId: string) => Promise<void>;
  onRejectRequest: (requestId: string) => Promise<void>;
  onCancelRequest: (requestId: string) => Promise<void>;
}

export function RequestList({
  incomingRequests,
  outgoingRequests,
  isLoading,
  onAcceptRequest,
  onRejectRequest,
  onCancelRequest,
}: RequestListProps) {
  const hasRequests = incomingRequests.length > 0 || outgoingRequests.length > 0;

  if (!hasRequests) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-[1.4rem] border border-dashed border-border bg-bg-card py-16 text-center shadow-sm">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--bg-hover)]">
          <ArrowRightLeft className="h-7 w-7 text-[var(--text-tertiary)]" />
        </div>
        <div>
          <p className="font-ui-title text-base text-[var(--text-primary)]">Không có lời mời nào</p>
          <p className="font-ui-content mt-1 text-sm text-[var(--text-secondary)]">
            Tìm người quen để kết nối
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Incoming Requests */}
      {incomingRequests.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <h3 className="font-ui-title text-sm text-[var(--text-secondary)]">Lời mời đã nhận</h3>
            <span className="zync-soft-badge flex h-5 min-w-5 items-center justify-center px-1.5 text-xs">
              {incomingRequests.length}
            </span>
          </div>
          <div className="space-y-3">
            {incomingRequests.map((request) => (
              <article
                key={request.requestId}
                className="flex items-center gap-4 rounded-[1.4rem] border border-border bg-bg-card p-4 shadow-sm transition-all hover:border-accent/40 hover:shadow-md"
              >
                <FriendsAvatar name={request.displayName} avatarUrl={request.avatarUrl} size="md" />

                <div className="min-w-0 flex-1">
                  <p className="font-ui-title text-sm text-[var(--text-primary)] truncate">
                    {request.displayName}
                  </p>
                  {request.username && (
                    <p className="font-ui-meta text-xs text-[var(--text-tertiary)]">
                      @{request.username}
                    </p>
                  )}
                  <p className="font-ui-meta mt-0.5 text-xs text-[var(--text-tertiary)]">
                    {formatRelativeTime(request.createdAt)}
                  </p>
                </div>

                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => { void onAcceptRequest(request.requestId); }}
                    disabled={isLoading}
                    className="zync-soft-button flex h-9 items-center gap-1.5 px-4 text-sm"
                    title="Chấp nhận"
                  >
                    <Check className="h-4 w-4" />
                    Đồng ý
                  </button>
                  <button
                    type="button"
                    onClick={() => { void onRejectRequest(request.requestId); }}
                    disabled={isLoading}
                    className="zync-soft-button-secondary flex h-9 items-center gap-1.5 px-4 text-sm"
                    title="Từ chối"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Outgoing Requests */}
      {outgoingRequests.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <h3 className="font-ui-title text-sm text-[var(--text-secondary)]">Lời mời đã gửi</h3>
            <span className="zync-soft-badge flex h-5 min-w-5 items-center justify-center bg-[var(--bg-hover)] px-1.5 text-xs text-[var(--text-secondary)]">
              {outgoingRequests.length}
            </span>
          </div>
          <div className="space-y-3">
            {outgoingRequests.map((request) => (
              <article
                key={request.requestId}
                className="flex items-center gap-4 rounded-[1.4rem] border border-border bg-bg-hover/80 p-4 shadow-sm transition-all hover:border-accent/30"
              >
                <FriendsAvatar name={request.displayName} avatarUrl={request.avatarUrl} size="md" />

                <div className="min-w-0 flex-1">
                  <p className="font-ui-title text-sm text-[var(--text-primary)] truncate">
                    {request.displayName}
                  </p>
                  {request.username && (
                    <p className="font-ui-meta text-xs text-[var(--text-tertiary)]">
                      @{request.username}
                    </p>
                  )}
                  <p className="font-ui-meta mt-0.5 text-xs text-[var(--text-tertiary)]">
                    Đang chờ phản hồi
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => { void onCancelRequest(request.requestId); }}
                  disabled={isLoading}
                  className="zync-soft-button-secondary flex h-9 items-center gap-1.5 px-4 text-sm"
                  title="Thu hồi"
                >
                  Thu hồi
                </button>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
