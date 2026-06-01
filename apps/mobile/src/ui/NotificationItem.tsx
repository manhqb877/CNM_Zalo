import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import {
  Bell,
  ChevronRight,
  MessageCircle,
  UserCheck,
  Users,
} from 'lucide-react-native';
import type { AppNotification } from '../services/notifications';
import { fonts } from '../theme/fonts';
import { mobileColors, mobileRadius, mobileSpacing } from '../theme/tokens';
import { AnimatedPressable } from './AnimatedPressable';

const TYPE_ICONS: Partial<Record<AppNotification['type'], React.ElementType>> = {
  new_message: MessageCircle,
  friend_request: Users,
  friend_accepted: UserCheck,
  group_invite: Users,
  group_update: Users,
};

export function formatNotificationTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'Vừa xong';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ngày trước`;
  return new Date(dateStr).toLocaleDateString('vi-VN');
}

interface NotificationItemProps {
  item: AppNotification;
  onPress: (item: AppNotification) => void;
  style?: StyleProp<ViewStyle>;
}

export function NotificationItem({ item, onPress, style }: NotificationItemProps) {
  const Icon = TYPE_ICONS[item.type] ?? Bell;
  const unread = !item.read;

  return (
    <AnimatedPressable
      style={[styles.row, unread && styles.rowUnread, style]}
      onPress={() => onPress(item)}
      activeScale={0.98}
    >
      <View style={[styles.iconWrap, unread && styles.iconWrapUnread]}>
        <Icon size={18} color={unread ? mobileColors.accent : mobileColors.textSecondary} />
      </View>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, unread && styles.titleUnread]} numberOfLines={2}>
            {item.title}
          </Text>
          {unread ? <View style={styles.unreadDot} /> : null}
        </View>
        {item.body ? (
          <Text style={styles.preview} numberOfLines={2}>
            {item.body}
          </Text>
        ) : null}
        <Text style={styles.time}>{formatNotificationTime(item.createdAt)}</Text>
      </View>
      <ChevronRight size={18} color={mobileColors.textMuted} />
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: mobileSpacing.cardPadding,
    paddingVertical: 12,
    borderRadius: mobileRadius.radiusCard,
    borderWidth: 1,
    borderColor: mobileColors.border,
    backgroundColor: mobileColors.surface,
  },
  rowUnread: {
    borderColor: mobileColors.accentSoft,
    backgroundColor: mobileColors.surfaceSoft,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: mobileColors.surfaceSoft,
  },
  iconWrapUnread: {
    backgroundColor: mobileColors.accentSoft,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    flex: 1,
    color: mobileColors.textPrimary,
    fontFamily: fonts.semiBold,
    fontSize: 14,
    lineHeight: 20,
  },
  titleUnread: {
    fontFamily: fonts.bold,
  },
  preview: {
    color: mobileColors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3,
  },
  time: {
    color: mobileColors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 11,
    marginTop: 5,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: mobileColors.accent,
  },
});
