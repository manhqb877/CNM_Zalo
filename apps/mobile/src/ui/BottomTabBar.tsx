import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Globe, Home, MessageCircle, UserRound, Users } from 'lucide-react-native';
import { lightTheme } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { radius, shadows } from '../theme/spacing';

const ICONS: Record<string, React.ComponentType<{ size: number; color: string; strokeWidth?: number }>> = {
  home: Home,
  chat: MessageCircle,
  friends: Users,
  community: Globe,
  profile: UserRound,
};

export function BottomTabBar({ state, descriptors, navigation }: any) {
  const insets = useSafeAreaInsets();
  const visibleRoutes = state.routes.filter((route: any) => descriptors[route.key]?.options?.href !== null);

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <BlurView intensity={86} tint="light" style={styles.bar}>
        {visibleRoutes.map((route: any) => {
          const descriptor = descriptors[route.key];
          const options = descriptor.options ?? {};
          const isFocused = state.index === state.routes.indexOf(route);
          const label = options.title ?? route.name;
          const color = isFocused ? lightTheme.accent : lightTheme.textMuted;
          const Icon = ICONS[route.name] ?? Home;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              onPress={onPress}
              style={styles.item}
            >
              <View style={[styles.iconWrap, isFocused && styles.iconWrapActive]}>
                <Icon size={20} color={color} strokeWidth={isFocused ? 2.6 : 2.2} />
              </View>
              <Text style={[styles.label, isFocused && styles.labelActive]} numberOfLines={1}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 0,
  },
  bar: {
    minHeight: 66,
    overflow: 'hidden',
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: 'rgba(15, 157, 142, 0.16)',
    backgroundColor: 'rgba(255,255,255,0.82)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 7,
    ...shadows.floating,
  },
  item: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  iconWrap: {
    width: 36,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: {
    backgroundColor: lightTheme.accentSoft,
  },
  label: {
    color: lightTheme.textMuted,
    fontFamily: fonts.medium,
    fontSize: 10,
  },
  labelActive: {
    color: lightTheme.accent,
    fontFamily: fonts.semiBold,
  },
});
