import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { lightTheme } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { radius, spacing } from '../theme/spacing';
import { AnimatedPressable } from './AnimatedPressable';

interface ProfileMenuItemProps {
  title: string;
  icon: React.ReactNode;
  tone?: string;
  onPress: () => void;
  showBorder?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function ProfileMenuItem({
  title,
  icon,
  tone = lightTheme.accent,
  onPress,
  showBorder,
  style,
}: ProfileMenuItemProps) {
  return (
    <AnimatedPressable
      style={[styles.item, showBorder && styles.border, style]}
      onPress={onPress}
      activeScale={0.98}
    >
      <View style={[styles.iconWrap, { backgroundColor: `${tone}18` }]}>{icon}</View>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <ChevronRight size={18} color={lightTheme.textMuted} />
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  item: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
  },
  border: {
    borderBottomWidth: 1,
    borderBottomColor: lightTheme.borderLight,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: radius.small,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  title: {
    flex: 1,
    color: lightTheme.textPrimary,
    fontFamily: fonts.semiBold,
    fontSize: 14,
  },
});
