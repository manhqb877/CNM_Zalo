import React from 'react';
import { View, Text, StyleSheet, Image, StyleProp, ViewStyle } from 'react-native';
import { lightTheme } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { radius } from '../theme/spacing';

interface MessageBubbleProps {
  type: 'text' | 'image' | 'video' | 'audio' | 'sticker' | 'system-recall' | `file/${string}`;
  content?: string;
  mediaUrl?: string;
  isMe: boolean;
  time: string;
  status?: 'sent' | 'delivered' | 'read';
  style?: StyleProp<ViewStyle>;
}

export function MessageBubble({
  type,
  content,
  mediaUrl,
  isMe,
  time,
  status,
  style,
}: MessageBubbleProps) {
  const isSystem = type === 'system-recall';

  if (isSystem) {
    return (
      <View style={styles.systemContainer}>
        <Text style={styles.systemText}>{content}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, isMe ? styles.alignRight : styles.alignLeft, style]}>
      <View
        style={[
          styles.bubble,
          isMe ? styles.bubbleMe : styles.bubbleThem,
          type === 'image' || type === 'sticker' ? styles.bubbleMedia : null,
        ]}
      >
        {type === 'image' && mediaUrl ? (
          <Image source={{ uri: mediaUrl }} style={styles.image} resizeMode="cover" />
        ) : type === 'sticker' && mediaUrl ? (
          <Image source={{ uri: mediaUrl }} style={styles.sticker} resizeMode="contain" />
        ) : (
          <Text style={[styles.text, isMe ? styles.textMe : styles.textThem]}>
            {content}
          </Text>
        )}
        <View style={styles.footer}>
          <Text style={[styles.time, isMe ? styles.timeMe : styles.timeThem]}>
            {time}
          </Text>
          {isMe && status && (
            <Text style={styles.status}>
              {status === 'read' ? '✓✓' : status === 'delivered' ? '✓✓' : '✓'}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
    paddingHorizontal: 16,
    flexDirection: 'row',
  },
  alignLeft: {
    justifyContent: 'flex-start',
  },
  alignRight: {
    justifyContent: 'flex-end',
  },
  bubble: {
    maxWidth: '75%',
    padding: 12,
    borderRadius: radius.large,
  },
  bubbleMe: {
    backgroundColor: lightTheme.accent,
    borderBottomRightRadius: radius.small,
  },
  bubbleThem: {
    backgroundColor: lightTheme.surfaceCard,
    borderBottomLeftRadius: radius.small,
    borderWidth: 1,
    borderColor: lightTheme.border,
  },
  bubbleMedia: {
    padding: 4,
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  text: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 22,
  },
  textMe: {
    color: lightTheme.textOnAccent,
  },
  textThem: {
    color: lightTheme.textPrimary,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
    gap: 4,
  },
  time: {
    fontFamily: fonts.medium,
    fontSize: 11,
  },
  timeMe: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  timeThem: {
    color: lightTheme.textTertiary,
  },
  status: {
    fontFamily: fonts.medium,
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  systemContainer: {
    alignItems: 'center',
    marginVertical: 8,
  },
  systemText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: lightTheme.textTertiary,
    backgroundColor: lightTheme.bgSecondary,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  image: {
    width: 200,
    height: 200,
    borderRadius: radius.medium,
  },
  sticker: {
    width: 120,
    height: 120,
  },
});
