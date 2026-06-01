import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Animated,
  Dimensions,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { MessagePreviewItem } from '../hooks/useMessagePreview';
import { colors } from '../theme/colors';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_WIDTH = SCREEN_WIDTH - 24;

interface PreviewCardProps {
  preview: MessagePreviewItem;
  onDismiss: () => void;
  onPauseDismiss: () => void;
  onResumeDismiss: () => void;
  onQuickReply: (content: string) => boolean;
  onNavigate: () => void;
  index: number;
}

function PreviewCard({
  preview,
  onDismiss,
  onPauseDismiss,
  onResumeDismiss,
  onQuickReply,
  onNavigate,
  index,
}: PreviewCardProps) {
  const [isReplying, setIsReplying] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sentFeedback, setSentFeedback] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const slideAnim = useRef(new Animated.Value(-80)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 65,
        friction: 11,
        delay: index * 50,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 250,
        delay: index * 50,
        useNativeDriver: true,
      }),
    ]).start();

    if (!isReplying && !sentFeedback) {
      Animated.timing(progressAnim, {
        toValue: 0,
        duration: 6000,
        useNativeDriver: false,
      }).start();
    }
  }, []);

  const handleDismissAnimated = useCallback(() => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -80,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => onDismiss());
  }, [onDismiss, slideAnim, opacityAnim]);

  const handleOpenReply = useCallback(() => {
    setIsReplying(true);
    onPauseDismiss();
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [onPauseDismiss]);

  const handleCloseReply = useCallback(() => {
    setIsReplying(false);
    setReplyText('');
    Keyboard.dismiss();
    onResumeDismiss();
  }, [onResumeDismiss]);

  const handleSendReply = useCallback(() => {
    if (!replyText.trim()) return;
    const success = onQuickReply(replyText.trim());
    if (success !== false) {
      setSentFeedback(true);
      setReplyText('');
      setIsReplying(false);
      Keyboard.dismiss();
      setTimeout(() => handleDismissAnimated(), 1200);
    }
  }, [replyText, onQuickReply, handleDismissAnimated]);

  const timeLabel = new Date(preview.timestamp).toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Animated.View
      style={[
        cardStyles.container,
        {
          transform: [{ translateY: slideAnim }],
          opacity: opacityAnim,
        },
      ]}
    >
      {/* Progress bar */}
      {!isReplying && !sentFeedback && (
        <View style={cardStyles.progressTrack}>
          <Animated.View style={[cardStyles.progressBar, { width: progressWidth }]} />
        </View>
      )}

      {/* Close button */}
      <TouchableOpacity
        style={cardStyles.closeBtn}
        onPress={handleDismissAnimated}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="close" size={14} color="#7cb3a1" />
      </TouchableOpacity>

      {/* Main content - tappable to navigate */}
      <TouchableOpacity
        style={cardStyles.content}
        activeOpacity={0.85}
        onPress={() => {
          if (!isReplying) onNavigate();
        }}
        onLongPress={onPauseDismiss}
      >
        {/* Avatar */}
        <View style={cardStyles.avatarWrapper}>
          <View style={cardStyles.avatar}>
            <Text style={cardStyles.avatarText}>{preview.avatarInitial}</Text>
          </View>
          {preview.isGroup && (
            <View style={cardStyles.groupBadge}>
              <Ionicons name="people" size={8} color="#30d7ab" />
            </View>
          )}
        </View>

        {/* Text */}
        <View style={cardStyles.textBlock}>
          <View style={cardStyles.nameRow}>
            <Text style={cardStyles.senderName} numberOfLines={1}>
              {preview.senderName}
            </Text>
            <Text style={cardStyles.time}>{timeLabel}</Text>
          </View>
          <Text style={cardStyles.body} numberOfLines={2}>
            {preview.body}
          </Text>
        </View>
      </TouchableOpacity>

      {/* Sent feedback */}
      {sentFeedback && (
        <View style={cardStyles.sentRow}>
          <Ionicons name="checkmark-circle" size={16} color="#30d7ab" />
          <Text style={cardStyles.sentText}>Đã gửi</Text>
        </View>
      )}

      {/* Actions / Reply */}
      {!sentFeedback && (
        <View style={cardStyles.actionsArea}>
          {isReplying ? (
            <View style={cardStyles.replyRow}>
              <TextInput
                ref={inputRef}
                style={cardStyles.replyInput}
                value={replyText}
                onChangeText={setReplyText}
                placeholder="Nhap tin nhan..."
                placeholderTextColor="#5e9a87"
                returnKeyType="send"
                onSubmitEditing={handleSendReply}
                blurOnSubmit={false}
              />
              <TouchableOpacity
                style={[cardStyles.sendBtn, !replyText.trim() && cardStyles.sendBtnDisabled]}
                onPress={handleSendReply}
                disabled={!replyText.trim()}
              >
                <Ionicons name="send" size={16} color="#04342a" />
              </TouchableOpacity>
              <TouchableOpacity style={cardStyles.cancelBtn} onPress={handleCloseReply}>
                <Ionicons name="close" size={16} color="#7cb3a1" />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={cardStyles.actionBtns}>
              <TouchableOpacity style={cardStyles.actionBtn} onPress={handleOpenReply}>
                <Ionicons name="return-down-back-outline" size={14} color="#88bca9" />
                <Text style={cardStyles.actionText}>Trả lời</Text>
              </TouchableOpacity>
              <View style={cardStyles.actionDivider} />
              <TouchableOpacity style={cardStyles.actionBtn} onPress={onNavigate}>
                <Ionicons name="open-outline" size={14} color="#88bca9" />
                <Text style={cardStyles.actionText}>Mo chat</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </Animated.View>
  );
}

const cardStyles = StyleSheet.create({
  container: {
    width: CARD_WIDTH,
    backgroundColor: 'rgba(10, 59, 47, 0.96)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(26, 92, 74, 0.6)',
    overflow: 'hidden',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  progressTrack: {
    height: 2,
    backgroundColor: 'rgba(48, 215, 171, 0.15)',
  },
  progressBar: {
    height: 2,
    backgroundColor: '#30d7ab',
  },
  closeBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 10,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(13, 58, 47, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 10,
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#1e6f59',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#b0e4d2',
    fontSize: 15,
    fontFamily: 'BeVietnamPro_700Bold',
  },
  groupBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#1a5c4a',
    borderWidth: 2,
    borderColor: '#0a3b2f',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBlock: {
    flex: 1,
    paddingRight: 20,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  senderName: {
    color: '#e4fff5',
    fontSize: 14,
    fontFamily: 'BeVietnamPro_600SemiBold',
    flex: 1,
    marginRight: 8,
  },
  time: {
    color: '#6db39e',
    fontSize: 11,
    fontFamily: 'BeVietnamPro_400Regular',
  },
  body: {
    color: '#a8d8c7',
    fontSize: 13,
    fontFamily: 'BeVietnamPro_400Regular',
    lineHeight: 18,
  },
  sentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(26, 92, 74, 0.4)',
  },
  sentText: {
    color: '#30d7ab',
    fontSize: 13,
    fontFamily: 'BeVietnamPro_500Medium',
  },
  actionsArea: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(26, 92, 74, 0.4)',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  actionBtns: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 6,
    borderRadius: 10,
  },
  actionText: {
    color: '#88bca9',
    fontSize: 12,
    fontFamily: 'BeVietnamPro_500Medium',
  },
  actionDivider: {
    width: 1,
    height: 18,
    backgroundColor: 'rgba(26, 92, 74, 0.5)',
  },
  replyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  replyInput: {
    flex: 1,
    height: 36,
    backgroundColor: 'rgba(11, 59, 47, 0.8)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(29, 91, 74, 0.8)',
    paddingHorizontal: 12,
    color: '#d7f6eb',
    fontSize: 13,
    fontFamily: 'BeVietnamPro_400Regular',
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#30d7ab',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
  cancelBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(13, 58, 47, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// ─── Main Overlay ───

interface MessagePreviewOverlayProps {
  previews: MessagePreviewItem[];
  onDismiss: (id: string) => void;
  onPauseDismiss: (id: string) => void;
  onResumeDismiss: (id: string) => void;
  onQuickReply: (conversationId: string, content: string) => boolean;
  onNavigate: (conversationId: string) => void;
  topOffset?: number;
}

export function MessagePreviewOverlay({
  previews,
  onDismiss,
  onPauseDismiss,
  onResumeDismiss,
  onQuickReply,
  onNavigate,
  topOffset = 0,
}: MessagePreviewOverlayProps) {
  if (previews.length === 0) return null;

  return (
    <View style={[overlayStyles.container, { top: topOffset }]} pointerEvents="box-none">
      {previews.map((preview, index) => (
        <PreviewCard
          key={preview.id}
          preview={preview}
          index={index}
          onDismiss={() => onDismiss(preview.id)}
          onPauseDismiss={() => onPauseDismiss(preview.id)}
          onResumeDismiss={() => onResumeDismiss(preview.id)}
          onQuickReply={(content) => onQuickReply(preview.conversationId, content)}
          onNavigate={() => {
            onNavigate(preview.conversationId);
            onDismiss(preview.id);
          }}
        />
      ))}
    </View>
  );
}

const overlayStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 12,
    right: 12,
    zIndex: 50,
    alignItems: 'center',
  },
});
