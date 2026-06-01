import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { useAppPreferencesStore } from '../store/useAppPreferencesStore';
import { getAppTheme } from '../theme/get-app-theme';

/* ============================================================
 * Types
 * ============================================================ */
export type SkeletonVariant = 'text' | 'avatar' | 'card' | 'chatBubble' | 'postCard';
export type SkeletonRounded = 'sm' | 'md' | 'lg' | 'full';

export interface ZyncSkeletonProps {
  variant?: SkeletonVariant;
  width?: ViewStyle['width'];
  height?: number;
  rounded?: SkeletonRounded;
  lines?: number;
  animated?: boolean;
  style?: StyleProp<ViewStyle>;
  className?: never;
}

/* ============================================================
 * Constants
 * ============================================================ */
const ROUNDED_MAP: Record<SkeletonRounded, number> = {
  sm: 4,
  md: 8,
  lg: 12,
  full: 9999,
};

const VARIANT_DEFAULTS: Record<SkeletonVariant, { width: ViewStyle['width']; height: number; borderRadius: number }> = {
  text: { width: '100%', height: 14, borderRadius: 4 },
  avatar: { width: 48, height: 48, borderRadius: 9999 },
  card: { width: '100%', height: 120, borderRadius: 16 },
  chatBubble: { width: '60%', height: 44, borderRadius: 18 },
  postCard: { width: '100%', height: 200, borderRadius: 16 },
};

/* ============================================================
 * Single Skeleton Element
 * ============================================================ */
interface SkeletonElementProps {
  width?: ViewStyle['width'];
  height?: number;
  borderRadius?: number;
  animated?: boolean;
  skeletonColor: string;
  style?: StyleProp<ViewStyle>;
}

function SkeletonElement({
  width = '100%',
  height = 14,
  borderRadius = 4,
  animated = true,
  skeletonColor,
  style,
}: SkeletonElementProps) {
  const animatedOpacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    if (!animated) {
      animatedOpacity.setValue(0.4);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(animatedOpacity, {
          toValue: 0.85,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(animatedOpacity, {
          toValue: 0.5,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();
    return () => animation.stop();
  }, [animated, animatedOpacity]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: skeletonColor,
        },
        animated && { opacity: animatedOpacity },
        !animated && { opacity: 0.4 },
        style,
      ]}
    />
  );
}

/* ============================================================
 * Main Component
 * ============================================================ */
export function ZyncSkeleton({
  variant = 'text',
  width,
  height,
  rounded,
  lines,
  animated = true,
  style,
}: ZyncSkeletonProps) {
  const mode = useAppPreferencesStore((s) => s.theme);
  const theme = getAppTheme(mode);
  const skeletonColor = theme.bgHover;

  /* Multi-line text */
  if (variant === 'text' && lines && lines > 1) {
    return (
      <View style={style}>
        {Array.from({ length: lines }).map((_, i) => (
          <View key={i} style={i > 0 ? { marginTop: 8 } : undefined}>
            <SkeletonElement
              width={i === lines - 1 ? '75%' : '100%'}
              height={14}
              borderRadius={4}
              animated={animated}
              skeletonColor={skeletonColor}
            />
          </View>
        ))}
      </View>
    );
  }

  /* Single element */
  const defaults = VARIANT_DEFAULTS[variant];
  const resolvedWidth = width ?? defaults.width;
  const resolvedHeight = height ?? defaults.height;
  const resolvedRadius = rounded !== undefined ? ROUNDED_MAP[rounded] : defaults.borderRadius;

  return (
    <SkeletonElement
      width={resolvedWidth}
      height={resolvedHeight}
      borderRadius={resolvedRadius}
      animated={animated}
      skeletonColor={skeletonColor}
      style={style}
    />
  );
}

/* ============================================================
 * Preset Compositions
 * ============================================================ */

interface SkeletonCardPresetProps {
  lines?: number;
  showAvatar?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function SkeletonCardPreset({ lines = 3, showAvatar = true, style }: SkeletonCardPresetProps) {
  const mode = useAppPreferencesStore((s) => s.theme);
  const theme = getAppTheme(mode);
  const skeletonColor = theme.bgHover;

  return (
    <View style={[{ gap: 12 }, style]}>
      {showAvatar && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <SkeletonElement width={44} height={44} borderRadius={9999} animated skeletonColor={skeletonColor} />
          <View style={{ gap: 6, flex: 1 }}>
            <SkeletonElement width={120} height={12} borderRadius={4} animated skeletonColor={skeletonColor} />
            <SkeletonElement width={80} height={10} borderRadius={4} animated skeletonColor={skeletonColor} />
          </View>
        </View>
      )}
      <View style={{ gap: 6 }}>
        {Array.from({ length: lines }).map((_, i) => (
          <SkeletonElement
            key={i}
            width={i === lines - 1 ? '60%' : '100%'}
            height={10}
            borderRadius={4}
            animated={false}
            skeletonColor={skeletonColor}
          />
        ))}
      </View>
    </View>
  );
}

interface SkeletonAvatarPresetProps {
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export function SkeletonAvatarPreset({ size = 44, style }: SkeletonAvatarPresetProps) {
  const mode = useAppPreferencesStore((s) => s.theme);
  const theme = getAppTheme(mode);

  return (
    <SkeletonElement
      width={size}
      height={size}
      borderRadius={9999}
      animated
      skeletonColor={theme.bgHover}
      style={style}
    />
  );
}

interface SkeletonChatBubblePresetProps {
  senderIsSelf?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function SkeletonChatBubblePreset({ senderIsSelf = false, style }: SkeletonChatBubblePresetProps) {
  const mode = useAppPreferencesStore((s) => s.theme);
  const theme = getAppTheme(mode);
  const skeletonColor = theme.bgHover;

  return (
    <View
      style={[
        { flexDirection: senderIsSelf ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 8 },
        style,
      ]}
    >
      <SkeletonElement width={32} height={32} borderRadius={9999} animated skeletonColor={skeletonColor} />
      <View style={{ gap: 6 }}>
        <SkeletonElement width={140} height={36} borderRadius={18} animated skeletonColor={skeletonColor} />
        <SkeletonElement width={100} height={36} borderRadius={18} animated skeletonColor={skeletonColor} />
      </View>
    </View>
  );
}

interface SkeletonPostCardPresetProps {
  style?: StyleProp<ViewStyle>;
}

export function SkeletonPostCardPreset({ style }: SkeletonPostCardPresetProps) {
  const mode = useAppPreferencesStore((s) => s.theme);
  const theme = getAppTheme(mode);
  const skeletonColor = theme.bgHover;

  return (
    <View
      style={[
        {
          borderRadius: 20,
          padding: 16,
          borderWidth: 1,
          borderColor: theme.border,
          backgroundColor: theme.surfaceCard,
          gap: 14,
        },
        style,
      ]}
    >
      {/* Author row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <SkeletonElement width={44} height={44} borderRadius={9999} animated skeletonColor={skeletonColor} />
        <View style={{ gap: 5 }}>
          <SkeletonElement width={120} height={12} borderRadius={4} animated skeletonColor={skeletonColor} />
          <SkeletonElement width={80} height={10} borderRadius={4} animated skeletonColor={skeletonColor} />
        </View>
      </View>
      {/* Content lines */}
      <View style={{ gap: 6 }}>
        <SkeletonElement width="100%" height={14} borderRadius={4} animated skeletonColor={skeletonColor} />
        <SkeletonElement width="85%" height={14} borderRadius={4} animated skeletonColor={skeletonColor} />
        <SkeletonElement width="60%" height={14} borderRadius={4} animated skeletonColor={skeletonColor} />
      </View>
      {/* Action row */}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {[60, 60, 60].map((w, i) => (
          <SkeletonElement key={i} width={w} height={28} borderRadius={9999} animated skeletonColor={skeletonColor} />
        ))}
      </View>
    </View>
  );
}
