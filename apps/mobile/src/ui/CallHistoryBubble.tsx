import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Phone, PhoneMissed, Video } from 'lucide-react-native';
import { lightTheme } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { radius } from '../theme/spacing';

interface CallHistoryBubbleProps {
  type: 'audio' | 'video';
  status: 'missed' | 'completed' | 'ongoing' | 'rejected';
  duration?: string;
  time: string;
  isMe: boolean;
  onCallBack?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function CallHistoryBubble({
  type,
  status,
  duration,
  time,
  isMe,
  style,
}: CallHistoryBubbleProps) {
  const isMissed = status === 'missed' || status === 'rejected';

  let title = '';
  if (isMissed) {
    title = type === 'video' ? 'Video · Bị nhỡ' : 'Audio · Từ chối';
  } else if (status === 'ongoing') {
    title = type === 'video' ? 'Video · Đang gọi' : 'Audio · Đang gọi';
  } else {
    title = type === 'video' ? 'Video · Kết thúc' : 'Audio · Kết thúc';
  }

  const Icon = isMissed ? PhoneMissed : type === 'video' ? Video : Phone;
  const iconColor = isMissed ? lightTheme.danger : lightTheme.textSecondary;

  return (
    <View style={[styles.container, style]}>
      <View style={styles.pill}>
        <Icon size={14} color={iconColor} />
        <Text style={[styles.title, isMissed && styles.titleMissed]}>{title}</Text>
        {duration ? (
          <Text style={styles.duration}>
            · {duration}
          </Text>
        ) : null}
        <Text style={styles.time}>· {time}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
    alignItems: 'center',
    width: '100%',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 157, 142, 0.08)', // Very light accent
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    gap: 6,
  },
  title: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: lightTheme.textSecondary,
  },
  titleMissed: {
    color: lightTheme.danger,
  },
  duration: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: lightTheme.textTertiary,
  },
  time: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: lightTheme.textTertiary,
  },
});
