import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { lightTheme } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { radius, spacing } from '../theme/spacing';
import { AnimatedPressable } from './AnimatedPressable';
import { Avatar } from './Avatar';

interface UserListItemProps {
  name: string;
  subtitle?: string;
  avatarUrl?: string;
  action?: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function UserListItem({ name, subtitle, avatarUrl, action, onPress, style }: UserListItemProps) {
  const content = (
    <>
      <Avatar url={avatarUrl} name={name} size={44} />
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {action}
    </>
  );

  if (onPress) {
    return (
      <AnimatedPressable style={[styles.container, style]} onPress={onPress} activeScale={0.98}>
        {content}
      </AnimatedPressable>
    );
  }

  return <View style={[styles.container, style]}>{content}</View>;
}

const styles = StyleSheet.create({
  container: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.medium,
    backgroundColor: lightTheme.surface,
    borderWidth: 1,
    borderColor: lightTheme.border,
  },
  info: {
    flex: 1,
    minWidth: 0,
    marginLeft: spacing.md,
  },
  name: {
    color: lightTheme.textPrimary,
    fontFamily: fonts.semiBold,
    fontSize: 15,
  },
  subtitle: {
    color: lightTheme.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 12,
    marginTop: 2,
  },
});
