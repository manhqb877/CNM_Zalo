import React from 'react';
import { View, TextInput, StyleSheet, TouchableOpacity, StyleProp, ViewStyle, Animated } from 'react-native';
import { Smile, Paperclip, Mic, Send } from 'lucide-react-native';
import { lightTheme } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { radius, sizes } from '../theme/spacing';
import { AnimatedPressable } from './AnimatedPressable';

interface ChatInputBarProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onAttach?: () => void;
  onEmoji?: () => void;
  onVoice?: () => void;
  style?: StyleProp<ViewStyle>;
  placeholder?: string;
}

export function ChatInputBar({
  value,
  onChangeText,
  onSend,
  onAttach,
  onEmoji,
  onVoice,
  style,
  placeholder = 'Nhắn tin...',
}: ChatInputBarProps) {
  const hasText = value.trim().length > 0;

  return (
    <View style={[styles.container, style]}>
      {onAttach && (
        <TouchableOpacity style={styles.iconBtn} onPress={onAttach} activeOpacity={0.7}>
          <Paperclip size={sizes.iconMedium} color={lightTheme.textSecondary} />
        </TouchableOpacity>
      )}
      
      <View style={styles.inputWrap}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={lightTheme.textTertiary}
          multiline
          maxLength={2000}
        />
        {onEmoji && (
          <TouchableOpacity style={styles.emojiBtn} onPress={onEmoji} activeOpacity={0.7}>
            <Smile size={sizes.iconMedium} color={lightTheme.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {hasText ? (
        <AnimatedPressable style={styles.sendBtn} onPress={onSend} activeScale={0.85}>
          <Send size={sizes.iconSmall} color={lightTheme.textOnAccent} />
        </AnimatedPressable>
      ) : onVoice ? (
        <TouchableOpacity style={styles.iconBtn} onPress={onVoice} activeOpacity={0.7}>
          <Mic size={sizes.iconMedium} color={lightTheme.textSecondary} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: lightTheme.surfaceCardStrong,
    borderTopWidth: 1,
    borderTopColor: lightTheme.border,
  },
  iconBtn: {
    padding: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: lightTheme.bgCode,
    borderRadius: radius.large,
    marginHorizontal: 8,
    minHeight: 44,
    maxHeight: 120,
  },
  input: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: lightTheme.textPrimary,
  },
  emojiBtn: {
    padding: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: lightTheme.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
    shadowColor: lightTheme.accent,
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
});
