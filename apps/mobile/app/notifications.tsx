import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Bell, CheckCheck, ChevronLeft } from 'lucide-react-native';
import { AppScreen } from '../src/ui/AppScreen';
import { NotificationItem } from '../src/ui/NotificationItem';
import { SkeletonCardPreset } from '../src/ui/ZyncSkeleton';
import { useNotificationsContext } from '../src/context/notifications-context';
import type { AppNotification } from '../src/services/notifications';
import { fonts } from '../src/theme/fonts';
import { mobileColors, mobileRadius, mobileSpacing } from '../src/theme/tokens';

function resolveNotificationRoute(n: AppNotification) {
  const data = n.data ?? {};
  const conversationId = n.conversationId || data.conversationId || data.chatId;
  const postId = data.postId || data.communityPostId;

  if (conversationId) {
    return {
      pathname: '/chat-room' as const,
      params: {
        conversationId,
        name: n.title.replace(/^Tin nhắn mới từ\s+/i, '').replace(/^Nhóm:\s*/i, '') || 'Chat',
        avatarUrl: '',
        isGroup: n.type === 'group_invite' || n.type === 'group_update' ? 'true' : 'false',
      },
    };
  }

  if (n.type === 'friend_request' || n.type === 'friend_accepted') {
    return '/(tabs)/friends' as const;
  }

  if (postId) {
    return { pathname: '/post-detail' as const, params: { postId } };
  }

  return '/(tabs)/community' as const;
}

export default function NotificationsScreen() {
  const router = useRouter();
  const {
    notifications,
    unreadCount,
    isLoading,
    error,
    hasMore,
    loadNotifications,
    loadMore,
    markRead,
    markAllRead,
  } = useNotificationsContext();
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void loadNotifications();
    }, [loadNotifications]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadNotifications();
    setRefreshing(false);
  }, [loadNotifications]);

  const handlePress = useCallback(
    (item: AppNotification) => {
      if (!item.read) void markRead([item._id]);
      router.push(resolveNotificationRoute(item) as any);
    },
    [markRead, router],
  );

  return (
    <AppScreen disableBottomSafeArea>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityLabel="Quay lại">
          <ChevronLeft size={22} color={mobileColors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.title}>Thông báo</Text>
          {unreadCount > 0 ? <Text style={styles.subtitle}>{unreadCount} chưa đọc</Text> : null}
        </View>
        {unreadCount > 0 ? (
          <TouchableOpacity onPress={markAllRead} style={styles.markAllButton}>
            <CheckCheck size={15} color={mobileColors.accent} />
            <Text style={styles.markAllText}>Đọc hết</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 84 }} />
        )}
      </View>

      <FlatList
        data={notifications}
        keyExtractor={(item) => item._id}
        renderItem={({ item }) => <NotificationItem item={item} onPress={handlePress} />}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={mobileColors.accent} />
        }
        contentContainerStyle={notifications.length === 0 ? styles.emptyList : styles.list}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        showsVerticalScrollIndicator={false}
        onEndReached={() => {
          if (hasMore && !isLoading) loadMore();
        }}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.skeletonList}>
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonCardPreset key={i} lines={2} showAvatar />
              ))}
            </View>
          ) : error ? (
            <View style={styles.emptyState}>
              <Bell size={40} color={mobileColors.danger} />
              <Text style={styles.emptyTitle}>Không thể tải thông báo</Text>
              <Text style={styles.emptyText}>{error}</Text>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Bell size={40} color={mobileColors.textMuted} />
              <Text style={styles.emptyTitle}>Không có thông báo</Text>
              <Text style={styles.emptyText}>Bạn đã đọc hết mọi cập nhật.</Text>
            </View>
          )
        }
        ListFooterComponent={
          isLoading && notifications.length > 0 ? (
            <ActivityIndicator size="small" color={mobileColors.accent} style={styles.footerLoader} />
          ) : notifications.length > 0 && unreadCount === 0 ? (
            <Text style={styles.allReadText}>Bạn đã đọc hết thông báo.</Text>
          ) : null
        }
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: mobileSpacing.screenPadding,
    paddingBottom: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: mobileRadius.radiusPill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: mobileColors.surface,
    borderWidth: 1,
    borderColor: mobileColors.border,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: mobileColors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: 22,
  },
  subtitle: {
    color: mobileColors.textSecondary,
    fontFamily: fonts.medium,
    fontSize: 12,
    marginTop: 2,
  },
  markAllButton: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: mobileRadius.radiusPill,
    backgroundColor: mobileColors.accentSoft,
    paddingHorizontal: 12,
  },
  markAllText: {
    color: mobileColors.accent,
    fontFamily: fonts.semiBold,
    fontSize: 12,
  },
  list: {
    paddingHorizontal: mobileSpacing.screenPadding,
    paddingBottom: 28,
  },
  emptyList: {
    flexGrow: 1,
    paddingHorizontal: mobileSpacing.screenPadding,
  },
  skeletonList: {
    gap: 12,
    paddingVertical: 8,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyTitle: {
    color: mobileColors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: 17,
    marginTop: 14,
  },
  emptyText: {
    color: mobileColors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 13,
    marginTop: 4,
  },
  footerLoader: {
    paddingVertical: 18,
  },
  allReadText: {
    color: mobileColors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 18,
  },
});
