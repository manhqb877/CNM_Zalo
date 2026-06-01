import React, { useCallback } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Bell, CheckCheck, X } from 'lucide-react-native';
import type { AppNotification, NotificationAnchorRect } from '../services/notifications';
import { fonts } from '../theme/fonts';
import { mobileColors, mobileRadius, mobileShadow, mobileSpacing } from '../theme/tokens';
import { NotificationItem } from '../ui/NotificationItem';

interface NotificationsSheetProps {
  visible: boolean;
  anchorRect: NotificationAnchorRect | null;
  onClose: () => void;
  notifications: AppNotification[];
  isLoading: boolean;
  error?: string | null;
  hasMore: boolean;
  onLoadMore: () => void;
  onMarkRead: (ids: string[]) => void;
  onMarkAllRead: () => void;
}

function resolveNotificationRoute(n: AppNotification) {
  const data = n.data ?? {};
  const conversationId = n.conversationId || data.conversationId || data.chatId;
  const postId = data.postId || data.communityPostId;
  const groupId = data.groupId || data.channelId;

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

  if (groupId) {
    return '/(tabs)/community' as const;
  }

  return '/(tabs)/community' as const;
}

export function NotificationsSheet({
  visible,
  onClose,
  notifications,
  isLoading,
  error,
  hasMore,
  onLoadMore,
  onMarkRead,
  onMarkAllRead,
}: NotificationsSheetProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const unreadCount = notifications.filter((n) => !n.read).length;

  const handlePressItem = useCallback(
    (item: AppNotification) => {
      if (!item.read) onMarkRead([item._id]);
      onClose();
      router.push(resolveNotificationRoute(item) as any);
    },
    [onClose, onMarkRead, router],
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.root}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 14) }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.closeButton} accessibilityLabel="Đóng">
              <X size={20} color={mobileColors.textPrimary} />
            </TouchableOpacity>
            <View style={styles.headerTitleWrap}>
              <Text style={styles.headerTitle}>Thông báo</Text>
              {unreadCount > 0 ? <Text style={styles.headerCount}>{unreadCount} chưa đọc</Text> : null}
            </View>
            {unreadCount > 0 ? (
              <TouchableOpacity onPress={onMarkAllRead} style={styles.markAllButton}>
                <CheckCheck size={15} color={mobileColors.accent} />
                <Text style={styles.markAllText}>Đọc hết</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.headerSpacer} />
            )}
          </View>

          {isLoading && notifications.length === 0 ? (
            <View style={styles.stateBox}>
              <ActivityIndicator size="large" color={mobileColors.accent} />
            </View>
          ) : error ? (
            <View style={styles.stateBox}>
              <Bell size={34} color={mobileColors.danger} />
              <Text style={styles.emptyTitle}>Không thể tải thông báo</Text>
              <Text style={styles.emptyText}>{error}</Text>
            </View>
          ) : notifications.length === 0 ? (
            <View style={styles.stateBox}>
              <Bell size={34} color={mobileColors.textMuted} />
              <Text style={styles.emptyTitle}>Không có thông báo</Text>
              <Text style={styles.emptyText}>Các cập nhật mới sẽ xuất hiện tại đây.</Text>
            </View>
          ) : (
            <FlatList
              data={notifications}
              keyExtractor={(item) => item._id}
              renderItem={({ item }) => <NotificationItem item={item} onPress={handlePressItem} />}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.listContent}
              ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
              onEndReached={() => {
                if (hasMore && !isLoading) onLoadMore();
              }}
              onEndReachedThreshold={0.35}
              ListFooterComponent={
                isLoading ? (
                  <ActivityIndicator color={mobileColors.accent} style={styles.footerLoader} />
                ) : unreadCount === 0 ? (
                  <Text style={styles.allReadText}>Bạn đã đọc hết thông báo.</Text>
                ) : null
              }
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.26)',
  },
  sheet: {
    height: '88%',
    backgroundColor: mobileColors.bg,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 1,
    borderColor: mobileColors.border,
    paddingHorizontal: mobileSpacing.screenPadding,
    ...mobileShadow.shadowFloating,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: mobileRadius.radiusPill,
    backgroundColor: mobileColors.border,
    marginTop: 10,
    marginBottom: 8,
  },
  header: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: mobileRadius.radiusPill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: mobileColors.surface,
    borderWidth: 1,
    borderColor: mobileColors.border,
  },
  headerTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    color: mobileColors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: 20,
  },
  headerCount: {
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
  headerSpacer: {
    width: 72,
  },
  listContent: {
    paddingBottom: 16,
  },
  stateBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
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
    lineHeight: 19,
    marginTop: 4,
    textAlign: 'center',
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
