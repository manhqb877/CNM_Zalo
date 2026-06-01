import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  Users,
  MessageCircle,
  Mail,
  Globe,
  ChevronRight,
  Sparkles,
  TrendingUp,
  Zap,
  Calendar,
} from 'lucide-react-native';
import { fonts } from '../../src/theme/fonts';
import { useAppPreferencesStore } from '../../src/store/useAppPreferencesStore';

import { lightTheme } from '../../src/theme/colors';
import { useAuthStore } from '../../src/store/useAuthStore';
import api from '../../src/services/api';
import { useNotificationsContext } from '../../src/context/notifications-context';
// StoryBar removed - component not available in mobile build
import { SkeletonCardPreset } from '../../src/ui/ZyncSkeleton';
import { AppScreen } from '../../src/ui/AppScreen';
import { AppCard } from '../../src/ui/AppCard';
import { StatStrip } from '../../src/ui/StatStrip';
import { ActionTile } from '../../src/ui/ActionTile';
import { Avatar } from '../../src/ui/Avatar';

// ============================================================
// HELPERS
// ============================================================
function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 6) return 'Chào buổi khuya';
  if (h < 12) return 'Chào buổi sáng';
  if (h < 14) return 'Chào buổi trưa';
  if (h < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Vừa xong';
  if (minutes < 60) return `${minutes}p trước`;
  if (hours < 24) return `${hours} giờ trước`;
  return `${days} ngày trước`;
}

// ============================================================
// TYPES
// ============================================================
interface Stats {
  friends: number;
  conversations: number;
  unread: number;
  posts: number;
}

interface TrendingPost {
  _id: string;
  title: string;
  author?: { displayName: string };
  likesCount: number;
  commentsCount: number;
  createdAt: string;
}

interface Activity {
  _id: string;
  type: 'friend_added' | 'post_liked' | 'comment' | 'mention' | 'system';
  message: string;
  createdAt: string;
  read: boolean;
}

// ============================================================
// COMPONENT: STAT CARD
// ============================================================
interface StatCardProps {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
  loading?: boolean;
}

function StatCard({ label, value, icon, color, loading }: StatCardProps) {
  return (
    <AppCard style={styles.statCard}>
      <View style={[styles.statIconWrap, { backgroundColor: `${color}18` }]}>
        {icon}
      </View>
      {loading ? (
        <ActivityIndicator size="small" color={color} style={{ marginTop: 8 }} />
      ) : (
        <Text style={styles.statValue}>{value}</Text>
      )}
      <Text style={styles.statLabel}>{label}</Text>
    </AppCard>
  );
}

// ============================================================
// COMPONENT: QUICK ACTION
// ============================================================
interface QuickActionProps {
  label: string;
  icon: React.ReactNode;
  color: string;
  onPress: () => void;
}

function QuickAction({ label, icon, color, onPress }: QuickActionProps) {
  return (
    <TouchableOpacity style={styles.quickAction} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.quickIconWrap, { backgroundColor: `${color}18` }]}>
        {icon}
      </View>
      <Text style={styles.quickLabel} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

// ============================================================
// COMPONENT: TRENDING POST ITEM
// ============================================================
interface TrendingPostItemProps {
  post: TrendingPost;
  index: number;
  onPress: (post: TrendingPost) => void;
  theme: typeof lightTheme;
}

function TrendingPostItem({ post, index, onPress, theme }: TrendingPostItemProps) {
  return (
    <TouchableOpacity style={styles.trendingItem} activeOpacity={0.7} onPress={() => onPress(post)}>
      <View style={styles.trendingLeft}>
        <View style={[styles.trendingRank, { backgroundColor: lightTheme.accentLight }]}>
          <Text style={[styles.trendingRankText, { color: lightTheme.accent }]}>
            {index + 1}
          </Text>
        </View>
      </View>
      <View style={styles.trendingContent}>
        <Text style={styles.trendingTitle} numberOfLines={2}>{post.title}</Text>
        <View style={styles.trendingMeta}>
          <Text style={styles.trendingMetaText}>{post.author?.displayName || 'Không rõ'}</Text>
          <View style={styles.trendingDot} />
          <Ionicons name="heart" size={12} color={lightTheme.danger} />
          <Text style={styles.trendingMetaText}>{post.likesCount}</Text>
          <View style={styles.trendingDot} />
          <Ionicons name="chatbubble-ellipses" size={12} color={lightTheme.info} />
          <Text style={styles.trendingMetaText}>{post.commentsCount}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ============================================================
// COMPONENT: ACTIVITY ITEM
// ============================================================
interface ActivityItemProps {
  activity: Activity;
  theme: typeof lightTheme;
}

function ActivityItem({ activity, theme }: ActivityItemProps) {
  const getActivityIcon = () => {
    switch (activity.type) {
      case 'friend_added':
        return <Users size={16} color={theme.accent} />;
      case 'post_liked':
        return <Ionicons name="heart" size={16} color={theme.danger} />;
      case 'comment':
        return <Ionicons name="chatbubble-ellipses" size={16} color={theme.info} />;
      case 'mention':
        return <Ionicons name="at" size={16} color={theme.violet} />;
      default:
        return <Sparkles size={16} color={theme.warning} />;
    }
  };

  return (
    <View style={[styles.activityItem, !activity.read && styles.activityUnread]}>
      <View style={[styles.activityIcon, { backgroundColor: `${theme.accent}18` }]}>
        {getActivityIcon()}
      </View>
      <View style={styles.activityContent}>
        <Text style={styles.activityMessage} numberOfLines={2}>{activity.message}</Text>
        <Text style={styles.activityTime}>{formatTimeAgo(activity.createdAt)}</Text>
      </View>
      {!activity.read && <View style={[styles.unreadDot, { backgroundColor: lightTheme.accent }]} />}
    </View>
  );
}

// ============================================================
// COMPONENT: EMPTY STATE
// ============================================================
interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

function EmptyState({ icon, title, description }: EmptyStateProps) {
  return (
    <View style={styles.emptyState}>
      {icon}
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDesc}>{description}</Text>
    </View>
  );
}

// ============================================================
// MAIN SCREEN
// ============================================================
export default function HomeScreen() {
  const router = useRouter();
  const theme = lightTheme;
  const userInfo = useAuthStore((s) => s.userInfo);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const {
    unreadCount: notificationUnread,
    openNotificationSheet,
    refreshUnreadCount,
  } = useNotificationsContext();
  const notificationBtnRef = useRef<View>(null);

  // State
  const [stats, setStats] = useState<Stats>({ friends: 0, conversations: 0, unread: 0, posts: 0 });
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  const [trendingPosts, setTrendingPosts] = useState<TrendingPost[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(true);

  const [activities, setActivities] = useState<Activity[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(true);

  const [refreshing, setRefreshing] = useState(false);

  const displayName = userInfo?.displayName || userInfo?.username || 'bạn';

  // ============================================================
  // DATA LOADING
  // ============================================================
  const loadStats = useCallback(async () => {
    try {
      setStatsError(null);
      const [friendsRes, convsRes, postsRes] = await Promise.allSettled([
        api.get('/friends/count'),
        api.get('/conversations'),
        api.get('/posts/feed?limit=1'),
      ]);

      let friends = 0;
      if (friendsRes.status === 'fulfilled') {
        friends = friendsRes.value.data?.count || 0;
      }

      let conversations = 0;
      let unread = 0;
      if (convsRes.status === 'fulfilled') {
        const convs = convsRes.value.data?.conversations || convsRes.value.data?.data || [];
        conversations = convs.length;
        unread = convs.reduce((sum: number, c: any) => sum + (c.unreadCount || 0), 0);
      }

      let posts = 0;
      if (postsRes.status === 'fulfilled') {
        posts = postsRes.value.data?.total || postsRes.value.data?.posts?.length || 0;
      }

      setStats({ friends, conversations, unread, posts });
    } catch (e) {
      console.error('Stats load error:', e);
      setStatsError('Không thể tải dữ liệu');
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const loadTrending = useCallback(async () => {
    try {
      const res = await api.get('/posts/trending?limit=5');
      const data = res.data?.data || res.data?.posts || [];
      setTrendingPosts(data);
    } catch (e) {
      console.error('Trending load error:', e);
    } finally {
      setTrendingLoading(false);
    }
  }, []);

  const loadActivities = useCallback(async () => {
    try {
      const res = await api.get('/notifications?limit=10');
      const data = res.data?.notifications || res.data?.data || [];
      setActivities(data
        .map((item: any) => ({
          ...item,
          message: item.message || item.title || item.body || '',
        }))
        .filter((item: Activity) => typeof item.message === 'string' && item.message.trim().length > 0));
    } catch (e) {
      console.error('Activities load error:', e);
    } finally {
      setActivitiesLoading(false);
    }
  }, []);

  const loadAllData = useCallback(async () => {
    await Promise.all([loadStats(), loadTrending(), loadActivities()]);
  }, [loadStats, loadTrending, loadActivities]);

  // ============================================================
  // EFFECTS
  // ============================================================
  useEffect(() => {
    if (isAuthenticated && isHydrated) {
      void loadAllData();
    } else if (isHydrated && !isAuthenticated) {
      setStatsLoading(false);
      setTrendingLoading(false);
      setActivitiesLoading(false);
    }
  }, [isAuthenticated, isHydrated, loadAllData]);

  useEffect(() => {
    if (isHydrated && !isAuthenticated) {
      router.replace('/(auth)/welcome');
    }
  }, [isHydrated, isAuthenticated, router]);

  useFocusEffect(
    useCallback(() => {
      void refreshUnreadCount();
    }, [refreshUnreadCount]),
  );

  // ============================================================
  // HANDLERS
  // ============================================================
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setStatsLoading(true);
    setTrendingLoading(true);
    setActivitiesLoading(true);
    void loadAllData();
    setRefreshing(false);
  }, [loadAllData]);

  const onPressNotificationBell = useCallback(() => {
    const v = notificationBtnRef.current;
    if (!v) {
      openNotificationSheet(null);
      return;
    }
    v.measureInWindow((pageX, pageY, width, height) => {
      if (width <= 0 || height <= 0) {
        openNotificationSheet(null);
        return;
      }
      openNotificationSheet({ pageX, pageY, width, height });
    });
  }, [openNotificationSheet]);

  const handleTrendingPostPress = useCallback((post: TrendingPost) => {
    router.push({ pathname: '/post-detail', params: { postId: post._id } });
  }, [router]);

  const handleRetry = useCallback(() => {
    setStatsLoading(true);
    setStatsError(null);
    void loadStats();
  }, [loadStats]);

  // ============================================================
  // RENDER
  // ============================================================
  if (!isAuthenticated) {
    return (
      <AppScreen disableBottomSafeArea>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0f9d8e" />
        </View>
      </AppScreen>
    );
  }

  return (
    <AppScreen disableBottomSafeArea>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

        {/* ============================================================ */}
        {/* HEADER */}
        {/* ============================================================ */}
        <View style={styles.headerContainer}>
          <View style={styles.headerLeft}>
            <Avatar url={userInfo?.avatarUrl} name={displayName} size={44} style={styles.headerAvatar} />
            <View style={styles.headerText}>
            <Text style={styles.headerGreeting}>{getGreeting()},</Text>
            <Text style={styles.headerName} numberOfLines={1}>{displayName}</Text>
            </View>
          </View>
          <TouchableOpacity
            ref={notificationBtnRef}
            style={styles.notificationBtn}
            onPress={onPressNotificationBell}
            activeOpacity={0.75}
            accessibilityLabel="Thông báo"
          >
            <Ionicons name="notifications-outline" size={24} color={theme.textPrimary} />
            {notificationUnread > 0 && (
              <View style={[styles.badge, { backgroundColor: theme.danger }]}>
                <Text style={styles.badgeText}>
                  {notificationUnread > 99 ? '99+' : String(notificationUnread)}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.accent}
              colors={[theme.accent]}
            />
          }
        >


          {/* ============================================================ */}
          {/* STATS GRID */}
          {/* ============================================================ */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Tổng quan</Text>
              <TouchableOpacity
                style={styles.seeAllBtn}
                onPress={() => router.push('/(tabs)/profile')}
                activeOpacity={0.7}
              >
                <Text style={styles.seeAllText}>Xem chi tiết</Text>
                <ChevronRight size={14} color={theme.accent} />
              </TouchableOpacity>
            </View>

            {statsError ? (
              <View style={styles.errorContainer}>
                <Ionicons name="cloud-offline-outline" size={40} color={theme.textSecondary} />
                <Text style={styles.errorText}>{statsError}</Text>
                <TouchableOpacity style={styles.retryButton} onPress={handleRetry} activeOpacity={0.7}>
                  <Ionicons name="refresh-outline" size={16} color={lightTheme.textPrimary} />
                  <Text style={styles.retryText}>Thử lại</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <StatStrip
                items={[
                  {
                    label: 'Bạn bè',
                    value: stats.friends,
                    icon: <Users size={18} color={theme.accent} />,
                    tone: theme.accent,
                    loading: statsLoading,
                  },
                  {
                    label: 'Hội thoại',
                    value: stats.conversations,
                    icon: <MessageCircle size={18} color={theme.info} />,
                    tone: theme.info,
                    loading: statsLoading,
                  },
                  {
                    label: 'Tin mới',
                    value: stats.unread,
                    icon: <Mail size={18} color={theme.warning} />,
                    tone: theme.warning,
                    loading: statsLoading,
                  },
                  {
                    label: 'Thông báo',
                    value: notificationUnread,
                    icon: <Ionicons name="notifications-outline" size={18} color={theme.violet} />,
                    tone: theme.violet,
                    loading: statsLoading,
                  },
                ]}
              />
            )}
          </View>

          {/* ============================================================ */}
          {/* QUICK ACTIONS */}
          {/* ============================================================ */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Thao tác nhanh</Text>
            <View style={styles.quickGrid}>
              <ActionTile
                label="Tin nhắn"
                icon={<MessageCircle size={22} color={theme.accent} />}
                tone={theme.accent}
                onPress={() => router.push('/(tabs)/chat')}
              />
              <ActionTile
                label="Danh bạ"
                icon={<Users size={22} color={theme.info} />}
                tone={theme.info}
                onPress={() => router.push('/(tabs)/friends')}
              />
              <ActionTile
                label="Cộng đồng"
                icon={<Globe size={22} color={theme.violet} />}
                tone={theme.violet}
                onPress={() => router.push('/(tabs)/community')}
              />
              <ActionTile
                label="Tạo nhóm"
                icon={<Ionicons name="add-circle-outline" size={22} color={theme.pink} />}
                tone={theme.pink}
                onPress={() => router.push('/create-group')}
              />
            </View>
          </View>

          {/* ============================================================ */}
          {/* TRENDING POSTS */}
          {/* ============================================================ */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <TrendingUp size={18} color={theme.accent} />
                <Text style={[styles.sectionTitle, { marginLeft: 8 }]}>Xu hướng</Text>
              </View>
              <TouchableOpacity
                style={styles.seeAllBtn}
                onPress={() => router.push('/(tabs)/community')}
                activeOpacity={0.7}
              >
                <Text style={styles.seeAllText}>Xem thêm</Text>
                <ChevronRight size={14} color={theme.accent} />
              </TouchableOpacity>
            </View>

            {trendingLoading ? (
              <AppCard style={styles.trendingPanel}>
                <View style={{ gap: 12 }}>
                  {Array.from({ length: 3 }).map((_, i) => (
                    <SkeletonCardPreset key={i} lines={2} showAvatar={false} />
                  ))}
                </View>
              </AppCard>
            ) : trendingPosts.length === 0 ? (
              <EmptyState
                icon={<Zap size={32} color={theme.textSecondary} />}
                title="Chưa có bài viết xu hướng"
                description="Hãy là người đầu tiên đăng bài!"
              />
            ) : (
              <AppCard style={styles.trendingPanel}>
                {trendingPosts.map((post, index) => (
                  <TrendingPostItem
                    key={post._id}
                    post={post}
                    index={index}
                    onPress={handleTrendingPostPress}
                    theme={theme}
                  />
                ))}
              </AppCard>
            )}
          </View>

          {/* ============================================================ */}
          {/* RECENT ACTIVITY */}
          {/* ============================================================ */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Calendar size={18} color={theme.accent} />
                <Text style={[styles.sectionTitle, { marginLeft: 8 }]}>Hoạt động gần đây</Text>
              </View>
            </View>

            {activitiesLoading ? (
              <AppCard style={styles.activityPanel}>
                <View style={{ gap: 12 }}>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <SkeletonCardPreset key={i} lines={2} showAvatar />
                  ))}
                </View>
              </AppCard>
            ) : activities.length === 0 ? (
              <EmptyState
                icon={<Sparkles size={32} color={theme.textSecondary} />}
                title="Chưa có hoạt động"
                description="Các thông báo sẽ xuất hiện ở đây"
              />
            ) : (
              <AppCard style={styles.activityPanel}>
                {activities.slice(0, 5).map((activity) => (
                  <ActivityItem key={activity._id} activity={activity} theme={theme} />
                ))}
              </AppCard>
            )}
          </View>

          {/* ============================================================ */}
          {/* ABOUT CARD */}
          {/* ============================================================ */}
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.aboutCard}
              onPress={() => router.push('/(tabs)/profile')}
              activeOpacity={0.7}
            >
              <View style={[styles.aboutIcon, { backgroundColor: `${theme.accent}18` }]}>
                <Sparkles size={20} color={theme.accent} />
              </View>
              <View style={styles.aboutContent}>
                <Text style={styles.aboutTitle}>Zync Platform</Text>
                <Text style={styles.aboutDesc}>
                  Nhắn tin thời gian thực, kết nối mọi lúc mọi nơi
                </Text>
              </View>
              <ChevronRight size={18} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.bottomSpacer} />
        </ScrollView>
    </AppScreen>
  );
}

// ============================================================
// STYLES
// ============================================================
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: 'transparent' },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 140 },

  // Header
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
    minWidth: 0,
  },
  headerAvatar: {
    marginRight: 10,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  headerGreeting: {
    fontFamily: fonts.medium,
    color: lightTheme.textSecondary,
    fontSize: 13,
  },
  headerName: {
    fontFamily: fonts.bold,
    fontSize: 20,
    color: lightTheme.textPrimary,
    marginTop: 2,
  },
  notificationBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: lightTheme.surface,
    borderWidth: 1,
    borderColor: lightTheme.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: lightTheme.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontFamily: 'BeVietnamPro_700Bold',
  },

  // Section
  section: { marginTop: 16 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionTitle: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: lightTheme.textPrimary,
  },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  seeAllText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: lightTheme.accent,
  },

  // Stats
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  statIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statValue: {
    fontFamily: fonts.bold,
    fontSize: 20,
    color: lightTheme.textPrimary,
    marginTop: 8,
  },
  statLabel: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: lightTheme.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },

  // Quick Actions
  quickGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  quickAction: {
    alignItems: 'center',
    width: '18%',
  },
  quickIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  quickLabel: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: lightTheme.textSecondary,
    textAlign: 'center',
  },

  // Trending
  trendingPanel: { padding: 0, overflow: 'hidden' },
  trendingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: lightTheme.border,
  },
  trendingLeft: { marginRight: 12 },
  trendingRank: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trendingRankText: {
    fontFamily: fonts.bold,
    fontSize: 14,
  },
  trendingContent: { flex: 1 },
  trendingTitle: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: lightTheme.textPrimary,
    lineHeight: 20,
  },
  trendingMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  trendingDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: lightTheme.textTertiary,
    marginHorizontal: 4,
  },
  trendingMetaText: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: lightTheme.textSecondary,
  },

  // Activity
  activityPanel: { padding: 0, overflow: 'hidden' },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: lightTheme.border,
  },
  activityUnread: {
    backgroundColor: lightTheme.glassBorderSoft,
  },
  activityIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  activityContent: { flex: 1 },
  activityMessage: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: lightTheme.textPrimary,
    lineHeight: 20,
  },
  activityTime: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: lightTheme.textSecondary,
    marginTop: 4,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 8,
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  emptyTitle: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: lightTheme.textPrimary,
    marginTop: 12,
  },
  emptyDesc: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: lightTheme.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },

  // Loading & Error
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  loadingText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: lightTheme.textSecondary,
  },
  errorContainer: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  errorText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: lightTheme.textSecondary,
    textAlign: 'center',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: lightTheme.surfaceCard,
    borderWidth: 1,
    borderColor: lightTheme.border,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 6,
    marginTop: 4,
  },
  retryText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: lightTheme.textPrimary,
  },

  // About Card
  aboutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: lightTheme.surfaceCard,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: lightTheme.border,
  },
  aboutIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  aboutContent: { flex: 1 },
  aboutTitle: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: lightTheme.textPrimary,
  },
  aboutDesc: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: lightTheme.textSecondary,
    marginTop: 2,
  },

  bottomSpacer: { height: 100 },
});
