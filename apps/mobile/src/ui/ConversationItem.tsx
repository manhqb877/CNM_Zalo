import React from 'react';
import { Image, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { lightTheme } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { radius, spacing } from '../theme/spacing';
import { AnimatedPressable } from './AnimatedPressable';

interface ConversationItemProps {
  title: string;
  preview: string;
  time?: string;
  avatarUrl?: string;
  unreadCount?: number;
  isGroup?: boolean;
  online?: boolean;
  pinned?: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}

export function ConversationItem({
  title,
  preview,
  time,
  avatarUrl,
  unreadCount = 0,
  isGroup,
  online,
  pinned,
  onPress,
  style,
}: ConversationItemProps) {
  const hasUnread = unreadCount > 0;

  return (
    <AnimatedPressable style={[styles.container, hasUnread && styles.unreadContainer, style]} onPress={onPress} activeScale={0.98}>
      <View style={styles.avatar}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatarImage} resizeMode="cover" />
        ) : (
          <Text style={styles.avatarText}>{title.slice(0, 1).toUpperCase()}</Text>
        )}
        {online ? <View style={styles.onlineDot} /> : null}
        {isGroup ? (
          <View style={styles.groupBadge}>
            <Ionicons name="people" size={10} color={lightTheme.textOnAccent} />
          </View>
        ) : null}
      </View>
      <View style={styles.info}>
        <View style={styles.topRow}>
          <Text style={[styles.title, hasUnread && styles.titleUnread]} numberOfLines={1}>
            {title}
          </Text>
          {time ? (
            <Text style={[styles.time, hasUnread && styles.timeUnread]} numberOfLines={1}>
              {time}
            </Text>
          ) : null}
        </View>
        <View style={styles.bottomRow}>
          <Text style={[styles.preview, hasUnread && styles.previewUnread]} numberOfLines={1}>
            {preview}
          </Text>
          {pinned ? (
            <View style={styles.pinBadge}>
              <Ionicons name="pin" size={12} color={lightTheme.textMuted} />
            </View>
          ) : null}
          {hasUnread ? (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 80,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: lightTheme.border,
    backgroundColor: lightTheme.surface,
    marginBottom: spacing.sm,
  },
  unreadContainer: {
    borderColor: 'rgba(15, 157, 142, 0.28)',
    backgroundColor: '#FFFFFF',
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: lightTheme.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 18,
  },
  avatarText: {
    color: lightTheme.accent,
    fontFamily: fonts.bold,
    fontSize: 18,
  },
  onlineDot: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: lightTheme.surface,
    backgroundColor: lightTheme.success,
  },
  groupBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: lightTheme.surface,
    backgroundColor: lightTheme.info,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    minWidth: 0,
    marginLeft: spacing.md,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 5,
  },
  title: {
    flex: 1,
    color: lightTheme.textPrimary,
    fontFamily: fonts.semiBold,
    fontSize: 15,
  },
  titleUnread: {
    fontFamily: fonts.bold,
  },
  time: {
    color: lightTheme.textMuted,
    fontFamily: fonts.medium,
    fontSize: 11,
  },
  timeUnread: {
    color: lightTheme.accent,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  preview: {
    flex: 1,
    color: lightTheme.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 13,
  },
  previewUnread: {
    color: lightTheme.textPrimary,
    fontFamily: fonts.medium,
  },
  pinBadge: {
    marginLeft: spacing.sm,
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: lightTheme.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: radius.pill,
    backgroundColor: lightTheme.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  unreadText: {
    color: lightTheme.textOnAccent,
    fontFamily: fonts.bold,
    fontSize: 11,
  },
});
