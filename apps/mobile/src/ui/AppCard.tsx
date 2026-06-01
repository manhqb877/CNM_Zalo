import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { lightTheme } from '../theme/colors';
import { radius, shadows } from '../theme/spacing';
import { AnimatedPressable } from './AnimatedPressable';

interface AppCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  activeScale?: number;
}

export function AppCard({ children, style, onPress, activeScale = 0.98 }: AppCardProps) {
  if (onPress) {
    return (
      <AnimatedPressable 
        style={[styles.card, style]} 
        onPress={onPress} 
        activeScale={activeScale}
      >
        {children}
      </AnimatedPressable>
    );
  }

  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: lightTheme.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: lightTheme.border,
    padding: 16,
    ...shadows.soft,
  },
});
