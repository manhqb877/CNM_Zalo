import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { colors } from '../theme/colors';

interface GlassPanelProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
}

export function GlassPanel({ children, style, intensity = 84 }: GlassPanelProps) {
  return (
    <View style={[styles.panel, style]}>
      <BlurView intensity={intensity} tint="light" style={StyleSheet.absoluteFillObject} />
      <View pointerEvents="none" style={styles.reflection} />
      <View pointerEvents="none" style={styles.refraction} />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    overflow: 'hidden',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: colors.glassPanel,
    shadowColor: colors.glassShadow,
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 12,
    },
    elevation: 10,
  },
  reflection: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.32)',
    opacity: 0.5,
  },
  refraction: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.7)',
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255,255,255,0.5)',
  },
  content: {
    position: 'relative',
    zIndex: 2,
  },
});
