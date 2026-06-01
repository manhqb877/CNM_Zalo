import type { FriendRequestItem, FriendUser } from '@/services/friends';

export interface FriendsScreenProps {
  friends: FriendUser[];
  incomingRequests: FriendRequestItem[];
  outgoingRequests: FriendRequestItem[];
  searchKeyword: string;
  searchResults: FriendUser[];
  pendingTotal: number;
  nextCursor: string | null;
  isLoading: boolean;
  infoMessage: string | null;
  errorMessage: string | null;
  onSearchKeywordChange: (value: string) => void;
  onSearch: () => Promise<void>;
  onClearSearch: () => void;
  onLoadMoreFriends: () => Promise<void>;
  onSendRequest: (toUserId: string) => Promise<void>;
  onAcceptRequest: (requestId: string) => Promise<void>;
  onRejectRequest: (requestId: string) => Promise<void>;
  onCancelRequest: (requestId: string) => Promise<void>;
  onUnfriend: (friendId: string) => Promise<void>;
  onBlock: (userId: string) => Promise<void>;
  onUnblock: (userId: string) => Promise<void>;
}
