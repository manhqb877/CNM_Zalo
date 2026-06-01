import React from 'react';
import { ScrollView, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { lightTheme } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { radius, spacing } from '../theme/spacing';
import { AnimatedPressable } from './AnimatedPressable';

export interface SegmentTabItem<T extends string> {
  key: T;
  label: string;
}

interface SegmentTabsProps<T extends string> {
  items: SegmentTabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
  scrollable?: boolean;
}

export function SegmentTabs<T extends string>({
  items,
  value,
  onChange,
  style,
  scrollable = false,
}: SegmentTabsProps<T>) {
  const content = (
    <View style={[styles.row, style]}>
      {items.map((item) => {
        const active = item.key === value;
        return (
          <AnimatedPressable
            key={item.key}
            style={[styles.tab, active && styles.tabActive]}
            onPress={() => onChange(item.key)}
            activeScale={0.96}
          >
            <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
              {item.label}
            </Text>
          </AnimatedPressable>
        );
      })}
    </View>
  );

  if (!scrollable) return content;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
      {content}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: spacing.horizontal,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  tab: {
    minHeight: 38,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: lightTheme.border,
    backgroundColor: lightTheme.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: {
    borderColor: lightTheme.accent,
    backgroundColor: lightTheme.accentSoft,
  },
  label: {
    color: lightTheme.textSecondary,
    fontFamily: fonts.medium,
    fontSize: 13,
  },
  labelActive: {
    color: lightTheme.accent,
    fontFamily: fonts.semiBold,
  },
});
