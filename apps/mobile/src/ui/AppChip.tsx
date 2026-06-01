import React from 'react';
import { Text, StyleSheet, StyleProp, ViewStyle, View } from 'react-native';
import { lightTheme } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { radius } from '../theme/spacing';
import { AnimatedPressable } from './AnimatedPressable';

interface AppChipProps {
  label: string;
  active?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  icon?: React.ReactNode;
}

export function AppChip({ label, active, onPress, style, icon }: AppChipProps) {
  const containerStyle = [
    styles.chip,
    active && styles.chipActive,
    style
  ];

  const content = (
    <>
      {icon && <View style={styles.iconWrap}>{icon}</View>}
      <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
    </>
  );

  if (onPress) {
    return (
      <AnimatedPressable style={containerStyle} onPress={onPress} activeScale={0.95}>
        {content}
      </AnimatedPressable>
    );
  }

  return <View style={containerStyle}>{content}</View>;
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: lightTheme.surface,
    borderWidth: 1,
    borderColor: lightTheme.border,
  },
  chipActive: {
    backgroundColor: lightTheme.accentSoft,
    borderColor: lightTheme.accent,
  },
  label: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: lightTheme.textSecondary,
  },
  labelActive: {
    fontFamily: fonts.semiBold,
    color: lightTheme.accent,
  },
  iconWrap: {
    marginRight: 6,
  },
});
