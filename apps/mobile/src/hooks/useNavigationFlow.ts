import { useCallback, useState } from 'react';
import { useRouter } from 'expo-router';
import { Alert } from 'react-native';
import api from '../services/api';

export interface UserProfileSummary {
  _id: string;
  displayName: string;
  username?: string;
  avatarUrl?: string;
  bio?: string;
  friendCount?: number;
  mutualFriends?: number;
  isFriend?: boolean;
  createdAt?: string;
}

export interface UseNavigationFlowReturn {
  // Chat navigation
  navigateToChat: (userId: string) => Promise<string | null>;
  navigateToChatByConversation: (conversationId: string) => void;

  // Friend actions
  sendFriendRequest: (userId: string) => Promise<boolean>;

  // Profile bottom sheet state
  profileSheetUserId: string | null;
  profileSheetOpen: boolean;
  openProfileSheet: (userId: string) => void;
  closeProfileSheet: () => void;

  // Profile data
  profileSheetUser: UserProfileSummary | null;
  profileSheetLoading: boolean;

  // Loading states
  chatLoading: boolean;
  friendRequestLoading: boolean;

  // Explore skills
  navigateToExploreWithSkills: (skills: string[]) => void;
}

/**
 * Hook tập trung xử lý navigation logic phức tạp cho luồng nghiệp vụ liên kết trên Mobile.
 * Dùng chung cho Friends → Chat, Community → Profile → Chat, Explore → Friends.
 */
export function useNavigationFlow(): UseNavigationFlowReturn {
  const router = useRouter();

  // Chat loading state
  const [chatLoading, setChatLoading] = useState(false);

  // Friend request loading
  const [friendRequestLoading, setFriendRequestLoading] = useState(false);

  // Profile bottom sheet state
  const [profileSheetUserId, setProfileSheetUserId] = useState<string | null>(null);
  const [profileSheetOpen, setProfileSheetOpen] = useState(false);
  const [profileSheetUser, setProfileSheetUser] = useState<UserProfileSummary | null>(null);
  const [profileSheetLoading, setProfileSheetLoading] = useState(false);

  /**
   * Di chuyển đến chat với người dùng cụ thể.
   * 1. Gọi GET /conversations/direct?userId=... để tìm hoặc tạo conversation.
   * 2. Navigate sang /chat-room với conversationId.
   */
  const navigateToChat = useCallback(async (userId: string): Promise<string | null> => {
    setChatLoading(true);
    try {
      const res = await api.get<{
        success: boolean;
        data?: { _id: string };
      }>('/conversations/direct', { params: { userId } });

      if (res.data?.success && res.data.data?._id) {
        const conversationId = res.data.data._id;
        router.push({
          pathname: '/chat-room',
          params: { conversationId },
        });
        return conversationId;
      }
      return null;
    } catch (err) {
      console.error('[useNavigationFlow] navigateToChat failed:', err);
      Alert.alert('Lỗi', 'Không thể mở cuộc trò chuyện');
      return null;
    } finally {
      setChatLoading(false);
    }
  }, [router]);

  /**
   * Di chuyển trực tiếp đến conversation đã biết conversationId.
   */
  const navigateToChatByConversation = useCallback((conversationId: string) => {
    router.push({ pathname: '/chat-room', params: { conversationId } });
  }, [router]);

  /**
   * Gửi lời mời kết bạn.
   * Trả về true nếu thành công.
   */
  const sendFriendRequest = useCallback(async (userId: string): Promise<boolean> => {
    setFriendRequestLoading(true);
    try {
      await api.post('/friends/request', { toUserId: userId });
      return true;
    } catch (err) {
      console.error('[useNavigationFlow] sendFriendRequest failed:', err);
      return false;
    } finally {
      setFriendRequestLoading(false);
    }
  }, []);

  /**
   * Mở profile bottom sheet cho userId.
   * Fetch thông tin user và cập nhật state.
   */
  const openProfileSheet = useCallback(async (userId: string) => {
    setProfileSheetUserId(userId);
    setProfileSheetOpen(true);
    setProfileSheetUser(null);
    setProfileSheetLoading(true);

    try {
      const res = await api.get<{
        success: boolean;
        data?: UserProfileSummary;
      }>(`/users/${userId}`);

      if (res.data?.success && res.data.data) {
        setProfileSheetUser(res.data.data);
      }
    } catch (err) {
      console.error('[useNavigationFlow] openProfileSheet fetch failed:', err);
    } finally {
      setProfileSheetLoading(false);
    }
  }, []);

  /**
   * Đóng profile bottom sheet và reset state.
   */
  const closeProfileSheet = useCallback(() => {
    setProfileSheetOpen(false);
    setTimeout(() => {
      setProfileSheetUserId(null);
      setProfileSheetUser(null);
    }, 300);
  }, []);

  /**
   * Di chuyển đến trang Explore với danh sách skills được lọc.
   */
  const navigateToExploreWithSkills = useCallback((skills: string[]) => {
    router.push({
      pathname: '/(tabs)/community',
      params: {
        tab: 'explore',
        skills: skills.join(','),
      },
    });
  }, [router]);

  return {
    navigateToChat,
    navigateToChatByConversation,
    sendFriendRequest,
    profileSheetUserId,
    profileSheetOpen,
    openProfileSheet,
    closeProfileSheet,
    profileSheetUser,
    profileSheetLoading,
    chatLoading,
    friendRequestLoading,
    navigateToExploreWithSkills,
  };
}
