import React from 'react';
import { StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { lightTheme } from '../theme/colors';
import { shadows } from '../theme/spacing';
import { AnimatedPressable } from './AnimatedPressable';

interface AppIconButtonProps {
  icon: React.ReactNode;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  backgroundColor?: string;
  size?: number;
}

export function AppIconButton({ 
  icon, 
  onPress, 
  style, 
  backgroundColor = lightTheme.surface,
  size = 44 
}: AppIconButtonProps) {
  return (
    <AnimatedPressable
      style={[
        styles.button,
        { 
          backgroundColor,
          width: size,
          height: size,
          borderRadius: size / 2,
        },
        style
      ]}
      onPress={onPress}
      activeScale={0.92}
    >
      {icon}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: lightTheme.border,
    ...shadows.soft,
  },
});
