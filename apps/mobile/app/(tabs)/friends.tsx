import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  StatusBar,
  RefreshControl,
  Alert
} from 'react-native';
import { Check, Mail, MessageCircle, UserPlus, Users, X } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { lightTheme } from '../../src/theme/colors';
import { fonts } from '../../src/theme/fonts';
import api from '../../src/services/api';
import { EmptyState } from '../../src/ui/EmptyState';
import { ProfileBottomSheet } from '../../src/components/ProfileBottomSheet';
import { useNavigationFlow } from '../../src/hooks/useNavigationFlow';
import { AppScreen } from '../../src/ui/AppScreen';
import { AppSearchBar } from '../../src/ui/AppSearchBar';
import { AppIconButton } from '../../src/ui/AppIconButton';
import { Avatar } from '../../src/ui/Avatar';
import { AppChip } from '../../src/ui/AppChip';
import { AppCard } from '../../src/ui/AppCard';
import { useAuthStore } from '../../src/store/useAuthStore';
import { SkeletonCardPreset } from '../../src/ui/ZyncSkeleton';
import { SegmentTabs } from '../../src/ui/SegmentTabs';
import { UserListItem } from '../../src/ui/UserListItem';

interface Friend {
  _id: string;
  id?: string;
  username?: string;
  displayName: string;
  avatarUrl?: string;
  email?: string;
  status?: string;
}

interface FriendRequest {
  _id?: string;
  id?: string;
  requestId?: string;
  userId?: string;
  displayName?: string;
  avatarUrl?: string;
  senderId?: { _id: string; displayName: string; avatarUrl?: string };
  receiverId?: string;
  status?: string;
  createdAt: string;
}


export default function FriendsScreen() {
  const userInfo = useAuthStore((s) => s.userInfo);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const currentUserId = (userInfo as any)?._id || (userInfo as any)?.id || '';

  const {
    navigateToChat,
    chatLoading,
    profileSheetUserId,
    profileSheetOpen,
    profileSheetUser,
    profileSheetLoading,
    openProfileSheet,
    closeProfileSheet,
  } = useNavigationFlow();

  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [friendCount, setFriendCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [activeTab, setActiveTab] = useState<'friends' | 'requests' | 'suggestions'>('friends');

  const loadFriendsData = useCallback(async () => {
    try {
      const [friendsRes, countRes, requestsRes] = await Promise.all([
        api.get('/friends').catch(() => ({ data: { friends: [] } })),
        api.get('/friends/count').catch(() => ({ data: { count: 0 } })),
        api.get('/friends/requests').catch(() => ({ data: { received: [] } })),
      ]);

      setFriends(friendsRes.data?.friends || []);
      setFriendCount(countRes.data?.count || 0);
      setRequests(requestsRes.data?.received || []);
    } catch (e) {
      console.error('Failed to load friends data:', e);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      loadFriendsData();
    }
  }, [isAuthenticated, loadFriendsData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadFriendsData();
  }, [loadFriendsData]);

  // Search users
  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    try {
      setIsSearching(true);
      const res = await api.get('/users/search', { params: { query } });
      setSearchResults(res.data?.users || []);
    } catch (e) {
      console.error('Search error:', e);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Send friend request
  const sendFriendRequest = async (userId: string) => {
    try {
      await api.post('/friends/request', { toUserId: userId });
      Alert.alert('Thành công', 'Đã gửi lời mời kết bạn');
      setSearchQuery('');
      setSearchResults([]);
    } catch (e: any) {
      Alert.alert('Lỗi', e.response?.data?.message || 'Không thể gửi lời mời');
    }
  };

  // Accept friend request
  const acceptRequest = async (requestId: string) => {
    try {
      await api.put(`/friends/request/${requestId}/accept`);
      loadFriendsData();
    } catch (e: any) {
      Alert.alert('Lỗi', e.response?.data?.message || 'Không thể chấp nhận');
    }
  };

  // Reject friend request
  const rejectRequest = async (requestId: string) => {
    try {
      await api.put(`/friends/request/${requestId}/reject`);
      setRequests((prev) => prev.filter((r) => (r.requestId || r._id || r.id) !== requestId));
    } catch (e: any) {
      Alert.alert('Lỗi', e.response?.data?.message || 'Không thể từ chối');
    }
  };

  const filteredFriends = searchQuery && searchQuery.length >= 2 && searchResults.length === 0 
    ? friends.filter((f) => f.displayName.toLowerCase().includes(searchQuery.toLowerCase()))
    : friends;

  return (
    <AppScreen disableBottomSafeArea>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Danh bạ</Text>
          <AppIconButton 
            icon={<UserPlus size={22} color={lightTheme.accent} />}
            onPress={() => {}}
            size={40}
          />
        </View>

        {/* Search Bar */}
        <View style={{ marginBottom: 16 }}>
          <AppSearchBar 
            value={searchQuery}
            onChangeText={handleSearch}
            placeholder="Tìm theo @username hoặc email..."
            onClear={() => { setSearchQuery(''); setSearchResults([]); }}
          />
        </View>

        {/* Search Results */}
        {searchResults.length > 0 && (
          <AppCard style={{ marginBottom: 16 }}>
            <Text style={styles.listTitle}>KẾT QUẢ TÌM KIẾM</Text>
            {searchResults.map((user) => (
              <UserListItem
                key={user.id || user._id}
                name={user.displayName || 'Người dùng'}
                subtitle={user.username ? `@${user.username}` : (user.email || '')}
                avatarUrl={user.avatarUrl}
                style={styles.searchResultItem}
                action={(
                  <TouchableOpacity
                  style={styles.addFriendBtn}
                  onPress={() => sendFriendRequest(user.id || user._id)}
                  >
                    <UserPlus size={16} color={lightTheme.accent} />
                  </TouchableOpacity>
                )}
              />
            ))}
          </AppCard>
        )}

        {/* Tabs */}
        <SegmentTabs
          value={activeTab}
          onChange={setActiveTab}
          style={styles.tabRow}
          items={[
            { key: 'friends', label: `Bạn bè (${friendCount})` },
            { key: 'requests', label: `Lời mời ${requests.length > 0 ? `(${requests.length})` : ''}` },
            { key: 'suggestions', label: 'Gợi ý' },
          ]}
        />

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <View style={{ gap: 12, padding: 16, flex: 1 }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <SkeletonCardPreset key={i} lines={2} showAvatar />
              ))}
            </View>
          </View>
        ) : activeTab === 'friends' ? (
          /* Friends List */
          <FlatList
            data={filteredFriends}
            keyExtractor={(item, index) => item._id || item.id || index.toString()}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={lightTheme.accent} colors={[lightTheme.accent]} />
            }
            renderItem={({ item }) => {
              const friendId = (item._id || item.id) as string;
              return (
                <UserListItem
                  name={item.displayName}
                  subtitle={item.status || 'Offline'}
                  avatarUrl={item.avatarUrl}
                  onPress={() => { if (friendId) void openProfileSheet(friendId); }}
                  style={styles.friendItem}
                  action={(
                    <TouchableOpacity
                      style={[styles.callBtn, chatLoading && styles.callBtnDisabled]}
                      onPress={(e) => {
                        e.stopPropagation();
                        if (friendId) void navigateToChat(friendId);
                      }}
                      disabled={chatLoading}
                    >
                      <MessageCircle size={18} color={lightTheme.accent} />
                    </TouchableOpacity>
                  )}
                />
              );
            }}
            ListEmptyComponent={
              <EmptyState variant="no-friends" />
            }
            contentContainerStyle={filteredFriends.length === 0 ? { flex: 1 } : { paddingBottom: 132 }}
          />
        ) : activeTab === 'requests' ? (
          /* Requests List */
          <FlatList
            data={requests}
            keyExtractor={(item, index) => item.requestId || item._id || item.id || index.toString()}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const reqId = item.requestId || item._id || item.id || '';
              const name = item.displayName || item.senderId?.displayName || 'User';
              const avatarUrl = item.avatarUrl || item.senderId?.avatarUrl;
              return (
                <UserListItem
                  name={name}
                  subtitle={new Date(item.createdAt).toLocaleDateString('vi-VN')}
                  avatarUrl={avatarUrl}
                  style={styles.requestItem}
                  action={(
                    <View style={styles.requestActions}>
                      <TouchableOpacity
                        style={styles.acceptBtn}
                        onPress={() => acceptRequest(reqId)}
                      >
                        <Check size={18} color={lightTheme.textOnAccent} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.rejectBtn}
                        onPress={() => rejectRequest(reqId)}
                      >
                        <X size={18} color={lightTheme.danger} />
                      </TouchableOpacity>
                    </View>
                  )}
                />
              );
            }}
            ListEmptyComponent={
              <EmptyState
                variant="no-results"
                title="Không có lời mời"
                description="Bạn chưa nhận được lời mời kết bạn nào"
              />
            }
            contentContainerStyle={requests.length === 0 ? { flex: 1 } : { paddingBottom: 132 }}
          />
        ) : (
          <View style={styles.suggestionEmpty}>
            <EmptyState
              variant="no-friends"
              title="Tìm thêm bạn bè"
              description="Nhập username hoặc email ở ô tìm kiếm để kết nối với mọi người."
            />
          </View>
        )}
      </View>

      {/* Profile Bottom Sheet */}
      <ProfileBottomSheet
        visible={profileSheetOpen}
        userId={profileSheetUserId}
        currentUserId={currentUserId}
        onClose={closeProfileSheet}
        onSendMessage={(userId) => { void navigateToChat(userId); }}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 14,
    paddingBottom: 12,
  },
  title: {
    color: lightTheme.textPrimary,
    fontSize: 24,
    fontFamily: fonts.bold,
  },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: lightTheme.surfaceCard,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: lightTheme.border,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: lightTheme.surfaceCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: lightTheme.border,
    paddingHorizontal: 15,
    height: 45,
    marginBottom: 15,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    color: lightTheme.textPrimary,
    fontFamily: fonts.regular,
    fontSize: 15,
  },
  // ─ Tabs ─
  tabRow: {
    marginBottom: 12,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: lightTheme.bgSecondary,
    borderWidth: 1,
    borderColor: lightTheme.border,
  },
  tabActive: {
    backgroundColor: lightTheme.accentLight,
    borderColor: lightTheme.accent,
  },
  tabText: {
    color: lightTheme.textSecondary,
    fontSize: 14,
    fontFamily: fonts.medium,
  },
  tabTextActive: {
    color: lightTheme.accent,
  },
  // ─ Search Results ─
  searchResultsBox: {
    marginBottom: 10,
  },
  // ─ Friend Items ─
  listTitle: {
    color: lightTheme.textSecondary,
    fontSize: 11,
    fontFamily: fonts.semiBold,
    textTransform: 'uppercase',
    marginBottom: 10,
    letterSpacing: 1,
  },
  friendItem: {
    marginBottom: 8,
  },
  searchResultItem: {
    marginBottom: 8,
  },
  avatar: {
    width: 45,
    height: 45,
    borderRadius: 18,
    backgroundColor: lightTheme.bgHover,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: lightTheme.textSecondary,
    fontSize: 16,
    fontFamily: fonts.bold,
  },
  friendInfo: {
    flex: 1,
    marginLeft: 15,
  },
  friendName: {
    color: lightTheme.textPrimary,
    fontSize: 16,
    fontFamily: fonts.semiBold,
  },
  friendStatus: {
    color: lightTheme.textSecondary,
    fontSize: 13,
    fontFamily: fonts.regular,
    marginTop: 2,
  },
  callBtn: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: lightTheme.surfaceSoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  callBtnDisabled: {
    opacity: 0.5,
  },
  addFriendBtn: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: lightTheme.surfaceSoft,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: lightTheme.border,
  },
  // ─ Request Items ─
  requestItem: {
    marginBottom: 8,
  },
  requestActions: {
    flexDirection: 'row',
    gap: 8,
  },
  acceptBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: lightTheme.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rejectBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: lightTheme.dangerSoft,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: lightTheme.dangerBorder,
  },
  requestBadge: {
    backgroundColor: lightTheme.danger,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
    paddingHorizontal: 5,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontFamily: fonts.bold,
  },
  divider: {
    height: 1,
    backgroundColor: lightTheme.divider,
    marginVertical: 10,
  },
  // ─ States ─
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: lightTheme.textSecondary,
    fontSize: 16,
    fontFamily: fonts.semiBold,
    marginTop: 16,
  },
  emptySubtext: {
    color: lightTheme.textTertiary,
    fontSize: 14,
    fontFamily: fonts.regular,
    marginTop: 4,
  },
  suggestionEmpty: {
    flex: 1,
  },
});
