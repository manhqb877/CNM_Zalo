import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pencil } from 'lucide-react-native';

import { lightTheme } from '../../src/theme/colors';
import { fonts } from '../../src/theme/fonts';
import { PostCard } from '../../src/components/PostCard';
import { CreatePostSheet } from '../../src/components/CreatePostSheet';
import { usePosts, type PostFilter } from '../../src/hooks/usePosts';
import { useExplore } from '../../src/hooks/useExplore';
import { SkeletonPostCardPreset } from '../../src/ui/ZyncSkeleton';
import { EmptyState } from '../../src/ui/EmptyState';
import { ProfileBottomSheet } from '../../src/components/ProfileBottomSheet';
import { useNavigationFlow } from '../../src/hooks/useNavigationFlow';
import { AppScreen } from '../../src/ui/AppScreen';
import { AppChip } from '../../src/ui/AppChip';
import { AppIconButton } from '../../src/ui/AppIconButton';
import { AppCard } from '../../src/ui/AppCard';
import { useAuthStore } from '../../src/store/useAuthStore';
import { SegmentTabs } from '../../src/ui/SegmentTabs';
import { ChannelCard } from '../../src/components/ChannelCard';
import { DeveloperCard } from '../../src/components/DeveloperCard';
import { fetchTrendingPosts, type Post } from '../../src/services/posts';

type CommunityView = 'feed' | 'explore';

const FILTERS: { key: PostFilter; label: string }[] = [
  { key: 'latest', label: 'Mới nhất' },
  { key: 'trending', label: 'Thu hút' },
  { key: 'question', label: 'Hỏi đáp' },
  { key: 'til', label: 'Hướng dẫn' },
];

const COMMUNITY_TABS: { key: CommunityView; label: string }[] = [
  { key: 'feed', label: 'Bảng tin' },
  { key: 'explore', label: 'Khám phá' },
];

export default function CommunityScreen() {
  const router = useRouter();
  const theme = lightTheme;
  const currentUserId = useAuthStore((s) => s.userInfo?._id) ?? '';
  const params = useLocalSearchParams<{ tab?: string }>();
  const [view, setView] = useState<CommunityView>('feed');

  const {
    posts,
    isLoading,
    isLoadingMore,
    hasMore,
    filter,
    error,
    loadPosts,
    loadMore,
    changeFilter,
    handleCreatePost,
    handleLikePost,
    handleBookmarkPost,
  } = usePosts({ initialFilter: 'latest' });

  const {
    channels,
    users,
    isLoadingChannels,
    isLoadingUsers,
    isJoining,
    error: exploreError,
    loadChannels,
    loadUsers,
    handleJoinChannel,
  } = useExplore();

  const [trendingPosts, setTrendingPosts] = useState<Post[]>([]);
  const [isLoadingTrending, setIsLoadingTrending] = useState(false);
  const [trendingError, setTrendingError] = useState<string | null>(null);

  const {
    navigateToChat,
    sendFriendRequest,
    profileSheetUserId,
    profileSheetOpen,
    profileSheetUser,
    profileSheetLoading,
    openProfileSheet,
    closeProfileSheet,
  } = useNavigationFlow();

  const [showCreate, setShowCreate] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExploreRefreshing, setIsExploreRefreshing] = useState(false);

  useEffect(() => {
    loadPosts();
  }, []);

  useEffect(() => {
    if (params.tab === 'explore') {
      setView('explore');
    }
  }, [params.tab]);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadPosts(true);
    setIsRefreshing(false);
  }, [loadPosts]);

  const loadTrending = useCallback(async () => {
    try {
      setTrendingError(null);
      setIsLoadingTrending(true);
      const data = await fetchTrendingPosts(6);
      setTrendingPosts(data);
    } catch (err) {
      setTrendingError(err instanceof Error ? err.message : 'Không thể tải bài viết thịnh hành');
    } finally {
      setIsLoadingTrending(false);
    }
  }, []);

  const loadExplore = useCallback(async () => {
    await Promise.all([loadChannels(), loadUsers(), loadTrending()]);
  }, [loadChannels, loadUsers, loadTrending]);

  useEffect(() => {
    if (view !== 'explore') return;
    void loadExplore();
  }, [view, loadExplore]);

  const onExploreRefresh = useCallback(async () => {
    setIsExploreRefreshing(true);
    await loadExplore();
    setIsExploreRefreshing(false);
  }, [loadExplore]);

  const handlePostPress = useCallback(
    (post: { _id: string }) => {
      router.push({ pathname: '/post-detail', params: { postId: post._id } });
    },
    [router]
  );

  const handleCreateSubmit = useCallback(
    async (payload: Parameters<typeof handleCreatePost>[0]) => {
      await handleCreatePost(payload);
    },
    [handleCreatePost]
  );

  const handleAuthorPress = useCallback(
    (authorId: string) => {
      void openProfileSheet(authorId);
    },
    [openProfileSheet]
  );

  const handleExplorePostPress = useCallback(
    (post: Post) => {
      router.push({ pathname: '/post-detail', params: { postId: post._id } });
    },
    [router]
  );

  const handleAddFriend = useCallback(
    async (userId: string) => {
      const ok = await sendFriendRequest(userId);
      if (!ok) {
        Alert.alert('Không thể gửi lời mời kết bạn', 'Vui lòng thử lại sau');
        return;
      }
      Alert.alert('Đã gửi lời mời kết bạn');
    },
    [sendFriendRequest]
  );

  const popularTags = useMemo(() => {
    const counts = new Map<string, number>();
    trendingPosts.forEach((post) => {
      post.tags?.forEach((tag) => {
        const cleaned = tag.trim();
        if (!cleaned) return;
        counts.set(cleaned, (counts.get(cleaned) ?? 0) + 1);
      });
    });
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([tag]) => tag);
  }, [trendingPosts]);

  const hasExploreContent =
    channels.length > 0 || users.length > 0 || trendingPosts.length > 0 || popularTags.length > 0;

  return (
    <AppScreen disableBottomSafeArea>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Cộng đồng</Text>
        <AppIconButton
          icon={<Pencil size={20} color={lightTheme.accent} />}
          onPress={() => setShowCreate(true)}
          size={40}
        />
      </View>

      <View style={styles.viewTabs}>
        <SegmentTabs items={COMMUNITY_TABS} value={view} onChange={setView} />
      </View>

      {view === 'feed' ? (
        <>
          {/* Filter tabs */}
          <View style={styles.filterRow}>
            <SegmentTabs
              items={FILTERS}
              value={filter}
              onChange={changeFilter}
              scrollable
            />
          </View>

          {/* Post list */}
          <FlatList
            data={posts}
            keyExtractor={(item) => item._id}
            renderItem={({ item }) => (
              <PostCard
                post={item}
                onPress={handlePostPress}
                onLike={handleLikePost}
                onBookmark={handleBookmarkPost}
                onAuthorPress={handleAuthorPress}
              />
            )}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={onRefresh}
                tintColor={lightTheme.accent}
              />
            }
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              isLoadingMore ? (
                <ActivityIndicator
                  color={lightTheme.accent}
                  style={styles.loadingMore}
                />
              ) : null
            }
            ListEmptyComponent={
              !isLoading ? (
                <EmptyState variant="no-posts" />
              ) : null
            }
          />

          {isLoading && !isRefreshing && (
            <View style={styles.loadingOverlay}>
              <View style={{ gap: 12, width: '100%', padding: 16 }}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <SkeletonPostCardPreset key={i} />
                ))}
              </View>
            </View>
          )}
        </>
      ) : (
        <ScrollView
          contentContainerStyle={styles.exploreContent}
          refreshControl={
            <RefreshControl
              refreshing={isExploreRefreshing}
              onRefresh={onExploreRefresh}
              tintColor={lightTheme.accent}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {!hasExploreContent && !isLoadingChannels && !isLoadingUsers && !isLoadingTrending ? (
            <View style={styles.exploreEmptyWrap}>
              <EmptyState
                variant="no-results"
                title="Chưa có nội dung khám phá"
                description="Các kênh, bài viết và gợi ý kết nối sẽ hiển thị ở đây."
              />
            </View>
          ) : null}

          <View style={styles.exploreSection}>
            <View style={styles.exploreHeader}>
              <Text style={styles.exploreTitle}>Kênh công khai nổi bật</Text>
            </View>
            {isLoadingChannels ? (
              <View style={styles.skeletonStack}>
                {Array.from({ length: 2 }).map((_, i) => (
                  <SkeletonPostCardPreset key={i} />
                ))}
              </View>
            ) : channels.length > 0 ? (
              channels.slice(0, 4).map((channel) => (
                <ChannelCard
                  key={channel._id}
                  channel={channel}
                  isJoining={isJoining === channel._id}
                  onJoin={handleJoinChannel}
                />
              ))
            ) : (
              <Text style={styles.sectionNote}>
                {exploreError ?? 'Chưa có kênh phù hợp để hiển thị.'}
              </Text>
            )}
          </View>

          <View style={styles.exploreSection}>
            <View style={styles.exploreHeader}>
              <Text style={styles.exploreTitle}>Nhà phát triển nổi bật</Text>
            </View>
            {isLoadingUsers ? (
              <View style={styles.skeletonStack}>
                {Array.from({ length: 2 }).map((_, i) => (
                  <SkeletonPostCardPreset key={i} />
                ))}
              </View>
            ) : users.length > 0 ? (
              users.slice(0, 4).map((user) => (
                <DeveloperCard
                  key={user.id}
                  user={user}
                  onMessage={(userId) => { void navigateToChat(userId); }}
                  onAddFriend={(userId) => { void handleAddFriend(userId); }}
                />
              ))
            ) : (
              <Text style={styles.sectionNote}>
                {exploreError ?? 'Chưa có gợi ý kết nối phù hợp.'}
              </Text>
            )}
          </View>

          <View style={styles.exploreSection}>
            <View style={styles.exploreHeader}>
              <Text style={styles.exploreTitle}>Bài viết thịnh hành</Text>
            </View>
            {isLoadingTrending ? (
              <View style={styles.skeletonStack}>
                {Array.from({ length: 2 }).map((_, i) => (
                  <SkeletonPostCardPreset key={i} />
                ))}
              </View>
            ) : trendingPosts.length > 0 ? (
              trendingPosts.slice(0, 4).map((post) => (
                <AppCard
                  key={post._id}
                  style={styles.trendingCard}
                  onPress={() => handleExplorePostPress(post)}
                >
                  <Text style={styles.trendingTitle} numberOfLines={2}>
                    {post.title}
                  </Text>
                  <Text style={styles.trendingMeta} numberOfLines={1}>
                    {(post.author?.displayName || 'Ẩn danh')}
                    {' · '}
                    {post.likesCount} thích
                    {' · '}
                    {post.commentsCount} bình luận
                  </Text>
                </AppCard>
              ))
            ) : (
              <Text style={styles.sectionNote}>
                {trendingError ?? 'Chưa có bài viết thịnh hành.'}
              </Text>
            )}
          </View>

          <View style={styles.exploreSection}>
            <View style={styles.exploreHeader}>
              <Text style={styles.exploreTitle}>Thẻ phổ biến</Text>
            </View>
            {popularTags.length > 0 ? (
              <View style={styles.tagRow}>
                {popularTags.map((tag) => (
                  <AppChip key={tag} label={tag.startsWith('#') ? tag : `#${tag}`} />
                ))}
              </View>
            ) : (
              <Text style={styles.sectionNote}>Chưa có thẻ nổi bật.</Text>
            )}
          </View>
        </ScrollView>
      )}

      <CreatePostSheet
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onSubmit={handleCreateSubmit}
      />

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
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  headerTitle: {
    color: lightTheme.textPrimary,
    fontFamily: fonts.bold,
    fontSize: 24,
  },
  createButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: lightTheme.surfaceCard,
    borderWidth: 1,
    borderColor: lightTheme.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewTabs: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  filterRow: {
    flexDirection: 'row',
    paddingBottom: 12,
  },
  filterTab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: lightTheme.border,
    backgroundColor: lightTheme.bgSecondary,
  },
  filterTabActive: {
    backgroundColor: lightTheme.accent,
    borderColor: lightTheme.accent,
  },
  filterText: {
    color: lightTheme.textSecondary,
    fontFamily: fonts.medium,
    fontSize: 13,
  },
  filterTextActive: {
    color: lightTheme.textPrimary,
    fontFamily: fonts.bold,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 140, // Increased bottom padding so the bottom tab doesn't hide content
    flexGrow: 1,
  },
  exploreContent: {
    paddingHorizontal: 16,
    paddingBottom: 140,
    gap: 16,
  },
  exploreSection: {
    gap: 10,
  },
  exploreHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  exploreTitle: {
    color: lightTheme.textPrimary,
    fontFamily: fonts.semiBold,
    fontSize: 16,
  },
  sectionNote: {
    color: lightTheme.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  skeletonStack: {
    gap: 12,
  },
  trendingCard: {
    padding: 14,
  },
  trendingTitle: {
    color: lightTheme.textPrimary,
    fontFamily: fonts.semiBold,
    fontSize: 15,
  },
  trendingMeta: {
    color: lightTheme.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 12,
    marginTop: 6,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  exploreEmptyWrap: {
    paddingVertical: 20,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
  },
  emptyTitle: {
    color: lightTheme.textPrimary,
    fontFamily: fonts.bold,
    fontSize: 18,
    marginBottom: 8,
  },
  emptySubtitle: {
    color: lightTheme.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 14,
    textAlign: 'center',
  },
  loadingMore: {
    paddingVertical: 20,
  },
  loadingOverlay: {
    position: 'absolute',
    inset: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
