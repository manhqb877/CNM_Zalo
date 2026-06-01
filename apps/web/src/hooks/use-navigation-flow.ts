'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AxiosError } from 'axios';
import { apiClient } from '@/services/api';
import { sendFriendRequest as apiSendFriendRequest } from '@/services/friends';
import { showSystemToast } from '@/components/notifications/InAppNotificationToasts';

export interface UserProfileSummary {
  _id: string;
  displayName: string;
  username?: string;
  avatarUrl?: string;
  bio?: string;
  email?: string;
  emailMasked?: string;
  friendCount?: number;
  mutualFriends?: number;
  isFriend?: boolean;
  createdAt?: string;
}

export interface ConversationRef {
  conversationId: string;
  isNew: boolean;
}

interface UseNavigationFlowReturn {
  // Chat navigation
  navigateToChat: (userId: string) => Promise<string | null>;
  navigateToChatByConversation: (conversationId: string) => void;

  // Friend actions
  sendFriendRequest: (userId: string) => Promise<boolean>;

  // Profile modal state
  profileModalUserId: string | null;
  profileModalOpen: boolean;
  openProfileModal: (userId: string) => void;
  closeProfileModal: () => void;

  // Profile data
  profileModalUser: UserProfileSummary | null;
  profileModalLoading: boolean;
  currentUserId: string | null;

  // Loading states
  chatLoading: boolean;
  friendRequestLoading: boolean;

  // Explore skills
  navigateToExploreWithSkills: (skills: string[]) => void;
}

type ApiErrorPayload = {
  success?: boolean;
  error?: string;
  code?: string;
};

function resolveDirectMessageErrorMessage(err: unknown): string {
  const axiosError = err as AxiosError<ApiErrorPayload>;
  const status = axiosError.response?.status;
  const payload = axiosError.response?.data;
  const code = payload?.code;
  const rawMessage = payload?.error;

  if (code === 'DIRECT_MESSAGE_BLOCKED') {
    return 'Không thể nhắn tin vì một trong hai tài khoản đã chặn người còn lại.';
  }

  if (code === 'DIRECT_MESSAGE_FRIENDS_ONLY') {
    return 'Người này chỉ nhận tin nhắn từ bạn bè.';
  }

  if (code === 'DIRECT_MESSAGE_USER_DEACTIVATED') {
    return 'Không thể nhắn tin vì tài khoản này đã ngừng hoạt động.';
  }

  if (status === 429) {
    return 'Bạn đang mở quá nhiều cuộc trò chuyện với người chưa kết bạn. Vui lòng thử lại sau.';
  }

  if (status === 404) {
    return 'Không tìm thấy người dùng này.';
  }

  if (status === 400 && rawMessage?.toLowerCase().includes('yourself')) {
    return 'Bạn không thể tự nhắn tin cho chính mình.';
  }

  return rawMessage || 'Không thể mở cuộc trò chuyện. Vui lòng thử lại.';
}

/**
 * Hook tập trung xử lý navigation logic phức tạp cho luồng nghiệp vụ liên kết.
 * Dùng chung cho Friends → Chat, Community → Profile → Chat, Explore → Friends.
 */
export function useNavigationFlow(): UseNavigationFlowReturn {
  const router = useRouter();

  // Chat loading state
  const [chatLoading, setChatLoading] = useState(false);

  // Friend request loading
  const [friendRequestLoading, setFriendRequestLoading] = useState(false);

  // Profile modal state
  const [profileModalUserId, setProfileModalUserId] = useState<string | null>(null);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileModalUser, setProfileModalUser] = useState<UserProfileSummary | null>(null);
  const [profileModalLoading, setProfileModalLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const profileCacheRef = useRef<Map<string, UserProfileSummary>>(new Map());

  useEffect(() => {
    void (async () => {
      try {
        const { data } = await apiClient.get<{ success: boolean; user?: { _id?: string } }>('/api/users/me');
        if (data.success && data.user?._id) {
          setCurrentUserId(data.user._id);
        }
      } catch {
        // ignore auth fetch error
      }
    })();
  }, []);

  /**
   * Di chuyển đến chat với người dùng cụ thể.
   * 1. Gọi POST /api/conversations/direct với targetUserId để tìm hoặc tạo conversation.
   * 2. Navigate sang /chat?conversationId=...
   * 3. Trả về conversationId nếu thành công, null nếu thất bại.
   */
  const navigateToChat = useCallback(async (userId: string): Promise<string | null> => {
    setChatLoading(true);
    try {
      const { data } = await apiClient.post<{
        success: boolean;
        data?: { _id: string };
        error?: string;
      }>('/api/conversations/direct', { targetUserId: userId });

      if (data.success && data.data?._id) {
        const conversationId = data.data._id;
        router.push(`/chat?conversationId=${encodeURIComponent(conversationId)}`);
        return conversationId;
      }
      return null;
    } catch (err) {
      console.error('[useNavigationFlow] navigateToChat failed:', err);
      showSystemToast({
        id: 'direct-message-error',
        type: 'new_message',
        title: 'Không thể nhắn tin',
        body: resolveDirectMessageErrorMessage(err),
        variant: 'error',
      });
      return null;
    } finally {
      setChatLoading(false);
    }
  }, [router]);

  /**
   * Di chuyển trực tiếp đến conversation đã biết conversationId.
   */
  const navigateToChatByConversation = useCallback((conversationId: string) => {
    router.push(`/chat?conversationId=${encodeURIComponent(conversationId)}`);
  }, [router]);

  /**
   * Gửi lời mời kết bạn.
   * Trả về true nếu thành công.
   */
  const sendFriendRequest = useCallback(async (userId: string): Promise<boolean> => {
    setFriendRequestLoading(true);
    try {
      await apiSendFriendRequest(userId);
      return true;
    } catch (err) {
      console.error('[useNavigationFlow] sendFriendRequest failed:', err);
      return false;
    } finally {
      setFriendRequestLoading(false);
    }
  }, []);

  /**
   * Mở profile modal cho userId.
   * Fetch thông tin user và cập nhật state.
   */
  const openProfileModal = useCallback(async (userId: string) => {
    setProfileModalUserId(userId);
    setProfileModalOpen(true);
    const cached = profileCacheRef.current.get(userId);
    if (cached) {
      setProfileModalUser(cached);
      setProfileModalLoading(false);
      return;
    }

    setProfileModalUser(null);
    setProfileModalLoading(true);

    try {
      const { data } = await apiClient.get<{
        success: boolean;
        data?: UserProfileSummary;
        user?: UserProfileSummary;
      }>(`/api/users/${userId}/public-profile`);

      const profile = data.data ?? data.user;
      if (data.success && profile) {
        profileCacheRef.current.set(userId, profile);
        setProfileModalUser(profile);
      }
    } catch (err) {
      console.error('[useNavigationFlow] openProfileModal fetch failed:', err);
    } finally {
      setProfileModalLoading(false);
    }
  }, []);

  /**
   * Đóng profile modal và reset state.
   */
  const closeProfileModal = useCallback(() => {
    setProfileModalOpen(false);
    // Giữ lại userId gần nhất để tránh flash khi mở lại
    setTimeout(() => {
      setProfileModalUserId(null);
      setProfileModalUser(null);
    }, 300);
  }, []);

  /**
   * Di chuyển đến trang Explore với danh sách skills được lọc.
   */
  const navigateToExploreWithSkills = useCallback((skills: string[]) => {
    const query = skills.join(',');
    router.push(`/explore?skills=${encodeURIComponent(query)}`);
  }, [router]);

  return {
    navigateToChat,
    navigateToChatByConversation,
    sendFriendRequest,
    profileModalUserId,
    profileModalOpen,
    openProfileModal,
    closeProfileModal,
    profileModalUser,
    profileModalLoading,
    currentUserId,
    chatLoading,
    friendRequestLoading,
    navigateToExploreWithSkills,
  };
}
