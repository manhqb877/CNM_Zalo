import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { lightTheme } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { radius, shadows, spacing } from '../theme/spacing';
import { AnimatedPressable } from './AnimatedPressable';

interface ActionTileProps {
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
  tone?: string;
  style?: StyleProp<ViewStyle>;
}

export function ActionTile({ label, icon, onPress, tone = lightTheme.accent, style }: ActionTileProps) {
  return (
    <AnimatedPressable style={[styles.tile, style]} onPress={onPress} activeScale={0.96}>
      <View style={[styles.iconWrap, { backgroundColor: `${tone}18` }]}>{icon}</View>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minWidth: 0,
    minHeight: 78,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: lightTheme.border,
    backgroundColor: lightTheme.surface,
    padding: spacing.md,
    justifyContent: 'space-between',
    ...shadows.soft,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: radius.small,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: lightTheme.textPrimary,
    fontFamily: fonts.semiBold,
    fontSize: 12,
  },
});
