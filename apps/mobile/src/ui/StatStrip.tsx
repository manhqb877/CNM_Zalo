import React from 'react';
import { ActivityIndicator, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { lightTheme } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { radius, shadows, spacing } from '../theme/spacing';

export interface StatStripItem {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  tone?: string;
  loading?: boolean;
}

interface StatStripProps {
  items: StatStripItem[];
  style?: StyleProp<ViewStyle>;
}

export function StatStrip({ items, style }: StatStripProps) {
  return (
    <View style={[styles.container, style]}>
      {items.map((item, index) => {
        const tone = item.tone ?? lightTheme.accent;
        return (
          <View key={`${item.label}-${index}`} style={styles.item}>
            <View style={[styles.iconWrap, { backgroundColor: `${tone}18` }]}>
              {item.icon}
            </View>
            {item.loading ? (
              <ActivityIndicator size="small" color={tone} style={styles.loader} />
            ) : (
              <Text style={styles.value} numberOfLines={1}>
                {item.value}
              </Text>
            )}
            <Text style={styles.label} numberOfLines={1}>
              {item.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: spacing.sm,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: lightTheme.border,
    backgroundColor: lightTheme.surface,
    padding: spacing.sm,
    ...shadows.soft,
  },
  item: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: radius.small,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  loader: {
    height: 24,
  },
  value: {
    color: lightTheme.textPrimary,
    fontFamily: fonts.bold,
    fontSize: 18,
  },
  label: {
    color: lightTheme.textSecondary,
    fontFamily: fonts.medium,
    fontSize: 11,
    marginTop: 2,
  },
});
