import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Animated,
  StyleSheet,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { lightTheme } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { AppButton } from './AppButton';

/* ============================================================
 * Types
 * ============================================================ */
export type EmptyStateVariant = 'no-friends' | 'no-messages' | 'no-posts' | 'no-results' | 'offline' | 'error';

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
}

export interface EmptyStateProps {
  variant: EmptyStateVariant;
  title?: string;
  description?: string;
  action?: EmptyStateAction;
  style?: StyleProp<ViewStyle>;
}

/* ============================================================
 * Constants
 * ============================================================ */
type IconName = 'people-outline' | 'chatbubble-outline' | 'document-text-outline' | 'search-outline' | 'wifi-outline' | 'warning-outline';

const EMPTY_STATE_CONFIG: Record<EmptyStateVariant, {
  icon: IconName;
  defaultTitle: string;
  defaultDescription: string;
  defaultAction?: { label: string; actionType: 'navigate' | 'retry' | 'custom' };
}> = {
  'no-friends': {
    icon: 'people-outline',
    defaultTitle: 'Chưa có bạn bè',
    defaultDescription: 'Tìm và kết bạn với developer khác',
    defaultAction: { label: 'Khám phá', actionType: 'navigate' },
  },
  'no-messages': {
    icon: 'chatbubble-outline',
    defaultTitle: 'Chưa có tin nhắn',
    defaultDescription: 'Bắt đầu cuộc trò chuyện đầu tiên',
    defaultAction: { label: 'Nhắn tin', actionType: 'navigate' },
  },
  'no-posts': {
    icon: 'document-text-outline',
    defaultTitle: 'Chưa có bài viết',
    defaultDescription: 'Chia sẻ kiến thức với cộng đồng',
    defaultAction: { label: 'Viết bài', actionType: 'navigate' },
  },
  'no-results': {
    icon: 'search-outline',
    defaultTitle: 'Không tìm thấy kết quả',
    defaultDescription: 'Thử tìm với từ khóa khác',
  },
  'offline': {
    icon: 'wifi-outline',
    defaultTitle: 'Không có kết nối',
    defaultDescription: 'Kiểm tra kết nối internet',
    defaultAction: { label: 'Thử lại', actionType: 'retry' },
  },
  'error': {
    icon: 'warning-outline',
    defaultTitle: 'Đã xảy ra lỗi',
    defaultDescription: 'Vui lòng thử lại sau',
    defaultAction: { label: 'Thử lại', actionType: 'retry' },
  },
};

/* ============================================================
 * Navigation helpers
 * ============================================================ */
function handleNavigate(router: ReturnType<typeof useRouter>, variant: EmptyStateVariant) {
  switch (variant) {
    case 'no-friends':
      router.push('/(tabs)/friends');
      break;
    case 'no-messages':
      router.push('/(tabs)/chat');
      break;
    case 'no-posts':
      router.push('/(tabs)/community');
      break;
    default:
      break;
  }
}

/* ============================================================
 * Main Component
 * ============================================================ */
export function EmptyState({
  variant,
  title,
  description,
  action,
  style,
}: EmptyStateProps) {
  const router = useRouter();
  const theme = lightTheme;

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 320,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 320,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, translateY]);

  const config = EMPTY_STATE_CONFIG[variant];
  const displayTitle = title ?? config.defaultTitle;
  const displayDescription = description ?? config.defaultDescription;

  const defaultActionClick = () => {
    if (config.defaultAction?.actionType === 'navigate') {
      handleNavigate(router, variant);
    } else if (config.defaultAction?.actionType === 'retry') {
      // Retry is handled by the parent component passing a custom onClick
    }
  };

  const displayActionLabel = action?.label ?? config.defaultAction?.label;
  const displayActionClick = action?.onClick ?? defaultActionClick;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: fadeAnim,
          transform: [{ translateY }],
        },
        style,
      ]}
    >
      <View
        style={[
          styles.iconContainer,
          { backgroundColor: theme.bgHover },
        ]}
      >
        <Ionicons
          name={config.icon}
          size={32}
          color={theme.textSecondary}
          style={{ opacity: 0.8 }}
        />
      </View>

      <View style={styles.textContainer}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>
          {displayTitle}
        </Text>
        <Text style={[styles.description, { color: theme.textSecondary }]}>
          {displayDescription}
        </Text>
      </View>

      {displayActionLabel && (
        <View style={styles.actionContainer}>
          <AppButton label={displayActionLabel} onPress={displayActionClick} />
        </View>
      )}
    </Animated.View>
  );
}

/* ============================================================
 * Styles
 * ============================================================ */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: 17,
    fontFamily: fonts.bold,
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    fontFamily: fonts.regular,
    textAlign: 'center',
    maxWidth: 240,
    lineHeight: 20,
  },
  actionContainer: {
    marginTop: 8,
  },
});

export default EmptyState;
