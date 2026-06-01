import React from 'react';
import { StyleSheet, Text, ViewStyle, StyleProp, TextStyle, ActivityIndicator } from 'react-native';
import { AnimatedPressable } from './AnimatedPressable';
import { lightTheme } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { radius, sizes } from '../theme/spacing';

interface AppButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  leftIcon?: React.ReactNode;
}

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
  textStyle,
  leftIcon,
}: AppButtonProps) {
  let bgColor = lightTheme.accent;
  let textColor = '#FFFFFF';

  if (variant === 'secondary') {
    bgColor = lightTheme.bgHover;
    textColor = lightTheme.textPrimary;
  } else if (variant === 'danger') {
    bgColor = lightTheme.dangerSoft;
    textColor = lightTheme.danger;
  } else if (variant === 'ghost') {
    bgColor = 'transparent';
    textColor = lightTheme.accent;
  }

  if (disabled) {
    bgColor = lightTheme.border;
    textColor = lightTheme.textTertiary;
  }

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.container,
        { backgroundColor: bgColor },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <>
          {leftIcon}
          <Text style={[styles.label, { color: textColor, marginLeft: leftIcon ? 8 : 0 }, textStyle]}>
            {label}
          </Text>
        </>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    height: sizes.touchTarget,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  label: {
    fontFamily: fonts.semiBold,
    fontSize: 16,
  },
});
