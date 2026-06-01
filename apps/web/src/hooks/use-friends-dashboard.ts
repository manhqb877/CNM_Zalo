'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSocket } from '@/services/socket';
import { getAccessToken } from '@/utils/auth-token';
import {
  acceptFriendRequest,
  blockUser,
  fetchFriendRequests,
  fetchFriends,
  rejectFriendRequest,
  searchFriendCandidates,
  sendFriendRequest,
  unfriend,
  unblockUser,
  type FriendRequestItem,
  type FriendUser,
} from '@/services/friends';

export function useFriendsDashboard() {
  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequestItem[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequestItem[]>([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState<FriendUser[]>([]);
  /** Khớp với từ khóa đã gọih API thành công (để UI không báo “không tìm thấy” khi chỉ đang gõ) */
  const [lastSubmittedSearchQuery, setLastSubmittedSearchQuery] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isFriendsLoading, setIsFriendsLoading] = useState(false);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const searchKeywordRef = useRef(searchKeyword);
  searchKeywordRef.current = searchKeyword;

  const showInfo = useCallback((message: string) => {
    setInfoMessage(message);
    setErrorMessage(null);
    setTimeout(() => setInfoMessage(null), 4000);
  }, []);

  const showError = useCallback((message: string) => {
    setErrorMessage(message);
    setInfoMessage(null);
    setTimeout(() => setErrorMessage(null), 4000);
  }, []);

  const loadData = useCallback(async () => {
    try {
      setIsFriendsLoading(true);
      setErrorMessage(null);

      const [friendsData, requestData] = await Promise.all([
        fetchFriends(),
        fetchFriendRequests(),
      ]);

      setFriends(friendsData.friends);
      setNextCursor(friendsData.nextCursor);
      setIncomingRequests(requestData.incoming);
      setOutgoingRequests(requestData.outgoing);
    } catch {
      showError('Không thể tải dữ liệu bạn bè. Vui lòng đăng nhập lại và thử lại.');
    } finally {
      setIsFriendsLoading(false);
    }
  }, [showError]);

  const loadMoreFriends = useCallback(async () => {
    if (!nextCursor || isFriendsLoading || isLoadingMore) {
      return;
    }

    try {
      setIsLoadingMore(true);
      const data = await fetchFriends(nextCursor);
      setFriends((prev) => [...prev, ...data.friends]);
      setNextCursor(data.nextCursor);
    } catch {
      showError('Không thể tải thêm danh sách bạn bè.');
    } finally {
      setIsLoadingMore(false);
    }
  }, [isFriendsLoading, isLoadingMore, nextCursor, showError]);

  const onSearch = useCallback(async () => {
    const keyword = searchKeywordRef.current.trim();
    if (keyword.length < 2) {
      showError('Vui lòng nhập tối thiểu 2 ký tự để tìm kiếm.');
      return;
    }

    try {
      setIsSearchLoading(true);
      setErrorMessage(null);
      const results = await searchFriendCandidates(keyword);
      setSearchResults(results);
      setLastSubmittedSearchQuery(keyword);
    } catch {
      showError('Không thể tìm kiếm người dùng.');
    } finally {
      setIsSearchLoading(false);
    }
  }, [showError]);

  const onSendRequest = useCallback(async (toUserId: string) => {
    try {
      setIsMutating(true);
      await sendFriendRequest(toUserId);
      showInfo('Đã gửi lời mời kết bạn.');
      await loadData();
    } catch {
      showError('Gửi lời mời kết bạn thất bại.');
    } finally {
      setIsMutating(false);
    }
  }, [loadData, showInfo, showError]);

  const onAcceptRequest = useCallback(async (requestId: string) => {
    try {
      setIsMutating(true);
      await acceptFriendRequest(requestId);
      showInfo('Đã chấp nhận lời mời kết bạn.');
      await loadData();
    } catch {
      showError('Không thể chấp nhận lời mời.');
    } finally {
      setIsMutating(false);
    }
  }, [loadData, showInfo, showError]);

  const onRejectRequest = useCallback(async (requestId: string) => {
    try {
      setIsMutating(true);
      await rejectFriendRequest(requestId);
      showInfo('Đã từ chối lời mời kết bạn.');
      await loadData();
    } catch {
      showError('Không thể từ chối lời mời.');
    } finally {
      setIsMutating(false);
    }
  }, [loadData, showInfo, showError]);

  const onCancelRequest = useCallback(async (requestId: string) => {
    try {
      setIsMutating(true);
      await rejectFriendRequest(requestId);
      showInfo('Đã thu hồi lời mời kết bạn.');
      await loadData();
    } catch {
      showError('Không thể thu hồi lời mời.');
    } finally {
      setIsMutating(false);
    }
  }, [loadData, showInfo, showError]);

  const onUnfriend = useCallback(async (friendId: string) => {
    try {
      setIsMutating(true);
      await unfriend(friendId);
      showInfo('Đã hủy kết bạn thành công.');
      await loadData();
    } catch {
      showError('Không thể hủy kết bạn.');
    } finally {
      setIsMutating(false);
    }
  }, [loadData, showInfo, showError]);

  const onBlock = useCallback(async (userId: string) => {
    try {
      setIsMutating(true);
      await blockUser(userId);
      showInfo('Đã chặn người dùng.');
      await loadData();
    } catch {
      showError('Không thể chặn người dùng.');
    } finally {
      setIsMutating(false);
    }
  }, [loadData, showInfo, showError]);

  const onUnblock = useCallback(async (userId: string) => {
    try {
      setIsMutating(true);
      await unblockUser(userId);
      showInfo('Đã bỏ chặn người dùng.');
      await loadData();
    } catch {
      showError('Không thể bỏ chặn người dùng.');
    } finally {
      setIsMutating(false);
    }
  }, [loadData, showInfo, showError]);

  const onClearSearch = useCallback(() => {
    setSearchKeyword('');
    setSearchResults([]);
    setLastSubmittedSearchQuery(null);
    setErrorMessage(null);
  }, []);

  const pendingTotal = useMemo(
    () => incomingRequests.length + outgoingRequests.length,
    [incomingRequests, outgoingRequests]
  );

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;

    const socket = getSocket(token);

    const handleNewNotification = (notification: { type: string }) => {
      if (notification.type === 'friend_request' || notification.type === 'friend_accepted') {
        void loadData();
      }
    };

    socket.on('new_notification', handleNewNotification);

    const handlePresenceChanged = (payload: { userId: string; status: 'online' | 'offline'; hidden?: boolean }) => {
      setFriends((prev) => prev.map((friend) => (
        friend.id === payload.userId
          ? { ...friend, status: payload.hidden ? undefined : payload.status }
          : friend
      )));
    };

    socket.on('presence_changed', handlePresenceChanged);

    return () => {
      socket.off('new_notification', handleNewNotification);
      socket.off('presence_changed', handlePresenceChanged);
    };
  }, [loadData]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  return {
    friends,
    incomingRequests,
    outgoingRequests,
    searchKeyword,
    searchResults,
    lastSubmittedSearchQuery,
    pendingTotal,
    nextCursor,
    isFriendsLoading,
    isSearchLoading,
    isMutating,
    isLoadingMore,
    infoMessage,
    errorMessage,
    setSearchKeyword,
    loadData,
    loadMoreFriends,
    onSearch,
    onClearSearch,
    onSendRequest,
    onAcceptRequest,
    onRejectRequest,
    onCancelRequest,
    onUnfriend,
    onBlock,
    onUnblock,
  };
}
