import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Keyboard,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  StatusBar,
  ActivityIndicator,
  Alert,
  Animated,
  Linking,
  Image,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useAuthStore } from '../src/store/useAuthStore';
import { socketService } from '../src/services/socket';
import api from '../src/services/api';
import { colors, lightTheme } from '../src/theme/colors';
import { fonts } from '../src/theme/fonts';
import { radius, shadows } from '../src/theme/spacing';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useMessagePreview } from '../src/hooks/useMessagePreview';
import { MessagePreviewOverlay } from '../src/components/MessagePreviewOverlay';
import { StickerPicker } from '../src/components/StickerPicker';
import { ForwardModal } from '../src/components/ForwardModal';
import {
  SkeletonChatBubblePreset,
  SkeletonAvatarPreset,
} from '../src/ui/ZyncSkeleton';
import { CallHistoryBubble } from '../src/ui/CallHistoryBubble';
import { MessagePreviewCard, parsePostPreview } from '../src/ui/MessagePreviewCard';

interface MessageReadParticipant {
  userId: string;
  displayName: string;
  avatarUrl?: string;
}

interface MessageReadParticipantWithTime extends MessageReadParticipant {
  readAt: string;
}

interface Message {
  _id: string;
  conversationId?: string;
  senderId: string | { _id: string; displayName?: string };
  content?: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'sticker' | 'system-recall' | `file/${string}` | 'call' | 'call_history' | 'system';
  mediaUrl?: string;
  status?: 'sent' | 'delivered' | 'read';
  createdAt: string;
  idempotencyKey?: string;
  replyTo?: {
    messageRef: string;
    messageId?: string;
    senderId?: string;
    senderDisplayName?: string;
    contentPreview?: string;
    type?: string;
    isDeleted?: boolean;
  };
  reactionSummary?: {
    totalCount: number;
    emojiCounts: Record<string, number>;
  };
  reactionUserState?: {
    lastEmoji: string | null;
    totalCount: number;
    emojiCounts: Record<string, number>;
  };
  readBy?: MessageReadParticipantWithTime[];
  readByPreview?: MessageReadParticipantWithTime[];
  sentTo?: MessageReadParticipant[];
}

interface SendMessageOptions {
  idempotencyKey?: string;
  deferEmit?: boolean;
  replyTo?: Message['replyTo'];
}

interface PendingMediaDraft {
  asset: ImagePicker.ImagePickerAsset;
  localUri: string;
  messageType: 'image' | 'video';
  uploadType: 'image' | 'video';
}

interface PendingMediaSend {
  idempotencyKey: string;
  content: string;
  messageType: 'image' | 'video';
}

interface PendingJumpTarget {
  messageRef: string;
  attempts: number;
  stagnantRounds: number;
  lastMessageCount: number;
}

interface ConversationMeta {
  _id: string;
  name?: string;
  avatarUrl?: string;
  type?: 'group' | 'private' | 'direct';
  createdBy?: string;
  adminIds?: string[];
  memberApprovalEnabled?: boolean;
  users?: Array<{ _id: string; displayName: string; avatarUrl?: string }>;
}

interface GroupUpdatedEvent {
  groupId?: string;
  type?: 'created' | 'name_changed' | 'avatar_changed' | 'member_added' | 'member_removed' | 'role_changed' | 'member_approval_changed' | 'disbanded';
  data?: {
    userId?: string;
    role?: 'admin' | 'member';
    createdBy?: string;
    adminIds?: string[];
    name?: string;
    avatarUrl?: string;
  };
}

interface ReactionDetailsResponse {
  success: boolean;
  messageId: string;
  conversationId: string;
  tabs: Array<{ emoji: string; count: number }>;
  rows: Array<{
    userId: string;
    displayName: string;
    avatarUrl?: string;
    lastEmoji: string | null;
    totalCount: number;
    emojiCounts: Record<string, number>;
  }>;
}

interface AppDialogState {
  visible: boolean;
  mode: 'alert' | 'confirm';
  title: string;
  message: string;
  tone: 'info' | 'error';
  onClose?: () => void;
  onConfirm?: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
}

const REACTION_EMOJIS = ['👍', '❤️', '🤣', '😳', '😭', '😡'] as const;
const QUICK_EMOJIS = ['😀', '😂', '😍', '🥰', '😭', '😎', '🤔', '👍', '❤️', '🔥', '🎉', '🙏'] as const;

type ComposerPickerTab = 'emoji' | 'sticker';

const FILE_PREFIX = 'file/';

function isFileType(type: string): type is `file/${string}` {
  return type.startsWith(FILE_PREFIX);
}

function normalizeMessage(raw: unknown): Message | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const data = raw as Record<string, unknown>;
  const rawId = data._id ?? data.messageId ?? data.idempotencyKey;
  if (!rawId) {
    return null;
  }

  const sender = data.senderId;
  let normalizedSender: Message['senderId'];

  if (typeof sender === 'string') {
    normalizedSender = sender;
  } else if (sender && typeof sender === 'object' && '_id' in sender) {
    const senderObject = sender as Record<string, unknown>;
    normalizedSender = {
      _id: String(senderObject._id),
      displayName: typeof senderObject.displayName === 'string' ? senderObject.displayName : undefined,
    };
  } else {
    return null;
  }

  const rawType = typeof data.type === 'string' ? data.type : 'text';
  const normalizedType = rawType === 'file'
    ? `file/${typeof data.content === 'string' && data.content.trim() ? data.content.trim() : 'attachment'}`
    : rawType;

  const rawStatus = data.status;
  const status: Message['status'] =
    rawStatus === 'sent' || rawStatus === 'delivered' || rawStatus === 'read'
      ? rawStatus
      : undefined;

  const rawReactionSummary = data.reactionSummary;
  const normalizedReactionSummary =
    rawReactionSummary && typeof rawReactionSummary === 'object'
      ? {
        totalCount:
          typeof (rawReactionSummary as Record<string, unknown>).totalCount === 'number'
            ? Math.max(0, (rawReactionSummary as Record<string, unknown>).totalCount as number)
            : 0,
        emojiCounts:
          typeof (rawReactionSummary as Record<string, unknown>).emojiCounts === 'object'
          && (rawReactionSummary as Record<string, unknown>).emojiCounts !== null
            ? Object.fromEntries(
              Object.entries((rawReactionSummary as Record<string, unknown>).emojiCounts as Record<string, unknown>)
                .filter(([_, value]) => typeof value === 'number' && value > 0),
            ) as Record<string, number>
            : {},
      }
      : undefined;

  const rawReactionUserState = data.reactionUserState;
  const normalizedReactionUserState =
    rawReactionUserState && typeof rawReactionUserState === 'object'
      ? {
        lastEmoji:
          typeof (rawReactionUserState as Record<string, unknown>).lastEmoji === 'string'
            ? ((rawReactionUserState as Record<string, unknown>).lastEmoji as string)
            : null,
        totalCount:
          typeof (rawReactionUserState as Record<string, unknown>).totalCount === 'number'
            ? Math.max(0, (rawReactionUserState as Record<string, unknown>).totalCount as number)
            : 0,
        emojiCounts:
          typeof (rawReactionUserState as Record<string, unknown>).emojiCounts === 'object'
          && (rawReactionUserState as Record<string, unknown>).emojiCounts !== null
            ? Object.fromEntries(
              Object.entries((rawReactionUserState as Record<string, unknown>).emojiCounts as Record<string, unknown>)
                .filter(([_, value]) => typeof value === 'number' && value > 0),
            ) as Record<string, number>
            : {},
      }
      : undefined;

  const rawReplyTo = data.replyTo;
  const normalizedReplyTo =
    rawReplyTo && typeof rawReplyTo === 'object'
      ? {
        messageRef: String((rawReplyTo as Record<string, unknown>).messageRef || ''),
        messageId:
          typeof (rawReplyTo as Record<string, unknown>).messageId === 'string'
            ? (rawReplyTo as Record<string, unknown>).messageId as string
            : undefined,
        senderId:
          typeof (rawReplyTo as Record<string, unknown>).senderId === 'string'
            ? (rawReplyTo as Record<string, unknown>).senderId as string
            : undefined,
        senderDisplayName:
          typeof (rawReplyTo as Record<string, unknown>).senderDisplayName === 'string'
            ? (rawReplyTo as Record<string, unknown>).senderDisplayName as string
            : undefined,
        contentPreview:
          typeof (rawReplyTo as Record<string, unknown>).contentPreview === 'string'
            ? (rawReplyTo as Record<string, unknown>).contentPreview as string
            : undefined,
        type:
          typeof (rawReplyTo as Record<string, unknown>).type === 'string'
            ? (rawReplyTo as Record<string, unknown>).type as string
            : undefined,
        isDeleted:
          typeof (rawReplyTo as Record<string, unknown>).isDeleted === 'boolean'
            ? (rawReplyTo as Record<string, unknown>).isDeleted as boolean
            : undefined,
      }
      : undefined;

  const normalizeReadParticipant = (value: unknown): MessageReadParticipant | null => {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const item = value as Record<string, unknown>;
    const rawUserId = item.userId ?? item._id;
    if (!rawUserId) {
      return null;
    }

    return {
      userId: String(rawUserId),
      displayName: typeof item.displayName === 'string' && item.displayName.trim().length > 0
        ? item.displayName
        : 'Người dùng',
      avatarUrl: typeof item.avatarUrl === 'string' ? item.avatarUrl : undefined,
    };
  };

  const normalizeReadParticipantWithTime = (value: unknown): MessageReadParticipantWithTime | null => {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const base = normalizeReadParticipant(value);
    if (!base) {
      return null;
    }

    const item = value as Record<string, unknown>;
    const readAt = typeof item.readAt === 'string'
      ? item.readAt
      : new Date().toISOString();

    return {
      ...base,
      readAt,
    };
  };

  const normalizeReadBy = (rawList: unknown): MessageReadParticipantWithTime[] | undefined => {
    if (!Array.isArray(rawList)) {
      return undefined;
    }

    return rawList
      .map((item) => normalizeReadParticipantWithTime(item))
      .filter((item): item is MessageReadParticipantWithTime => Boolean(item));
  };

  const normalizeSentTo = (rawList: unknown): MessageReadParticipant[] | undefined => {
    if (!Array.isArray(rawList)) {
      return undefined;
    }

    return rawList
      .map((item) => normalizeReadParticipant(item))
      .filter((item): item is MessageReadParticipant => Boolean(item));
  };

  const normalizedReadBy = normalizeReadBy(data.readBy);
  const normalizedReadByPreview = normalizeReadBy(data.readByPreview);
  const normalizedSentTo = normalizeSentTo(data.sentTo);

  return {
    _id: String(rawId),
    conversationId: typeof data.conversationId === 'string' ? data.conversationId : undefined,
    senderId: normalizedSender,
    content: typeof data.content === 'string' ? data.content : '',
    type: normalizedType as Message['type'],
    mediaUrl: typeof data.mediaUrl === 'string' ? data.mediaUrl : undefined,
    status,
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString(),
    idempotencyKey: typeof data.idempotencyKey === 'string' ? data.idempotencyKey : undefined,
    replyTo: normalizedReplyTo && normalizedReplyTo.messageRef ? normalizedReplyTo : undefined,
    reactionSummary: normalizedReactionSummary,
    reactionUserState: normalizedReactionUserState,
    readBy: normalizedReadBy,
    readByPreview: normalizedReadByPreview,
    sentTo: normalizedSentTo,
  };
}

function dedupeMessages(messages: Message[]): Message[] {
  const merged: Message[] = [];

  const areSameMessage = (a: Message, b: Message) => {
    const aId = String(a._id || (a as any).messageId || '');
    const bId = String(b._id || (b as any).messageId || '');
    const aKey = String(a.idempotencyKey || '');
    const bKey = String(b.idempotencyKey || '');
    const aRef = String((a as any).messageRef || '');
    const bRef = String((b as any).messageRef || '');

    return (
      (aId && bId && aId === bId)
      || (aKey && bKey && aKey === bKey)
      || (aId && bKey && aId === bKey)
      || (aKey && bId && aKey === bId)
      || (aRef && bRef && aRef === bRef)
      || (aId && bRef && aId === bRef)
      || (aRef && bId && aRef === bId)
    );
  };

  const mergeTwoMessages = (current: Message, incoming: Message): Message => {
    const currentIsRecalled = current.type === 'system-recall';
    const incomingIsRecalled = incoming.type === 'system-recall';

    if (currentIsRecalled && !incomingIsRecalled) {
      return {
        ...incoming,
        ...current,
        _id: current._id && current._id !== current.idempotencyKey
          ? current._id
          : (incoming._id || current._id),
        idempotencyKey: current.idempotencyKey || incoming.idempotencyKey,
        type: 'system-recall',
        content: current.content || '[Tin nhắn đã được thu hồi]',
        mediaUrl: undefined,
      };
    }

    if (!currentIsRecalled && incomingIsRecalled) {
      return {
        ...current,
        ...incoming,
        idempotencyKey: current.idempotencyKey || incoming.idempotencyKey,
        type: 'system-recall',
        content: incoming.content || '[Tin nhắn đã được thu hồi]',
        mediaUrl: undefined,
      };
    }

    return {
      ...current,
      ...incoming,
      idempotencyKey: current.idempotencyKey || incoming.idempotencyKey,
    };
  };

  for (const message of messages) {
    const index = merged.findIndex((item) => areSameMessage(item, message));

    if (index === -1) {
      merged.push(message);
      continue;
    }

    merged[index] = mergeTwoMessages(merged[index], message);
  }

  return merged.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

function getSenderId(msg: Message): string {
  if (msg.senderId && typeof msg.senderId === 'object' && '_id' in msg.senderId) {
    return String(msg.senderId._id);
  }
  return String(msg.senderId || '');
}

function getSenderName(msg: Message, groupMembers: Array<{ _id: string; displayName: string; avatarUrl?: string }> = []): string {
  if (typeof msg.senderId === 'object' && msg.senderId !== null && msg.senderId.displayName) {
    return msg.senderId.displayName;
  }
  const id = typeof msg.senderId === 'string' ? msg.senderId : msg.senderId?._id;
  const member = groupMembers.find(m => m._id === id);
  if (member?.displayName) return member.displayName;
  return 'Người dùng';
}

function getSenderAvatarUrl(msg: Message, groupMembers: Array<{ _id: string; displayName: string; avatarUrl?: string }> = []): string | undefined {
  if (typeof msg.senderId === 'object' && msg.senderId !== null && 'avatarUrl' in msg.senderId && msg.senderId.avatarUrl) {
    return msg.senderId.avatarUrl as string;
  }
  const id = typeof msg.senderId === 'string' ? msg.senderId : msg.senderId?._id;
  const member = groupMembers.find(m => m._id === id);
  if (member?.avatarUrl) return member.avatarUrl;
  return undefined;
}

function getFileName(type: Message['type'], content?: string): string {
  if (isFileType(type)) {
    const encodedName = type.slice(FILE_PREFIX.length);
    try {
      return decodeURIComponent(encodedName) || 'Tệp đính kèm';
    } catch {
      return encodedName || 'Tệp đính kèm';
    }
  }

  return content?.trim() || 'Tệp đính kèm';
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function resolveMessageRef(message: Message): string {
  return message.idempotencyKey || message._id;
}

function MessageReceiptIndicator({
  message,
  onPressReadPreview,
}: {
  message: Message;
  onPressReadPreview?: () => void;
}) {
  if (!message.status || message.type === 'system-recall') {
    return null;
  }

  if (message.status === 'delivered') {
    return <Ionicons name="checkmark" size={14} color="#64748b" style={{ marginLeft: 4 }} />;
  }

  if (message.status !== 'read') {
    return null;
  }

  const preview = Array.isArray(message.readByPreview) ? message.readByPreview : [];
  if (preview.length === 0) {
    return null;
  }

  const visibleReadCount = Array.isArray(message.readBy) && message.readBy.length > 0
    ? message.readBy.length
    : preview.length;

  return (
    <Pressable style={bubbleStyles.readPreviewButton} onPress={onPressReadPreview}>
      <View style={bubbleStyles.readPreviewStack}>
        {preview.map((reader) => {
          const hasAvatar = Boolean(reader.avatarUrl);
          return hasAvatar ? (
            <Image
              key={`reader-${reader.userId}`}
              source={{ uri: reader.avatarUrl }}
              style={bubbleStyles.readPreviewAvatar}
            />
          ) : (
            <View key={`reader-${reader.userId}`} style={[bubbleStyles.readPreviewAvatar, bubbleStyles.readPreviewFallback]}>
              <Text style={bubbleStyles.readPreviewFallbackText}>
                {(reader.displayName || 'U').slice(0, 1).toUpperCase()}
              </Text>
            </View>
          );
        })}
      </View>
      {visibleReadCount > preview.length && (
        <Text style={bubbleStyles.readPreviewMore}>+{visibleReadCount - preview.length}</Text>
      )}
    </Pressable>
  );
}

function TypingIndicator({ typingUsers }: { typingUsers: string[] }) {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (typingUsers.length === 0) return;

    const animate = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: -6, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]),
      );

    const a1 = animate(dot1, 0);
    const a2 = animate(dot2, 150);
    const a3 = animate(dot3, 300);
    a1.start();
    a2.start();
    a3.start();

    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, [typingUsers.length, dot1, dot2, dot3]);

  if (typingUsers.length === 0) return null;

  return (
    <View style={typingStyles.container}>
      <View style={typingStyles.bubble}>
        <Animated.View style={[typingStyles.dot, { transform: [{ translateY: dot1 }] }]} />
        <Animated.View style={[typingStyles.dot, { transform: [{ translateY: dot2 }] }]} />
        <Animated.View style={[typingStyles.dot, { transform: [{ translateY: dot3 }] }]} />
      </View>
      <Text style={typingStyles.text}>
        {typingUsers.length === 1 ? 'đang nhập...' : `${typingUsers.length} người đang nhập...`}
      </Text>
    </View>
  );
}

function VideoMessage({
  mediaUrl,
  isMe,
  onOpenMedia,
}: {
  mediaUrl?: string;
  isMe: boolean;
  onOpenMedia: (url?: string) => Promise<void>;
}) {
  const [started, setStarted] = useState(false);
  const videoRef = useRef<any>(null);
  const player = useVideoPlayer(mediaUrl || null, (current: { pause: () => void }) => {
    current.pause();
  });

  if (!mediaUrl) {
    return (
      <View style={[bubbleStyles.fileCard, isMe && bubbleStyles.fileCardMe]}>
        <Ionicons name="videocam-outline" size={22} color={isMe ? '#0f172a' : '#94a3b8'} />
        <View style={bubbleStyles.fileMeta}>
          <Text style={[bubbleStyles.fileTitle, isMe && bubbleStyles.fileTitleMe]}>Video</Text>
          <Text style={[bubbleStyles.fileAction, isMe && bubbleStyles.fileActionMe]}>Không có liên kết</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={bubbleStyles.videoContainer}>
      <VideoView
        ref={videoRef}
        style={bubbleStyles.mediaVideo}
        player={player}
        nativeControls
        contentFit="cover"
        fullscreenOptions={{ enable: true }}
        allowsPictureInPicture
      />
      {!started && (
        <Pressable
          onPress={() => {
            player.play();
            setStarted(true);
          }}
          style={bubbleStyles.videoOverlay}
        >
          <Ionicons name="play-circle" size={52} color="rgba(255,255,255,0.96)" />
        </Pressable>
      )}
      <TouchableOpacity
        onPress={() => {
          if (videoRef.current) {
            videoRef.current.enterFullscreen();
          }
        }}
        style={[bubbleStyles.videoOpenBtn, isMe && bubbleStyles.videoOpenBtnMe]}
      >
        <Ionicons name="open-outline" size={14} color={isMe ? '#0f172a' : '#a5f3fc'} />
        <Text style={[bubbleStyles.videoOpenText, isMe && bubbleStyles.videoOpenTextMe]}>Mở toàn màn hình</Text>
      </TouchableOpacity>
    </View>
  );
}

const typingStyles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 6 },
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#94a3b8',
    marginHorizontal: 2,
  },
  text: {
    color: '#94a3b8',
    fontSize: 12,
    fontFamily: 'BeVietnamPro_400Regular',
  },
});

function ArchiveVideoItem({ mediaUrl }: { mediaUrl?: string }) {
  const videoRef = useRef<any>(null);
  const player = useVideoPlayer(mediaUrl || null, (current: { pause: () => void }) => {
    current.pause();
  });

  return (
    <View style={{ flex: 1, position: 'relative', overflow: 'hidden', borderRadius: 8, }}>
      <VideoView
        ref={videoRef}
        style={{ width: '100%', height: '100%', borderRadius: 8, }}
        player={player}
        nativeControls={false}
        contentFit="cover"
        fullscreenOptions={{ enable: true }}
        surfaceType="textureView"
        onFullscreenExit={() => {
          player.pause();
        }}
      />
      <TouchableOpacity 
        style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' }]} 
        onPress={() => {
          if (videoRef.current) {
            player.play();
            videoRef.current.enterFullscreen();
          }
        }}
      >
        <Ionicons name="play" size={24} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

export default function ChatRoomScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { conversationId, name, avatarUrl, isGroup } = useLocalSearchParams<{
    conversationId: string;
    name: string;
    avatarUrl?: string;
    isGroup?: string;
  }>();

  const userInfo = useAuthStore((s) => s.userInfo);
  const userId = String(userInfo?._id || userInfo?.id || '');

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isMoreLoading, setIsMoreLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [showOptionsId, setShowOptionsId] = useState<string | null>(null);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [pendingMediaDraft, setPendingMediaDraft] = useState<PendingMediaDraft | null>(null);
  const [pendingMediaSend, setPendingMediaSend] = useState<PendingMediaSend | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [selectedMediaMessage, setSelectedMediaMessage] = useState<Message | null>(null);
  const [showMediaOverlay, setShowMediaOverlay] = useState(true);
  const [conversationName, setConversationName] = useState(name || 'Chat');
  const [conversationAvatarUrl, setConversationAvatarUrl] = useState<string | undefined>(
    avatarUrl && avatarUrl.length > 0 ? avatarUrl : undefined,
  );
  const [isGroupInfoOpen, setIsGroupInfoOpen] = useState(false);
  const [isConversationPinned, setIsConversationPinned] = useState(false);
  const [conversationMutedUntil, setConversationMutedUntil] = useState<Date | null>(null);
  const [penaltyScore, setPenaltyScore] = useState(0);
  const [serverMutedUntil, setServerMutedUntil] = useState<Date | null>(null);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [isMuteDurationModalOpen, setIsMuteDurationModalOpen] = useState(false);
  const [archiveTab, setArchiveTab] = useState<'media' | 'files' | 'links'>('media');
  const [groupNameDraft, setGroupNameDraft] = useState('');
  const [groupAvatarDraft, setGroupAvatarDraft] = useState<string | undefined>(undefined);
  const [isSavingGroupInfo, setIsSavingGroupInfo] = useState(false);
  const [isUploadingGroupAvatar, setIsUploadingGroupAvatar] = useState(false);
  const [isUpdatingMemberRole, setIsUpdatingMemberRole] = useState(false);
  const [groupMembers, setGroupMembers] = useState<Array<{ _id: string; displayName: string; avatarUrl?: string }>>([]);
  const [groupAdminIds, setGroupAdminIds] = useState<string[]>([]);
  const [groupCreatorId, setGroupCreatorId] = useState<string | undefined>(undefined);
  const [targetUserId, setTargetUserId] = useState<string | undefined>(undefined);
  const [socketReadyVersion, setSocketReadyVersion] = useState(0);

  const isGroupChat = isGroup === 'true';
  const [reactionPickerVisible, setReactionPickerVisible] = useState(false);
  const [reactionTargetMessageId, setReactionTargetMessageId] = useState<string | null>(null);
  const [reactionUserStateByMessage, setReactionUserStateByMessage] = useState<Record<string, Message['reactionUserState']>>({});
  const [reactionSheetVisible, setReactionSheetVisible] = useState(false);
  const [reactionSheetLoading, setReactionSheetLoading] = useState(false);
  const [reactionSheetData, setReactionSheetData] = useState<ReactionDetailsResponse | null>(null);
  const [reactionSheetTab, setReactionSheetTab] = useState('ALL');
  const [statusDetailsVisible, setStatusDetailsVisible] = useState(false);
  const [statusDetailsMessage, setStatusDetailsMessage] = useState<Message | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message['replyTo'] | null>(null);
  const [showComposerPicker, setShowComposerPicker] = useState(false);
  const [composerPickerTab, setComposerPickerTab] = useState<ComposerPickerTab>('emoji');
  // Trang thai Forward Modal
  const [forwardModalVisible, setForwardModalVisible] = useState(false);
  const [forwardMessageId, setForwardMessageId] = useState<string | null>(null);
  // Trang thai Action Menu (hien thi khi long-press tin nhan)
  const [actionMenuVisible, setActionMenuVisible] = useState(false);
  const [actionMenuMessage, setActionMenuMessage] = useState<Message | null>(null);
  const [appDialog, setAppDialog] = useState<AppDialogState>({
    visible: false,
    mode: 'alert',
    title: '',
    message: '',
    tone: 'info',
  });

  const openInfoDialog = (title: string, message: string, tone: 'info' | 'error' = 'info', onClose?: () => void) => {
    setAppDialog({
      visible: true,
      mode: 'alert',
      title,
      message,
      tone,
      onClose,
      onConfirm: undefined,
      confirmLabel: undefined,
      cancelLabel: undefined,
    });
  };

  const openConfirmDialog = (title: string, message: string, onConfirm: () => void, confirmLabel: string) => {
    setAppDialog({
      visible: true,
      mode: 'confirm',
      title,
      message,
      tone: 'info',
      onClose: undefined,
      onConfirm,
      confirmLabel,
      cancelLabel: 'Hủy',
    });
  };

  const closeInfoDialog = () => {
    const onClose = appDialog.onClose;
    setAppDialog({ visible: false, mode: 'alert', title: '', message: '', tone: 'info' });
    if (onClose) {
      onClose();
    }
  };

  const handleDialogConfirm = () => {
    const onConfirm = appDialog.onConfirm;
    setAppDialog({ visible: false, mode: 'alert', title: '', message: '', tone: 'info' });
    if (onConfirm) {
      onConfirm();
    }
  };

  const {
    previews,
    dismissPreview,
    pauseDismiss,
    resumeDismiss,
    quickReply,
  } = useMessagePreview(conversationId ?? null);

  const flatListRef = useRef<FlatList>(null);
  const jumpTargetRef = useRef<PendingJumpTarget | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);
  const hydratedReactionStateRefsRef = useRef<Set<string>>(new Set());
  const scrollOffsetRef = useRef(0);
  const contentHeightRef = useRef(0);
  const preserveViewportRef = useRef<{ offset: number; contentHeight: number } | null>(null);

  const notifyInaccessibleReplyTarget = useCallback(() => {
    Alert.alert('Thông báo', 'Tin nhắn không thể truy cập.');
  }, []);

  const openStatusDetails = useCallback((message: Message) => {
    if (message.status !== 'read' || (message.readByPreview?.length || 0) === 0) {
      return;
    }

    setStatusDetailsMessage(message);
    setStatusDetailsVisible(true);
  }, []);

  const closeStatusDetails = useCallback(() => {
    setStatusDetailsVisible(false);
    setStatusDetailsMessage(null);
  }, []);

  const scrollToBottom = useCallback((animated = true) => {
    requestAnimationFrame(() => {
      flatListRef.current?.scrollToEnd({ animated });
    });
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const showSub = Keyboard.addListener('keyboardDidShow', (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });

    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    setConversationName(name || 'Chat');
    setConversationAvatarUrl(avatarUrl && avatarUrl.length > 0 ? avatarUrl : undefined);
  }, [name, avatarUrl, conversationId]);

  const loadConversationMeta = useCallback(async () => {
    if (!conversationId) return;

    try {
      const [response, prefResponse] = await Promise.all([
        api.get('/conversations'),
        api.get('/notifications/preferences'),
      ]);
      const conversations = Array.isArray(response.data?.data)
        ? (response.data.data as ConversationMeta[])
        : [];
      const currentConversation = conversations.find((item) => item._id === conversationId);

      if (!currentConversation) return;

      if (typeof currentConversation.name === 'string' && currentConversation.name.trim().length > 0) {
        setConversationName(currentConversation.name.trim());
      }

      if (typeof currentConversation.avatarUrl === 'string' && currentConversation.avatarUrl.trim().length > 0) {
        setConversationAvatarUrl(currentConversation.avatarUrl);
      }

      const users = Array.isArray(currentConversation.users) ? currentConversation.users : [];
      setGroupMembers(users);

      if (isGroupChat) {
        setGroupAdminIds(Array.isArray(currentConversation.adminIds) ? currentConversation.adminIds : []);
        setGroupCreatorId(currentConversation.createdBy || currentConversation.adminIds?.[0]);
      } else {
        const users = Array.isArray(currentConversation.users) ? currentConversation.users : [];
        setGroupMembers(users);
        const otherUser = users.find((u) => u._id !== userId);
        if (otherUser) {
          setTargetUserId(otherUser._id);
          if (!currentConversation.name || currentConversation.name.trim().length === 0) {
            setConversationName(otherUser.displayName || 'Người dùng');
          }
          if (!currentConversation.avatarUrl || currentConversation.avatarUrl.trim().length === 0) {
            setConversationAvatarUrl(otherUser.avatarUrl || undefined);
          }
        }
      }

      const prefs = (prefResponse.data?.data || {}) as {
        pinnedConversations?: string[];
        mutedUntil?: Record<string, string>;
      };

      const pinnedIds = Array.isArray(prefs.pinnedConversations) ? prefs.pinnedConversations : [];
      setIsConversationPinned(pinnedIds.includes(conversationId));

      const mutedRaw = prefs.mutedUntil?.[conversationId];
      if (typeof mutedRaw === 'string') {
        const mutedDate = new Date(mutedRaw);
        setConversationMutedUntil(Number.isNaN(mutedDate.getTime()) ? null : mutedDate);
      } else {
        setConversationMutedUntil(null);
      }
    } catch (err: any) {
      console.error('[ERROR] Failed to load conversation meta:', err?.response?.data || err?.message || err);
    }
  }, [conversationId, isGroupChat]);

  const applyGroupMeta = useCallback((updatedGroup?: {
    createdBy?: string;
    adminIds?: string[];
    users?: Array<{ _id: string; displayName: string; avatarUrl?: string }>;
  }) => {
    if (!updatedGroup) {
      return;
    }

    if (Array.isArray(updatedGroup.users)) {
      setGroupMembers(updatedGroup.users);
    }
    if (Array.isArray(updatedGroup.adminIds)) {
      setGroupAdminIds(updatedGroup.adminIds);
    }
    if (typeof updatedGroup.createdBy === 'string' && updatedGroup.createdBy.trim().length > 0) {
      setGroupCreatorId(updatedGroup.createdBy);
    }
  }, []);

  const uploadAssetToCloudinary = useCallback(async (
    asset: ImagePicker.ImagePickerAsset,
    uploadType: 'image' | 'video',
  ): Promise<string | null> => {
    const signRes = await api.post('/upload/generate-signature', { type: uploadType });
    const { signature, timestamp, apiKey, cloudName, folder } = signRes.data;

    const formData = new FormData();
    formData.append('file', {
      uri: asset.uri,
      type: asset.mimeType || (uploadType === 'video' ? 'video/mp4' : 'image/jpeg'),
      name: asset.fileName || (uploadType === 'video' ? `video-${Date.now()}.mp4` : `image-${Date.now()}.jpg`),
    } as any);
    formData.append('api_key', apiKey);
    formData.append('timestamp', String(timestamp));
    formData.append('signature', signature);
    formData.append('folder', folder);

    const cloudRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${uploadType}/upload`, {
      method: 'POST',
      body: formData,
    });

    const cloudData = await cloudRes.json();
    if (!cloudData?.public_id) {
      return null;
    }

    const verifyRes = await api.post('/upload/verify', {
      publicId: cloudData.public_id,
      type: uploadType,
    });

    return typeof verifyRes.data?.secureUrl === 'string' ? verifyRes.data.secureUrl : null;
  }, []);

  const openGroupInfoEditor = useCallback(() => {
    setGroupNameDraft(conversationName);
    setGroupAvatarDraft(conversationAvatarUrl);
    setIsGroupInfoOpen(true);
  }, [conversationName, conversationAvatarUrl]);

  const handlePickGroupAvatar = useCallback(async () => {
    try {
      setIsUploadingGroupAvatar(true);

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.length) return;
      const secureUrl = await uploadAssetToCloudinary(result.assets[0], 'image');

      if (secureUrl) {
        setGroupAvatarDraft(secureUrl);
      }
    } catch (err) {
      console.error('Upload group avatar failed:', err);
      openInfoDialog('Thông báo', 'Không thể tải lên ảnh nhóm. Vui lòng thử lại.', 'error');
    } finally {
      setIsUploadingGroupAvatar(false);
    }
  }, [uploadAssetToCloudinary]);

  const handleHeaderAvatarPress = useCallback(async () => {
    if (!conversationId || !isGroupChat) {
      return;
    }

    try {
      setIsUploadingGroupAvatar(true);

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      const secureUrl = await uploadAssetToCloudinary(result.assets[0], 'image');
      if (!secureUrl) {
        return;
      }

      const response = await api.patch(`/groups/${conversationId}`, { avatarUrl: secureUrl });
      const updatedAvatar = typeof response.data?.data?.avatarUrl === 'string'
        ? response.data.data.avatarUrl
        : secureUrl;

      setConversationAvatarUrl(updatedAvatar);
      router.setParams({ avatarUrl: updatedAvatar });
    } catch (err: any) {
      const message = err?.response?.data?.message;
      openInfoDialog('Không thể cập nhật ảnh nhóm', typeof message === 'string' ? message : 'Vui lòng thử lại.', 'error');
    } finally {
      setIsUploadingGroupAvatar(false);
    }
  }, [conversationId, isGroupChat, router, uploadAssetToCloudinary]);

  const handleSaveGroupInfo = useCallback(async () => {
    if (!conversationId || !isGroupChat) return;

    const trimmedName = groupNameDraft.trim();
    const normalizedName = trimmedName.length > 0 ? trimmedName : conversationName;
    const normalizedAvatar = groupAvatarDraft;

    const hasNameChange = normalizedName !== conversationName;
    const hasAvatarChange = normalizedAvatar !== conversationAvatarUrl;

    if (!hasNameChange && !hasAvatarChange) {
      setIsGroupInfoOpen(false);
      return;
    }

    try {
      setIsSavingGroupInfo(true);

      const payload: { name?: string; avatarUrl?: string } = {};
      if (hasNameChange) {
        payload.name = normalizedName;
      }
      if (hasAvatarChange && normalizedAvatar) {
        payload.avatarUrl = normalizedAvatar;
      }

      const response = await api.patch(`/groups/${conversationId}`, payload);
      const updatedGroup = response.data?.data as { name?: string; avatarUrl?: string } | undefined;

      const nextName = typeof updatedGroup?.name === 'string' ? updatedGroup.name : normalizedName;
      const nextAvatar = typeof updatedGroup?.avatarUrl === 'string' ? updatedGroup.avatarUrl : normalizedAvatar;

      setConversationName(nextName);
      setConversationAvatarUrl(nextAvatar);
      setIsGroupInfoOpen(false);
      router.setParams({ name: nextName, avatarUrl: nextAvatar || '' });
    } catch (err: any) {
      const message = err?.response?.data?.message;
      openInfoDialog('Không thể cập nhật nhóm', typeof message === 'string' ? message : 'Vui lòng thử lại.', 'error');
    } finally {
      setIsSavingGroupInfo(false);
    }
  }, [
    conversationAvatarUrl,
    conversationId,
    conversationName,
    groupAvatarDraft,
    groupNameDraft,
    isGroupChat,
    router,
  ]);

  const handleToggleConversationPin = useCallback(async () => {
    if (!conversationId) {
      return;
    }

    const nextPinned = !isConversationPinned;
    setIsConversationPinned(nextPinned);

    try {
      if (nextPinned) {
        await api.post(`/notifications/pin/${conversationId}`, { pin: true });
      } else {
        await api.delete(`/notifications/pin/${conversationId}`);
      }
    } catch (err: any) {
      setIsConversationPinned(!nextPinned);
      const message = err?.response?.data?.message;
      openInfoDialog('Thông báo', typeof message === 'string' ? message : 'Không thể cập nhật ghim hội thoại.', 'error');
    }
  }, [conversationId, isConversationPinned]);

  const muteConversationWithDuration = useCallback(async (duration: '1h' | '4h' | '8h' | 'until_enabled') => {
    if (!conversationId) {
      return;
    }

    const now = Date.now();
    const untilDate = duration === '1h'
      ? new Date(now + 60 * 60 * 1000)
      : duration === '4h'
        ? new Date(now + 4 * 60 * 60 * 1000)
        : duration === '8h'
          ? new Date(now + 8 * 60 * 60 * 1000)
          : new Date('9999-12-31T23:59:59.999Z');

    try {
      await api.post(`/notifications/mute/${conversationId}`, { until: untilDate.toISOString() });
      setConversationMutedUntil(untilDate);
      openInfoDialog('Thông báo', 'Đã tắt thông báo hội thoại.');
    } catch (err: any) {
      const message = err?.response?.data?.message;
      openInfoDialog('Thông báo', typeof message === 'string' ? message : 'Không thể tắt thông báo hội thoại.', 'error');
    }
  }, [conversationId]);

  const handleMuteConversation = useCallback(() => {
    setIsMuteDurationModalOpen(true);
  }, [muteConversationWithDuration]);

  const handleUnmuteConversation = useCallback(async () => {
    if (!conversationId) {
      return;
    }

    try {
      await api.delete(`/notifications/mute/${conversationId}`);
      setConversationMutedUntil(null);
      openInfoDialog('Thông báo', 'Đã bật lại thông báo.');
    } catch (err: any) {
      const message = err?.response?.data?.message;
      openInfoDialog('Thông báo', typeof message === 'string' ? message : 'Không thể bật thông báo.', 'error');
    }
  }, [conversationId]);

  const handleLeaveGroup = useCallback(async () => {
    if (!conversationId || !isGroupChat) {
      return;
    }

    openConfirmDialog(
      'Rời nhóm',
      'Bạn có chắc muốn rời nhóm này?',
      () => {
        void (async () => {
          try {
            await api.delete(`/groups/${conversationId}/members/me`);
            setIsGroupInfoOpen(false);
            router.back();
          } catch (err: any) {
            const message = err?.response?.data?.message;
            openInfoDialog('Thông báo', typeof message === 'string' ? message : 'Không thể rời nhóm lúc này.', 'error');
          }
        })();
      },
      'Rời nhóm',
    );
  }, [conversationId, isGroupChat, router]);

  const handleAssignMemberRole = useCallback(async (memberId: string, role: 'admin' | 'member') => {
    if (!conversationId || !isGroupChat) {
      return;
    }

    try {
      setIsUpdatingMemberRole(true);
      const response = await api.patch(`/groups/${conversationId}/members/${memberId}/role`, { role });
      applyGroupMeta(response.data?.data);
      openInfoDialog('Thông báo', role === 'admin' ? 'Đã gán quyền quản trị viên.' : 'Đã gỡ quyền quản trị viên.');
    } catch (err: any) {
      const message = err?.response?.data?.message;
      openInfoDialog('Thông báo', typeof message === 'string' ? message : 'Không thể cập nhật quyền thành viên.', 'error');
    } finally {
      setIsUpdatingMemberRole(false);
    }
  }, [applyGroupMeta, conversationId, isGroupChat]);

  const handleRemoveMember = useCallback(async (memberId: string, memberDisplayName: string) => {
    if (!conversationId || !isGroupChat) {
      return;
    }

    openConfirmDialog(
      'Xóa thành viên',
      `Bạn có chắc muốn xóa ${memberDisplayName} khỏi nhóm?`,
      () => {
        void (async () => {
          try {
            setIsUpdatingMemberRole(true);
            const response = await api.delete(`/groups/${conversationId}/members/${memberId}`);
            applyGroupMeta(response.data?.data);
            openInfoDialog('Thông báo', 'Đã xóa thành viên khỏi nhóm.');
          } catch (err: any) {
            const message = err?.response?.data?.message;
            openInfoDialog('Thông báo', typeof message === 'string' ? message : 'Không thể xóa thành viên lúc này.', 'error');
          } finally {
            setIsUpdatingMemberRole(false);
          }
        })();
      },
      'Xóa',
    );
  }, [applyGroupMeta, conversationId, isGroupChat]);
  const getReactionUserStateForMessage = useCallback((message: Message) => {
    const byId = reactionUserStateByMessage[message._id];
    if (byId) return byId;
    const messageRef = resolveMessageRef(message);
    const byRef = reactionUserStateByMessage[messageRef];
    if (byRef) return byRef;
    return message.reactionUserState;
  }, [reactionUserStateByMessage]);

  const updateReactionUserStateCache = useCallback((messageId: string, messageRef: string, nextState: NonNullable<Message['reactionUserState']>) => {
    setReactionUserStateByMessage((prev) => ({
      ...prev,
      [messageId]: nextState,
      [messageRef]: nextState,
    }));
  }, []);

  const applyReactionSummaryToMessage = useCallback((target: { messageId?: string; messageRef?: string }, summary: NonNullable<Message['reactionSummary']>, userState?: NonNullable<Message['reactionUserState']>) => {
    setMessages((prev) => prev.map((msg) => {
      const msgId = String(msg._id);
      const msgRef = String(msg.idempotencyKey || '');
      const targetMessageId = String(target.messageId || '');
      const targetMessageRef = String(target.messageRef || '');
      const isTarget =
        msgId === targetMessageId
        || msgId === targetMessageRef
        || msgRef === targetMessageId
        || msgRef === targetMessageRef;

      if (!isTarget) {
        return msg;
      }

      return {
        ...msg,
        reactionSummary: summary,
        reactionUserState: userState ?? msg.reactionUserState,
      };
    }));
  }, []);

  const targetMessage = reactionTargetMessageId
    ? messages.find((msg) => msg._id === reactionTargetMessageId || msg.idempotencyKey === reactionTargetMessageId)
    : undefined;

  const openReactionPicker = useCallback((message: Message) => {
    if (message.type === 'system-recall') {
      return;
    }

    const key = message._id || message.idempotencyKey || null;
    if (!key) {
      return;
    }

    setShowOptionsId(null);
    setReactionTargetMessageId(key);
    setReactionPickerVisible(true);
  }, []);

  const closeReactionPicker = useCallback(() => {
    setReactionPickerVisible(false);
    setReactionTargetMessageId(null);
  }, []);

  const sendReactionUpsert = useCallback((message: Message, emoji: string, actionSource: 'picker-select' | 'trigger-click') => {
    if (!conversationId) {
      return;
    }

    const messageRef = resolveMessageRef(message);
    const requestId = generateUUID();
    const idempotencyKey = generateUUID();

    const prevSummary = message.reactionSummary || { totalCount: 0, emojiCounts: {} };
    const prevUserState = getReactionUserStateForMessage(message) || {
      lastEmoji: null,
      totalCount: 0,
      emojiCounts: {},
    };

    const nextSummaryCounts = { ...(prevSummary.emojiCounts || {}) };
    nextSummaryCounts[emoji] = (nextSummaryCounts[emoji] || 0) + 1;

    const nextSummary: NonNullable<Message['reactionSummary']> = {
      totalCount: prevSummary.totalCount + 1,
      emojiCounts: nextSummaryCounts,
    };

    const nextUserCounts = { ...(prevUserState.emojiCounts || {}) };
    nextUserCounts[emoji] = (nextUserCounts[emoji] || 0) + 1;

    const nextUserState: NonNullable<Message['reactionUserState']> = {
      lastEmoji: emoji,
      totalCount: (prevUserState.totalCount || 0) + 1,
      emojiCounts: nextUserCounts,
    };

    applyReactionSummaryToMessage({ messageId: message._id, messageRef }, nextSummary, nextUserState);
    updateReactionUserStateCache(message._id, messageRef, nextUserState);

    socketService.emitReactionUpsert(
      conversationId,
      messageRef,
      emoji,
      1,
      idempotencyKey,
      actionSource,
      requestId,
    );
  }, [applyReactionSummaryToMessage, conversationId, getReactionUserStateForMessage, updateReactionUserStateCache]);

  const sendReactionRemoveAllMine = useCallback((message: Message) => {
    if (!conversationId) {
      return;
    }

    const messageRef = resolveMessageRef(message);
    const currentUserState = getReactionUserStateForMessage(message);
    if (!currentUserState || currentUserState.totalCount <= 0) {
      return;
    }

    const summary = message.reactionSummary || { totalCount: 0, emojiCounts: {} };
    const nextSummaryCounts = { ...(summary.emojiCounts || {}) };

    Object.entries(currentUserState.emojiCounts || {}).forEach(([emoji, count]) => {
      nextSummaryCounts[emoji] = Math.max(0, (nextSummaryCounts[emoji] || 0) - count);
      if (nextSummaryCounts[emoji] === 0) {
        delete nextSummaryCounts[emoji];
      }
    });

    const nextSummary: NonNullable<Message['reactionSummary']> = {
      totalCount: Math.max(0, summary.totalCount - currentUserState.totalCount),
      emojiCounts: nextSummaryCounts,
    };

    const clearedUserState: NonNullable<Message['reactionUserState']> = {
      lastEmoji: null,
      totalCount: 0,
      emojiCounts: {},
    };

    applyReactionSummaryToMessage({ messageId: message._id, messageRef }, nextSummary, clearedUserState);
    updateReactionUserStateCache(message._id, messageRef, clearedUserState);

    socketService.emitReactionRemoveAllMine(
      conversationId,
      messageRef,
      generateUUID(),
      generateUUID(),
    );
  }, [applyReactionSummaryToMessage, conversationId, getReactionUserStateForMessage, updateReactionUserStateCache]);

  const handlePickReaction = useCallback((emoji: string) => {
    if (!targetMessage) {
      return;
    }

    sendReactionUpsert(targetMessage, emoji, 'picker-select');
    closeReactionPicker();
  }, [closeReactionPicker, sendReactionUpsert, targetMessage]);

  const handleQuickAddFromTrigger = useCallback((message: Message) => {
    const myState = getReactionUserStateForMessage(message);
    const lastEmoji = myState?.lastEmoji;
    if (!lastEmoji) {
      return;
    }

    sendReactionUpsert(message, lastEmoji, 'trigger-click');
  }, [getReactionUserStateForMessage, sendReactionUpsert]);

  const openReactionDetailsSheet = useCallback(async (message: Message) => {
    setReactionSheetVisible(true);
    setReactionSheetLoading(true);
    setReactionSheetData(null);
    setReactionSheetTab('ALL');

    try {
      const messageRef = resolveMessageRef(message);
      const res = await api.get<ReactionDetailsResponse>(`/messages/${messageRef}/reactions/details`);
      setReactionSheetData(res.data);
    } catch (err) {
      console.error('Failed to load reaction details:', err);
      setReactionSheetData(null);
    } finally {
      setReactionSheetLoading(false);
    }
  }, []);

  const loadMessages = useCallback(async (cursor?: string | null) => {
    if (!conversationId) return;

    try {
      if (cursor) setIsMoreLoading(true);
      else setIsLoading(true);

      const res = await api.get(`/messages/${conversationId}`, {
        params: { limit: 20, cursor: cursor || undefined },
      });

      const rawMessages = Array.isArray(res.data?.messages) ? res.data.messages : [];
      const normalizedMessages = rawMessages
        .map((raw: unknown) => normalizeMessage(raw))
        .filter((message: Message | null): message is Message => Boolean(message));
      const ascendingMessages = normalizedMessages.reverse();

      setMessages((prev) => {
        const merged = cursor ? [...ascendingMessages, ...prev] : ascendingMessages;
        return dedupeMessages(merged);
      });

      setHasMore(Boolean(res.data?.hasMore));
      setNextCursor(typeof res.data?.nextCursor === 'string' ? res.data.nextCursor : null);

      if (!cursor) {
        setTimeout(() => scrollToBottom(false), 60);
      }
    } catch (err: any) {
      console.error('[ERROR] Failed to load messages:', err?.response?.data || err?.message || err);
    } finally {
      setIsLoading(false);
      setIsMoreLoading(false);
    }
  }, [conversationId, scrollToBottom]);

  useFocusEffect(
    useCallback(() => {
      setMessages([]);
      setNextCursor(null);
      setHasMore(true);
      setShowOptionsId(null);
      setReplyingTo(null);
      jumpTargetRef.current = null;
      void loadMessages();
      void loadConversationMeta();

      return () => {
        setShowOptionsId(null);
      };
    }, [loadConversationMeta, loadMessages]),
  );

  useEffect(() => {
    hydratedReactionStateRefsRef.current.clear();
    setReactionUserStateByMessage({});
    setReactionPickerVisible(false);
    setReactionTargetMessageId(null);
    setReactionSheetVisible(false);
    setReactionSheetData(null);
    setReactionSheetTab('ALL');
    setStatusDetailsVisible(false);
    setStatusDetailsMessage(null);
    jumpTargetRef.current = null;
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId || !userId || messages.length === 0) {
      return;
    }

    const candidates = messages.filter((message) => {
      const totalCount = message.reactionSummary?.totalCount || 0;
      if (totalCount <= 0) {
        return false;
      }

      const messageRef = resolveMessageRef(message);
      if (hydratedReactionStateRefsRef.current.has(messageRef)) {
        return false;
      }

      return !reactionUserStateByMessage[message._id] && !reactionUserStateByMessage[messageRef];
    });

    if (candidates.length === 0) {
      return;
    }

    candidates.forEach((message) => hydratedReactionStateRefsRef.current.add(resolveMessageRef(message)));

    let cancelled = false;

    void (async () => {
      const updates: Array<{
        messageId: string;
        messageRef: string;
        userState: NonNullable<Message['reactionUserState']>;
      }> = [];

      await Promise.allSettled(
        candidates.map(async (message) => {
          try {
            const messageRef = resolveMessageRef(message);
            const res = await api.get<ReactionDetailsResponse>(`/messages/${messageRef}/reactions/details`);
            const details = res.data;
            const me = details.rows.find((row) => row.userId === userId && row.totalCount > 0);
            if (!me) {
              return;
            }

            updates.push({
              messageId: details.messageId || message._id,
              messageRef,
              userState: {
                lastEmoji: me.lastEmoji,
                totalCount: me.totalCount,
                emojiCounts: me.emojiCounts,
              },
            });
          } catch {
            // Ignore hydrate failures; realtime updates still reconcile state.
          }
        }),
      );

      if (cancelled || updates.length === 0) {
        return;
      }

      setReactionUserStateByMessage((prev) => {
        const next = { ...prev };
        updates.forEach((item) => {
          next[item.messageId] = item.userState;
          next[item.messageRef] = item.userState;
        });
        return next;
      });

      setMessages((prev) => prev.map((message) => {
        const msgId = String(message._id);
        const msgRef = String(message.idempotencyKey || '');
        const found = updates.find((item) => (
          msgId === String(item.messageId)
          || msgId === String(item.messageRef)
          || msgRef === String(item.messageId)
          || msgRef === String(item.messageRef)
        ));

        if (!found) {
          return message;
        }

        return {
          ...message,
          reactionUserState: found.userState,
        };
      }));
    })();

    return () => {
      cancelled = true;
    };
  }, [conversationId, messages, reactionUserStateByMessage, userId]);

  const handleLoadMore = useCallback(() => {
    if (!hasMore || isMoreLoading || isLoading || !nextCursor) return;

    preserveViewportRef.current = {
      offset: scrollOffsetRef.current,
      contentHeight: contentHeightRef.current,
    };

    void loadMessages(nextCursor);
  }, [hasMore, isMoreLoading, isLoading, nextCursor, loadMessages]);

  const findMessageIndexByRef = useCallback((messageRef: string) => {
    if (!messageRef) {
      return -1;
    }

    return messages.findIndex(
      (msg) => msg._id === messageRef || msg.idempotencyKey === messageRef,
    );
  }, [messages]);

  const jumpToMessage = useCallback((messageRef: string) => {
    if (!messageRef) {
      return;
    }

    const idx = findMessageIndexByRef(messageRef);

    if (idx >= 0) {
      flatListRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
      return;
    }

    if (!hasMore) {
      notifyInaccessibleReplyTarget();
      return;
    }

    jumpTargetRef.current = {
      messageRef,
      attempts: 0,
      stagnantRounds: 0,
      lastMessageCount: messages.length,
    };

    handleLoadMore();
  }, [findMessageIndexByRef, handleLoadMore, hasMore, messages.length, notifyInaccessibleReplyTarget]);

  const handleScrollList = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollOffsetRef.current = event.nativeEvent.contentOffset.y;

    if (event.nativeEvent.contentOffset.y < 120) {
      handleLoadMore();
    }
  }, [handleLoadMore]);

  useEffect(() => {
    const pendingJump = jumpTargetRef.current;
    if (!pendingJump) {
      return;
    }

    if (isMoreLoading) {
      return;
    }

    const idx = findMessageIndexByRef(pendingJump.messageRef);

    if (idx >= 0) {
      jumpTargetRef.current = null;
      flatListRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
      return;
    }

    if (!hasMore) {
      jumpTargetRef.current = null;
      notifyInaccessibleReplyTarget();
      return;
    }

    const nextAttempts = pendingJump.attempts + 1;
    const hasNewMessages = messages.length > pendingJump.lastMessageCount;
    const nextStagnantRounds = hasNewMessages ? 0 : pendingJump.stagnantRounds + 1;

    if (nextAttempts >= 8 || nextStagnantRounds >= 2) {
      jumpTargetRef.current = null;
      notifyInaccessibleReplyTarget();
      return;
    }

    jumpTargetRef.current = {
      messageRef: pendingJump.messageRef,
      attempts: nextAttempts,
      stagnantRounds: nextStagnantRounds,
      lastMessageCount: messages.length,
    };

    handleLoadMore();
  }, [findMessageIndexByRef, handleLoadMore, hasMore, isMoreLoading, messages.length, notifyInaccessibleReplyTarget]);

  useEffect(() => {
    let cancelled = false;

    if (!conversationId) return () => { cancelled = true; };

    void (async () => {
      const existingSocket = socketService.getSocket();
      if (existingSocket) {
        if (!cancelled) {
          setSocketReadyVersion((prev) => prev + 1);
        }
        return;
      }

      const connectedSocket = await socketService.connect();
      if (!cancelled && connectedSocket) {
        setSocketReadyVersion((prev) => prev + 1);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  useEffect(() => {
    const socket = socketService.getSocket();
    if (!socket || !conversationId) return;

    const joinConversationRoom = () => {
      socketService.joinConversation(conversationId);
    };

    if (socket.connected) {
      joinConversationRoom();
    }

    const handleReceiveMessage = (payload: unknown) => {
      const message = normalizeMessage(payload);
      if (!message) return;
      if (message.conversationId && message.conversationId !== conversationId) return;

      setMessages((prev) => {
        const isDuplicate = prev.some(
          (item) => item._id === message._id || (message.idempotencyKey && item.idempotencyKey === message.idempotencyKey),
        );
        if (isDuplicate) return prev;
        return dedupeMessages([...prev, message]);
      });

      if (getSenderId(message) !== userId) {
        socketService.markAsDelivered(conversationId, [message._id]);
      }

      setTimeout(() => scrollToBottom(), 80);
    };

    const handleStatusUpdate = (data: {
      messageId?: string;
      messageIds?: string[];
      idempotencyKeys?: string[];
      conversationId?: string;
      status?: Message['status'];
      reader?: {
        userId: string;
        displayName: string;
        avatarUrl?: string;
        readAt: string;
      };
    }) => {
      if (!data.status) return;

      if (data.conversationId && data.conversationId !== conversationId) {
        return;
      }

      const messageIds = Array.isArray(data.messageIds) ? data.messageIds.map(String) : [];
      if (data.messageId) {
        messageIds.push(String(data.messageId));
      }
      const idempotencyKeys = Array.isArray(data.idempotencyKeys)
        ? data.idempotencyKeys.map(String)
        : [];

      if (messageIds.length === 0 && idempotencyKeys.length === 0) {
        return;
      }

      setMessages((prev) => prev.map((message) => {
        const matchedById = messageIds.includes(message._id);
        const matchedByKey = Boolean(message.idempotencyKey)
          && idempotencyKeys.includes(String(message.idempotencyKey));

        if (!matchedById && !matchedByKey) {
          return message;
        }

        if (data.status !== 'read' || !data.reader) {
          return {
            ...message,
            status: data.status,
          };
        }

        const currentReadBy = Array.isArray(message.readBy) ? message.readBy : [];
        const mergedReadBy = [
          data.reader,
          ...currentReadBy.filter((entry) => entry.userId !== data.reader!.userId),
        ].sort((a, b) => new Date(b.readAt).getTime() - new Date(a.readAt).getTime());

        const sentTo = Array.isArray(message.sentTo)
          ? message.sentTo.filter((entry) => entry.userId !== data.reader!.userId)
          : message.sentTo;

        return {
          ...message,
          status: 'read',
          readBy: mergedReadBy,
          readByPreview: mergedReadBy.slice(0, 3),
          sentTo,
        };
      }));
    };

    const handleMessageSent = (payload: { messageId?: string; idempotencyKey?: string; createdAt?: string }) => {
      if (!payload?.idempotencyKey) return;

      setMessages((prev) => dedupeMessages(prev.map((message) => {
        if (message.idempotencyKey !== payload.idempotencyKey && message._id !== payload.idempotencyKey) {
          return message;
        }

        return {
          ...message,
          _id: payload.messageId ? String(payload.messageId) : message._id,
          createdAt: payload.createdAt || message.createdAt,
        };
      })));
    };

    const handleTypingIndicator = (payload: { userId: string; conversationId: string; isTyping: boolean }) => {
      if (payload.conversationId !== conversationId || payload.userId === userId) return;

      setTypingUsers((prev) => {
        if (payload.isTyping) {
          return prev.includes(payload.userId) ? prev : [...prev, payload.userId];
        }

        return prev.filter((id) => id !== payload.userId);
      });
    };

    const handleRecallMessage = (payload: { messageId?: string; idempotencyKey?: string; conversationId?: string }) => {
      if (payload.conversationId && payload.conversationId !== conversationId) return;

      setMessages((prev) => prev.map((message) => {
        const matchedById = payload.messageId && message._id === payload.messageId;
        const matchedByKey = payload.idempotencyKey && message.idempotencyKey === payload.idempotencyKey;

        if (!matchedById && !matchedByKey) {
          return message;
        }

        return {
          ...message,
          type: 'system-recall',
          content: '[Tin nhắn đã được thu hồi]',
          mediaUrl: undefined,
        };
      }));
    };

    const handleDeleteMessageForMe = (payload: { messageId?: string; conversationId?: string }) => {
      if (payload.conversationId && payload.conversationId !== conversationId) return;
      if (!payload.messageId) return;

      setMessages((prev) => prev.filter((message) => message._id !== payload.messageId));
    };

    const handleGroupUpdated = (payload: GroupUpdatedEvent) => {
      if (!payload?.groupId || payload.groupId !== conversationId) {
        return;
      }

      if (payload.type === 'disbanded') {
        openInfoDialog('Thông báo', 'Nhóm đã giải tán.', 'info', () => {
          router.back();
        });
        return;
      }

      if (payload.type === 'member_removed' && payload.data?.userId === userId) {
        openInfoDialog('Thông báo', 'Bạn đã rời khỏi nhóm này.', 'info', () => {
          router.back();
        });
        return;
      }

      if (typeof payload.data?.createdBy === 'string' && payload.data.createdBy.trim().length > 0) {
        setGroupCreatorId(payload.data.createdBy);
      }

      if (Array.isArray(payload.data?.adminIds)) {
        setGroupAdminIds(payload.data.adminIds.filter((id): id is string => typeof id === 'string'));
      }

      if (payload.type === 'member_removed' && payload.data?.userId) {
        const removedUserId = payload.data.userId;
        setGroupMembers((prev) => prev.filter((member) => member._id !== removedUserId));
        setGroupAdminIds((prev) => prev.filter((adminId) => adminId !== removedUserId));
      }

      if (payload.type === 'role_changed' && payload.data?.userId && payload.data?.role && !Array.isArray(payload.data?.adminIds)) {
        const changedUserId = payload.data.userId;
        const changedRole = payload.data.role;
        setGroupAdminIds((prev) => {
          const set = new Set(prev);
          if (changedRole === 'admin') {
            set.add(changedUserId);
          } else {
            set.delete(changedUserId);
          }
          return Array.from(set);
        });
      }

      if (payload.type === 'name_changed' && typeof payload.data?.name === 'string') {
        setConversationName(payload.data.name);
        router.setParams({ name: payload.data.name });
      }

      if (payload.type === 'avatar_changed') {
        const nextAvatar = typeof payload.data?.avatarUrl === 'string' ? payload.data.avatarUrl : '';
        setConversationAvatarUrl(nextAvatar || undefined);
        router.setParams({ avatarUrl: nextAvatar });
      }

      if (payload.type === 'member_added') {
        void loadConversationMeta();
      }
    };

    const handleReactionUpdated = (payload: {
      messageId: string;
      messageRef: string;
      conversationId: string;
      actor: { userId: string; action: 'upsert' | 'remove_all_mine' };
      summary: { totalCount: number; emojiCounts: Record<string, number> };
      userState?: {
        userId: string;
        lastEmoji: string | null;
        totalCount: number;
        emojiCounts: Record<string, number>;
      };
    }) => {
      if (payload.conversationId !== conversationId) {
        return;
      }

      applyReactionSummaryToMessage(
        { messageId: payload.messageId, messageRef: payload.messageRef },
        payload.summary,
        payload.actor.userId === userId ? payload.userState : undefined,
      );

      if (payload.actor.userId === userId && payload.userState) {
        updateReactionUserStateCache(payload.messageId, payload.messageRef, payload.userState);
      }
    };

    const handleReactionError = (payload: { message?: string }) => {
      if (payload?.message) {
        console.error('[Reaction] mobile socket error:', payload.message);
      }
    };

    const handleContentBlocked = (payload: { conversationId?: string; reason?: string }) => {
      if (payload.conversationId && payload.conversationId !== conversationId) return;
      openInfoDialog('Nội dung vi phạm', payload.reason || 'Tin nhắn đã bị chặn.', 'error');
    };

    const handleContentWarning = (payload: { conversationId?: string; message?: string }) => {
      if (payload.conversationId && payload.conversationId !== conversationId) return;
      if (payload.message) {
        openInfoDialog('Cảnh báo nội dung', payload.message);
      }
    };

    const handlePenaltyUpdated = (payload: { conversationId?: string; penaltyScore?: number; mutedUntil?: string }) => {
      if (payload.conversationId && payload.conversationId !== conversationId) return;
      setPenaltyScore(typeof payload.penaltyScore === 'number' ? payload.penaltyScore : 0);
      if (payload.mutedUntil) {
        const mutedDate = new Date(payload.mutedUntil);
        setServerMutedUntil(Number.isNaN(mutedDate.getTime()) ? null : mutedDate);
      } else {
        setServerMutedUntil(null);
      }
    };

    const handleMessageForwarded = (payload: { toConversationId?: string }) => {
      if (payload.toConversationId && payload.toConversationId !== conversationId) return;
      openInfoDialog('Thông báo', 'Đã chuyển tiếp tin nhắn.');
    };

    const handleReactionAck = (payload: { accepted?: boolean }) => {
      if (payload.accepted === false) {
        console.warn('[Reaction] Optimistic reaction update was rejected by server');
      }
    };

    socket.on('connect', joinConversationRoom);
    socketService.listenToMessages(handleReceiveMessage);
    socketService.listenToStatusUpdates(handleStatusUpdate);
    socketService.listenToMessageSent(handleMessageSent);
    socketService.listenToTypingIndicators(handleTypingIndicator);
    socketService.listenToMessageRecall(handleRecallMessage);
    socketService.listenToMessageDeletion(handleDeleteMessageForMe);
    socketService.listenToGroupUpdated(handleGroupUpdated as any);
    socketService.listenToReactionUpdated(handleReactionUpdated);
    socketService.listenToReactionError(handleReactionError);
    socketService.listenToContentBlocked(handleContentBlocked);
    socketService.listenToContentWarning(handleContentWarning);
    socketService.listenToUserPenaltyUpdated(handlePenaltyUpdated);
    socketService.listenToMessageForwarded(handleMessageForwarded);
    socketService.listenToReactionAck(handleReactionAck);

    return () => {
      socketService.leaveConversation(conversationId);
      socket.off('connect', joinConversationRoom);
      socketService.unlistenToMessages(handleReceiveMessage);
      socketService.unlistenToStatusUpdates(handleStatusUpdate);
      socketService.unlistenToMessageSent(handleMessageSent);
      socketService.unlistenToTypingIndicators(handleTypingIndicator);
      socketService.unlistenToMessageRecall(handleRecallMessage);
      socketService.unlistenToMessageDeletion(handleDeleteMessageForMe);
      socketService.unlistenToGroupUpdated(handleGroupUpdated as any);
      socketService.unlistenToReactionUpdated(handleReactionUpdated);
      socketService.unlistenToReactionError(handleReactionError);
      socketService.unlistenToContentBlocked(handleContentBlocked);
      socketService.unlistenToContentWarning(handleContentWarning);
      socketService.unlistenToUserPenaltyUpdated(handlePenaltyUpdated);
      socketService.unlistenToMessageForwarded(handleMessageForwarded);
      socketService.unlistenToReactionAck(handleReactionAck);
    };
  }, [
    applyReactionSummaryToMessage,
    conversationId,
    loadConversationMeta,
    socketReadyVersion,
    scrollToBottom,
    updateReactionUserStateCache,
    userId,
  ]);

  useEffect(() => {
    if (!conversationId || messages.length === 0) return;

    const unreadMessageIds = messages
      .filter((message) => getSenderId(message) !== userId && message.status !== 'read')
      .map((message) => message._id)
      .filter(Boolean);

    if (unreadMessageIds.length > 0) {
      socketService.markAsRead(conversationId, unreadMessageIds);
    }
  }, [messages, conversationId, userId]);

  const handleSend = useCallback((
    content?: string,
    type: Message['type'] = 'text',
    mediaUrl?: string,
    options?: SendMessageOptions,
  ) => {
    const textToSend = (content ?? inputText).trim();
    if (!conversationId || (!textToSend && !mediaUrl)) return;

    if (serverMutedUntil && serverMutedUntil.getTime() > Date.now()) {
      openInfoDialog('Thông báo', 'Bạn đang bị tạm khóa gửi tin nhắn trong hội thoại này.', 'error');
      return;
    }

    const idempotencyKey = options?.idempotencyKey || generateUUID();
    const optimisticMessage: Message = {
      _id: idempotencyKey,
      conversationId,
      senderId: userId,
      content: textToSend,
      type,
      mediaUrl,
      status: 'sent',
      createdAt: new Date().toISOString(),
      idempotencyKey,
      replyTo: options?.replyTo,
    };

    setMessages((prev) => {
      const index = prev.findIndex(
        (message) => message.idempotencyKey === idempotencyKey || message._id === idempotencyKey,
      );

      if (index === -1) {
        return dedupeMessages([...prev, optimisticMessage]);
      }

      const next = [...prev];
      next[index] = {
        ...next[index],
        ...optimisticMessage,
        _id: next[index]._id,
        createdAt: next[index].createdAt || optimisticMessage.createdAt,
      };
      return dedupeMessages(next);
    });

    if (!mediaUrl) setInputText('');

    if (isTypingRef.current) {
      socketService.clearPendingTyping(conversationId);
      isTypingRef.current = false;
    }

    if (!options?.deferEmit) {
      socketService.sendMessage(conversationId, textToSend, type, idempotencyKey, mediaUrl, options?.replyTo);

      if (options?.replyTo) {
        setReplyingTo(null);
      }
    }

    setTimeout(() => scrollToBottom(), 80);
    return idempotencyKey;
  }, [inputText, conversationId, userId, scrollToBottom, serverMutedUntil]);

  const handlePickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsEditing: true,
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];

      const isVideo = asset.type === 'video' || Boolean(asset.mimeType?.startsWith('video/'));
      const messageType: PendingMediaDraft['messageType'] = isVideo ? 'video' : 'image';
      const uploadType: PendingMediaDraft['uploadType'] = isVideo ? 'video' : 'image';

      setPendingMediaDraft({
        asset,
        localUri: asset.uri,
        messageType,
        uploadType,
      });
    } catch (err) {
      console.error('Pick media failed:', err);
    }
  };

  const handleComposerSend = useCallback(() => {
    if (pendingMediaDraft) {
      if (pendingMediaSend || isUploadingMedia) {
        return;
      }

      const messageContent = inputText.trim();
      const pendingMessageId = handleSend(
        messageContent,
        pendingMediaDraft.messageType,
        pendingMediaDraft.localUri,
        { deferEmit: true, replyTo: replyingTo ?? undefined },
      );

      if (!pendingMessageId) {
        return;
      }

      setInputText('');
      setPendingMediaSend({
        idempotencyKey: pendingMessageId,
        content: messageContent,
        messageType: pendingMediaDraft.messageType,
      });

      void (async () => {
        try {
          setIsUploadingMedia(true);
          const secureUrl = await uploadAssetToCloudinary(
            pendingMediaDraft.asset,
            pendingMediaDraft.uploadType,
          );

          if (!secureUrl) {
            throw new Error('Upload verify failed');
          }

          handleSend(
            messageContent,
            pendingMediaDraft.messageType,
            secureUrl,
            { idempotencyKey: pendingMessageId, replyTo: replyingTo ?? undefined },
          );

          setPendingMediaSend(null);
          setPendingMediaDraft(null);
        } catch (err) {
          console.error('Upload failed after send:', err);
          setMessages((prev) =>
            prev.filter(
              (message) => message.idempotencyKey !== pendingMessageId && message._id !== pendingMessageId,
            ),
          );
          setPendingMediaSend(null);
          openInfoDialog('Thông báo', 'Tải media thất bại. Vui lòng thử lại.', 'error');
        } finally {
          setIsUploadingMedia(false);
        }
      })();

      return;
    }

    if (!inputText.trim()) {
      return;
    }

    handleSend(undefined, 'text', undefined, { replyTo: replyingTo ?? undefined });
  }, [handleSend, inputText, isUploadingMedia, pendingMediaDraft, pendingMediaSend, replyingTo, uploadAssetToCloudinary]);

  const handleToggleComposerPicker = useCallback(() => {
    setShowComposerPicker((prev) => !prev);
    setComposerPickerTab('emoji');
  }, []);

  const handleSendComposerEmoji = useCallback((emoji: string) => {
    if (Boolean(pendingMediaSend) || isUploadingMedia) {
      return;
    }

    handleSend(emoji, 'text', undefined, { replyTo: replyingTo ?? undefined });
    setShowComposerPicker(false);
  }, [handleSend, isUploadingMedia, pendingMediaSend, replyingTo]);

  const handleSendComposerSticker = useCallback((mediaUrl: string) => {
    if (Boolean(pendingMediaSend) || isUploadingMedia) {
      return;
    }

    handleSend('', 'sticker', mediaUrl, { replyTo: replyingTo ?? undefined });
    setShowComposerPicker(false);
  }, [handleSend, isUploadingMedia, pendingMediaSend, replyingTo]);

  const handleRecall = async (messageId: string, idempotencyKey?: string) => {
    try {
      if (!conversationId) return;
      socketService.recallMessage(conversationId, messageId, idempotencyKey || generateUUID());
      setShowOptionsId(null);
      setActionMenuVisible(false);
      setActionMenuMessage(null);
    } catch (err) {
      console.error('Recall failed:', err);
    }
  };

  const handleDeleteForMe = async (messageId: string, idempotencyKey?: string) => {
    try {
      if (!conversationId) return;
      socketService.deleteMessageForMe(conversationId, messageId, idempotencyKey || generateUUID());
      setShowOptionsId(null);
      setActionMenuVisible(false);
      setActionMenuMessage(null);
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  // Mo forward modal cho tin nhan
  const handleOpenForward = useCallback((message: Message) => {
    setForwardMessageId(message._id);
    setForwardModalVisible(true);
    setActionMenuVisible(false);
    setActionMenuMessage(null);
  }, []);

  // Xu ly chuyen tiep tin nhan qua socket
  const handleForwardToConversation = useCallback((toConversationId: string) => {
    if (!forwardMessageId) return;
    socketService.emitForwardMessage(forwardMessageId, toConversationId, generateUUID());
    setForwardMessageId(null);
  }, [forwardMessageId]);

  // Mo action menu khi long-press tin nhan
  const openActionMenu = useCallback((message: Message) => {
    if (message.type === 'system-recall') return;
    setActionMenuMessage(message);
    setActionMenuVisible(true);
  }, []);

  // Dong action menu
  const closeActionMenu = useCallback(() => {
    setActionMenuVisible(false);
    setActionMenuMessage(null);
  }, []);

  // Reply tu action menu
  const handleReplyFromMenu = useCallback(() => {
    if (!actionMenuMessage) return;
    setReplyingTo({
      messageRef: resolveMessageRef(actionMenuMessage),
      messageId: actionMenuMessage._id,
      senderId: getSenderId(actionMenuMessage),
      senderDisplayName: getSenderName(actionMenuMessage) || undefined,
      contentPreview: actionMenuMessage.content?.slice(0, 80) || '[Media]',
      type: actionMenuMessage.type,
    });
    closeActionMenu();
  }, [actionMenuMessage, closeActionMenu]);

  const handleTextChange = (text: string) => {
    setInputText(text);

    if (!conversationId) return;

    if (!isTypingRef.current && text.length > 0) {
      socketService.startTyping(conversationId);
      isTypingRef.current = true;
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      if (isTypingRef.current) {
        socketService.stopTyping(conversationId);
        isTypingRef.current = false;
      }
    }, 2000);
  };

  const handleOpenMedia = useCallback(async (url?: string) => {
    if (!url) return;

    try {
      await Linking.openURL(url);
    } catch (err) {
      console.error('Cannot open media url', err);
    }
  }, []);

  const renderMessage = useCallback(
    ({ item: message }: { item: Message }) => {
      const isMe = getSenderId(message) === userId;
      const isSelected = showOptionsId === (message._id || message.idempotencyKey);
      const isGroupChat = isGroup === 'true';
      const isRecalled = message.type === 'system-recall';
      const fileName = getFileName(message.type, message.content);
      const summary = message.reactionSummary;
      const summaryTotalCount = summary?.totalCount || 0;
      const summaryEntries = Object.entries(summary?.emojiCounts || {})
        .filter(([_, count]) => count > 0)
        .sort((a, b) => b[1] - a[1]);
      const myReactionState = getReactionUserStateForMessage(message);
      const myLastEmoji = myReactionState?.lastEmoji || null;
      const showSummaryPill = summaryTotalCount > 0;
      const showReactionTrigger = Boolean(myLastEmoji);

      const isCallEvent = message.type === 'call' || message.type === 'call_history' || message.type === 'system' || (message.type === 'text' && message.content && message.content.toLowerCase().includes('cuộc gọi'));

      if (isCallEvent) {
        return (
          <CallHistoryBubble
            type={(message.content?.toLowerCase() || '').includes('video') ? 'video' : 'audio'}
            status={(message.content?.toLowerCase() || '').includes('nhỡ') || (message.content?.toLowerCase() || '').includes('nho') || (message.content?.toLowerCase() || '').includes('từ chối') ? 'missed' : 'completed'}
            time={formatTime(message.createdAt)}
            duration={(message.content?.match(/\d+s|\d+:\d+/) || [])[0]}
            isMe={isMe}
          />
        );
      }

      return (
        <View style={[bubbleStyles.row, isMe ? bubbleStyles.rowRight : bubbleStyles.rowLeft]}>
          {!isMe && (
            <View style={bubbleStyles.otherAvatar}>
              {getSenderAvatarUrl(message, groupMembers) ? (
                <Image source={{ uri: getSenderAvatarUrl(message, groupMembers) }} style={bubbleStyles.otherAvatarImage} resizeMode="cover" />
              ) : (
                <Text style={bubbleStyles.avatarLetter}>
                  {getSenderName(message, groupMembers).charAt(0).toUpperCase()}
                </Text>
              )}
            </View>
          )}

          <TouchableOpacity
            onLongPress={() => {
              if (!isRecalled) {
                openActionMenu(message);
              }
            }}
            delayLongPress={220}
            activeOpacity={message.type === 'video' ? 1 : 0.85}
            disabled={message.type === 'video'}
            style={bubbleStyles.messagePressable}
          >
            {!isMe && isGroupChat && (
              <Text style={bubbleStyles.senderName}>{getSenderName(message, groupMembers)}</Text>
            )}

            <View style={[
              bubbleStyles.bubble, 
              isMe ? bubbleStyles.bubbleMe : bubbleStyles.bubbleOther,
              (message.type === 'image' || message.type === 'video' || message.type === 'call' || message.type === 'call_history' || message.type === 'system' || (message.type === 'text' && message.content && parsePostPreview(message.content))) && { backgroundColor: 'transparent', paddingHorizontal: 0, paddingVertical: 0, borderWidth: 0 }
            ]}>
              {message.replyTo && message.replyTo.messageRef && (
                <Pressable
                  onPress={() => jumpToMessage(message.replyTo?.messageRef || '')}
                  style={[bubbleStyles.replyCard, isMe ? bubbleStyles.replyCardMe : bubbleStyles.replyCardOther]}
                >
                  <Text style={[bubbleStyles.replyLabel, isMe && bubbleStyles.replyLabelMe]}>Trả lời</Text>
                  {message.replyTo.senderDisplayName && (
                    <Text style={[bubbleStyles.replySenderName, isMe && bubbleStyles.replySenderNameMe]} numberOfLines={1}>
                      {message.replyTo.senderDisplayName}
                    </Text>
                  )}
                  <Text style={[bubbleStyles.replyPreview, isMe && bubbleStyles.replyPreviewMe]} numberOfLines={1}>
                    {message.replyTo.contentPreview || '[Tin nhắn]'}
                  </Text>
                </Pressable>
              )}

              {isRecalled ? (
                <Text style={[bubbleStyles.msgText, bubbleStyles.recallText, isMe && bubbleStyles.recallTextMe]}>
                  {isMe ? 'Bạn đã thu hồi tin nhắn' : 'Tin nhắn đã được thu hồi'}
                </Text>
              ) : message.type === 'text' && message.content ? (
                parsePostPreview(message.content) ? (
                  <MessagePreviewCard content={message.content} isMe={isMe} />
                ) : (
                  <Text style={[bubbleStyles.msgText, isMe && bubbleStyles.msgTextMe]}>{message.content}</Text>
                )
              ) : message.type === 'sticker' ? (
                message.mediaUrl ? (
                  <Pressable onPress={() => void handleOpenMedia(message.mediaUrl)}>
                    <Image source={{ uri: message.mediaUrl }} style={bubbleStyles.stickerImage} resizeMode="contain" />
                  </Pressable>
                ) : (
                  <Text style={bubbleStyles.stickerText}>{message.content || ':)'}</Text>
                )
              ) : message.type === 'image' ? (
                message.mediaUrl ? (
                  <Pressable onPress={() => { setSelectedMediaMessage(message); setShowMediaOverlay(true); }}>
                    <Image source={{ uri: message.mediaUrl }} style={bubbleStyles.mediaImage} resizeMode="cover" />
                  </Pressable>
                ) : (
                  <View style={bubbleStyles.mediaPlaceholder}>
                    <Ionicons name="image-outline" size={28} color={isMe ? '#111827' : '#94a3b8'} />
                    <Text style={[bubbleStyles.mediaLabel, isMe && bubbleStyles.mediaLabelMe]}>Ảnh</Text>
                  </View>
                )
              ) : message.type === 'video' ? (
                <VideoMessage mediaUrl={message.mediaUrl} isMe={isMe} onOpenMedia={handleOpenMedia} />
              ) : isFileType(message.type) ? (
                <Pressable
                  onPress={() => void handleOpenMedia(message.mediaUrl)}
                  style={[bubbleStyles.fileCard, isMe && bubbleStyles.fileCardMe]}
                >
                  <Ionicons name="document-outline" size={22} color={isMe ? '#0f172a' : '#94a3b8'} />
                  <View style={bubbleStyles.fileMeta}>
                    <Text style={[bubbleStyles.fileTitle, isMe && bubbleStyles.fileTitleMe]} numberOfLines={1}>
                      {fileName}
                    </Text>
                    <Text style={[bubbleStyles.fileAction, isMe && bubbleStyles.fileActionMe]}>
                      {message.mediaUrl ? 'Mở tệp' : 'Không có liên kết'}
                    </Text>
                  </View>
                </Pressable>
              ) : (
                <Text style={[bubbleStyles.msgText, isMe && bubbleStyles.msgTextMe]}>{message.content || '[Media]'}</Text>
              )}

              {message.type !== 'text'
                && message.type !== 'sticker'
                && message.type !== 'system-recall'
                && message.type !== 'call'
                && message.type !== 'call_history'
                && message.type !== 'system'
                && message.content
                && message.content.trim().length > 0 && (
                <Text style={[bubbleStyles.msgText, bubbleStyles.mediaCaptionText, isMe && bubbleStyles.msgTextMe]}>
                  {message.content}
                </Text>
              )}

              <View style={bubbleStyles.meta}>
                <Text style={[bubbleStyles.time, isMe && bubbleStyles.timeMe]}>
                  {formatTime(message.createdAt)}
                </Text>
                {isMe && (
                  <MessageReceiptIndicator
                    message={message}
                    onPressReadPreview={() => openStatusDetails(message)}
                  />
                )}
              </View>
            </View>

            {!isRecalled && (showSummaryPill || showReactionTrigger) && (
              <View style={[bubbleStyles.reactionRow, isMe ? bubbleStyles.reactionRowMe : bubbleStyles.reactionRowOther]}>
                {showSummaryPill && (
                  <Pressable
                    onPress={() => {
                      void openReactionDetailsSheet(message);
                    }}
                    style={bubbleStyles.summaryPill}
                  >
                    {summaryEntries.slice(0, 3).map(([emoji]) => (
                      <Text key={`${message._id}-${emoji}`} style={bubbleStyles.summaryEmoji}>{emoji}</Text>
                    ))}
                    <Text style={bubbleStyles.summaryCount}>{summaryTotalCount}</Text>
                  </Pressable>
                )}

                {showReactionTrigger && (
                  <Pressable
                    onPress={() => handleQuickAddFromTrigger(message)}
                    onLongPress={() => openReactionPicker(message)}
                    delayLongPress={220}
                    style={bubbleStyles.reactionTrigger}
                  >
                    <Text style={bubbleStyles.reactionTriggerText}>{myLastEmoji}</Text>
                  </Pressable>
                )}
              </View>
            )}
          </TouchableOpacity>
        </View>
      );
    },
    [
      getReactionUserStateForMessage,
      handleDeleteForMe,
      handleOpenMedia,
      openStatusDetails,
      handleQuickAddFromTrigger,
      handleRecall,
      isGroup,
      openReactionDetailsSheet,
      openReactionPicker,
      jumpToMessage,
      showOptionsId,
      userId,
    ],
  );

  const androidKeyboardOffset = Platform.OS === 'android'
    ? Math.max(0, keyboardHeight - insets.bottom)
    : 0;
  const previewTopOffset = insets.top - 50;

  const targetMessageReactionState = targetMessage ? getReactionUserStateForMessage(targetMessage) : undefined;
  const canClearTargetReaction = Boolean(targetMessageReactionState && targetMessageReactionState.totalCount > 0);

  const reactionSheetTabs = (reactionSheetData?.tabs || []).filter((tab) => tab.count > 0 || tab.emoji === 'ALL');
  const reactionSheetRows = (reactionSheetData?.rows || []).filter((row) => row.totalCount > 0);
  const selectedReactionSheetRows = reactionSheetTab === 'ALL'
    ? reactionSheetRows
    : reactionSheetRows.filter((row) => (row.emojiCounts?.[reactionSheetTab] || 0) > 0);

  const allMediaItems = messages.filter((message) => message.type === 'image' || message.type === 'video');
  const allFileItems = messages.filter((message) => isFileType(String(message.type)) || message.type === 'audio');
  const allLinkItems = messages.filter((message) => {
    const content = typeof message.content === 'string' ? message.content : '';
    return /(https?:\/\/|www\.)/i.test(content);
  });

  const closeReactionSheet = useCallback(() => {
    setReactionSheetVisible(false);
    setReactionSheetData(null);
    setReactionSheetTab('ALL');
  }, []);

  const isCurrentUserGroupCreator = Boolean(isGroupChat && userId && groupCreatorId && userId === groupCreatorId);
  const isCurrentUserGroupAdmin = Boolean(isGroupChat && userId && groupAdminIds.includes(userId));
  const canManageMemberRoles = isCurrentUserGroupCreator || isCurrentUserGroupAdmin;
  const openCallScreen = (callType: 'audio' | 'video') => {
    if (!conversationId) return;

    if (isGroupChat && groupMembers.length < 2) {
      openInfoDialog(
        'Không thể gọi nhóm',
        'Nhóm cần ít nhất 2 thành viên để bắt đầu cuộc gọi.',
        'error',
      );
      return;
    }

    let url = `/call-screen?conversationId=${conversationId}&type=${callType}&isGroup=${isGroupChat}`;
    if (!isGroupChat && targetUserId) url += `&targetUserId=${targetUserId}`;
    if (conversationName) url += `&name=${encodeURIComponent(conversationName)}`;
    if (conversationAvatarUrl) url += `&avatarUrl=${encodeURIComponent(conversationAvatarUrl)}`;
    router.push(url as any);
  };

  return (
    <LinearGradient
      colors={[colors.backgroundSoft, colors.backgroundMid, colors.backgroundDeep]}
      style={styles.safeArea}
    >
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 12 : 0}
        >
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <View style={styles.headerInfo}>
              <TouchableOpacity
                style={styles.headerAvatar}
                onPress={() => {
                  if (isGroupChat) {
                    void handleHeaderAvatarPress();
                    return;
                  }
                  openGroupInfoEditor();
                }}
                disabled={isSavingGroupInfo || isUploadingGroupAvatar}
              >
                {conversationAvatarUrl ? (
                  <Image source={{ uri: conversationAvatarUrl }} style={styles.headerAvatarImage} resizeMode="cover" />
                ) : (
                  <Text style={styles.headerAvatarText}>
                    {(conversationName || 'C').charAt(0).toUpperCase()}
                  </Text>
                )}
              </TouchableOpacity>
              <View>
                <TouchableOpacity
                  onPress={openGroupInfoEditor}
                  disabled={isSavingGroupInfo}
                >
                  <Text style={styles.headerName} numberOfLines={1}>
                    {conversationName || 'Chat'}
                  </Text>
                </TouchableOpacity>
                {typingUsers.length > 0 ? (
                  <Text style={styles.headerStatus}>đang nhập...</Text>
                ) : (
                  <Text style={styles.headerStatus}>Online</Text>
                )}
              </View>
            </View>
            <View style={styles.headerActions}>
              <TouchableOpacity style={styles.actionIcon} onPress={() => openCallScreen('audio')}>
                <Ionicons name="call-outline" size={22} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionIcon} onPress={() => openCallScreen('video')}>
                <Ionicons name="videocam-outline" size={22} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionIcon}
                onPress={openGroupInfoEditor}
              >
                <Ionicons name="information-circle-outline" size={22} color={lightTheme.accent} />
              </TouchableOpacity>
            </View>
          </View>

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <View style={{ gap: 16, width: '100%', padding: 16 }}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <SkeletonChatBubblePreset key={i} senderIsSelf={i % 2 === 1} />
                ))}
              </View>
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={(item, index) => item._id || item.idempotencyKey || String(index)}
              renderItem={renderMessage}
              contentContainerStyle={styles.messageList}
              showsVerticalScrollIndicator={false}
              initialNumToRender={12}
              maxToRenderPerBatch={8}
              windowSize={9}
              removeClippedSubviews
              onScroll={handleScrollList}
              onContentSizeChange={(_, height) => {
                const pending = preserveViewportRef.current;
                contentHeightRef.current = height;

                if (!pending) {
                  return;
                }

                preserveViewportRef.current = null;

                const delta = height - pending.contentHeight;
                if (delta <= 0) {
                  return;
                }

                flatListRef.current?.scrollToOffset({
                  offset: Math.max(0, pending.offset + delta),
                  animated: false,
                });
              }}
              scrollEventThrottle={16}
              onLayout={() => scrollToBottom(false)}
              onScrollToIndexFailed={() => {
                // Fallback when item layout has not been measured yet.
              }}
              ListHeaderComponent={isMoreLoading ? (
                <View style={styles.loadMoreIndicator}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              ) : null}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons name="chatbubble-ellipses-outline" size={64} color={lightTheme.textMuted} />
                  <Text style={styles.emptyText}>Chưa có tin nhắn nào</Text>
                  <Text style={styles.emptySubtext}>Hãy gửi lời chào đầu tiên!</Text>
                </View>
              }
            />
          )}

          <Modal
            visible={isGroupInfoOpen}
            transparent
            animationType="fade"
            onRequestClose={() => setIsGroupInfoOpen(false)}
          >
            <View style={styles.groupModalOverlay}>
              <View style={styles.groupModalCard}>
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.groupModalScrollContent}>
                <Text style={styles.groupModalTitle}>{isGroupChat ? 'Thông tin nhóm' : 'Thông tin hội thoại'}</Text>

                {!isGroupChat && (
                  <View style={styles.directInfoCard}>
                    <View style={styles.directInfoAvatarWrap}>
                      {conversationAvatarUrl ? (
                        <Image source={{ uri: conversationAvatarUrl }} style={styles.directInfoAvatar} resizeMode="cover" />
                      ) : (
                        <Text style={styles.directInfoAvatarText}>
                          {(conversationName || 'C').charAt(0).toUpperCase()}
                        </Text>
                      )}
                    </View>
                    <Text style={styles.directInfoName} numberOfLines={1}>{conversationName || 'Hội thoại'}</Text>
                    <Text style={styles.directInfoMeta}>Hội thoại cá nhân</Text>
                  </View>
                )}

                <View style={styles.groupActionRow}>
                  <TouchableOpacity
                    style={styles.groupActionItem}
                    onPress={() => {
                      if (conversationMutedUntil) {
                        void handleUnmuteConversation();
                        return;
                      }
                      handleMuteConversation();
                    }}
                  >
                    <Ionicons name={conversationMutedUntil ? 'notifications' : 'notifications-off'} size={18} color={lightTheme.accent} />
                    <Text style={styles.groupActionText}>{conversationMutedUntil ? 'Bật thông báo' : 'Tắt thông báo'}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.groupActionItem}
                    onPress={() => {
                      void handleToggleConversationPin();
                    }}
                  >
                    <Ionicons name={isConversationPinned ? 'pin' : 'pin-outline'} size={18} color={lightTheme.accent} />
                    <Text style={styles.groupActionText}>{isConversationPinned ? 'Bỏ ghim' : 'Ghim hội thoại'}</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.groupActionRow}>
                  <TouchableOpacity
                    style={styles.groupActionItem}
                    onPress={() => {
                      setArchiveTab('media');
                      setIsArchiveOpen(true);
                    }}
                  >
                    <Ionicons name="images-outline" size={18} color={lightTheme.accent} />
                    <Text style={styles.groupActionText}>Ảnh/Video</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.groupActionItem}
                    onPress={() => {
                      setArchiveTab('files');
                      setIsArchiveOpen(true);
                    }}
                  >
                    <Ionicons name="document-text-outline" size={18} color={lightTheme.accent} />
                    <Text style={styles.groupActionText}>File</Text>
                  </TouchableOpacity>
                </View>

                {isGroupChat && (
                  <>
                    <TouchableOpacity
                      style={styles.groupAvatarPicker}
                      onPress={() => {
                        void handlePickGroupAvatar();
                      }}
                      disabled={isUploadingGroupAvatar || isSavingGroupInfo}
                    >
                      {groupAvatarDraft ? (
                        <Image source={{ uri: groupAvatarDraft }} style={styles.groupAvatarPreview} resizeMode="cover" />
                      ) : (
                        <Text style={styles.groupAvatarPlaceholder}>
                          {(groupNameDraft || conversationName || 'N').charAt(0).toUpperCase()}
                        </Text>
                      )}
                      <View style={styles.groupAvatarCameraBadge}>
                        {isUploadingGroupAvatar ? (
                          <ActivityIndicator size="small" color={lightTheme.textPrimary} />
                        ) : (
                          <Ionicons name="camera-outline" size={14} color={lightTheme.textPrimary} />
                        )}
                      </View>
                    </TouchableOpacity>

                    <TextInput
                      style={styles.groupNameInput}
                      value={groupNameDraft}
                      onChangeText={setGroupNameDraft}
                      placeholder="Nhập tên nhóm"
                      placeholderTextColor="#94a3b8"
                      maxLength={100}
                      editable={!isSavingGroupInfo}
                    />
                  </>
                )}

                {isGroupChat && (
                  <View style={styles.memberRoleSection}>
                    <Text style={styles.memberRoleTitle}>Thành viên nhóm</Text>
                    <ScrollView style={styles.memberRoleList} nestedScrollEnabled>
                      {groupMembers.map((member) => {
                        const isCreator = groupCreatorId === member._id;
                        const isAdmin = groupAdminIds.includes(member._id);
                        const isMe = member._id === userId;
                        return (
                          <View key={member._id} style={styles.memberRoleItem}>
                            <View style={styles.memberRoleInfo}>
                              <Text style={styles.memberRoleName} numberOfLines={1}>
                                {member.displayName}{isMe ? ' (Bạn)' : ''}
                              </Text>
                              <Text style={styles.memberRoleMeta}>
                                {isCreator ? 'Trưởng nhóm' : isAdmin ? 'Quản trị viên' : 'Thành viên'}
                              </Text>
                            </View>
                            {canManageMemberRoles && !isCreator && (
                              <View style={styles.memberRoleActions}>
                                <TouchableOpacity
                                  style={styles.memberRoleAction}
                                  onPress={() => {
                                    void handleAssignMemberRole(member._id, isAdmin ? 'member' : 'admin');
                                  }}
                                  disabled={isUpdatingMemberRole}
                                >
                                  <Text style={styles.memberRoleActionText}>{isAdmin ? 'Gỡ quyền' : 'Gán quyền'}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={styles.memberRemoveAction}
                                  onPress={() => {
                                    void handleRemoveMember(member._id, member.displayName);
                                  }}
                                  disabled={isUpdatingMemberRole}
                                >
                                  <Text style={styles.memberRemoveActionText}>Xóa</Text>
                                </TouchableOpacity>
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}

                <View style={styles.groupModalActions}>
                  <TouchableOpacity
                    style={[styles.groupModalButton, styles.groupModalCancelButton]}
                    onPress={() => setIsGroupInfoOpen(false)}
                    disabled={isSavingGroupInfo}
                  >
                    <Text style={styles.groupModalCancelText}>Đóng</Text>
                  </TouchableOpacity>
                  {isGroupChat && (
                    <TouchableOpacity
                      style={[styles.groupModalButton, styles.groupModalSaveButton, isSavingGroupInfo && { opacity: 0.7 }]}
                      onPress={() => {
                        void handleSaveGroupInfo();
                      }}
                      disabled={isSavingGroupInfo || isUploadingGroupAvatar}
                    >
                      {isSavingGroupInfo ? (
                        <ActivityIndicator size="small" color={lightTheme.textPrimary} />
                      ) : (
                        <Text style={styles.groupModalSaveText}>Lưu</Text>
                      )}
                    </TouchableOpacity>
                  )}
                </View>

                {isGroupChat && (
                  <TouchableOpacity style={styles.leaveGroupButton} onPress={() => { void handleLeaveGroup(); }}>
                    <Ionicons name="exit-outline" size={16} color={lightTheme.danger} style={{ marginRight: 6 }} />
                    <Text style={styles.leaveGroupText}>Rời nhóm</Text>
                  </TouchableOpacity>
                )}
                </ScrollView>
              </View>
            </View>
          </Modal>

          <Modal
            visible={statusDetailsVisible}
            transparent
            animationType="fade"
            onRequestClose={closeStatusDetails}
          >
            <View style={styles.sheetOverlay}>
              <View style={[styles.sheetCard, styles.statusDetailsCard]}>
                <View style={styles.sheetHeader}>
                    <Text style={styles.sheetTitle}>Thống kê đã xem</Text>
                  <TouchableOpacity style={styles.sheetCloseBtn} onPress={closeStatusDetails}>
                    <Text style={styles.sheetCloseText}>Đóng</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.statusSection}>
                  <Text style={styles.statusSectionTitle}>
                    Đã xem ({statusDetailsMessage?.readBy?.length || 0})
                  </Text>
                  {(statusDetailsMessage?.readBy?.length || 0) === 0 ? (
                    <Text style={styles.statusEmptyText}>Chưa có ai đã xem.</Text>
                  ) : (
                    <ScrollView style={styles.statusList}>
                      {(statusDetailsMessage?.readBy || []).map((item) => (
                        <View key={`read-${item.userId}`} style={styles.statusRow}>
                          {item.avatarUrl ? (
                            <Image source={{ uri: item.avatarUrl }} style={styles.statusAvatar} />
                          ) : (
                            <View style={[styles.statusAvatar, styles.statusAvatarFallback]}>
                              <Text style={styles.statusAvatarText}>
                                {(item.displayName || 'U').slice(0, 1).toUpperCase()}
                              </Text>
                            </View>
                          )}
                          <View style={styles.statusInfo}>
                            <Text style={styles.statusName}>{item.displayName}</Text>
                            <Text style={styles.statusMeta}>
                              {new Date(item.readAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </ScrollView>
                  )}
                </View>

                <View style={styles.statusSection}>
                  <Text style={styles.statusSectionTitle}>
                    Chưa đọc ({statusDetailsMessage?.sentTo?.length || 0})
                  </Text>
                  {(statusDetailsMessage?.sentTo?.length || 0) === 0 ? (
                    <Text style={styles.statusEmptyText}>Tất cả đã đọc.</Text>
                  ) : (
                    <ScrollView style={styles.statusList}>
                      {(statusDetailsMessage?.sentTo || []).map((item) => (
                        <View key={`sent-${item.userId}`} style={styles.statusRow}>
                          {item.avatarUrl ? (
                            <Image source={{ uri: item.avatarUrl }} style={styles.statusAvatar} />
                          ) : (
                            <View style={[styles.statusAvatar, styles.statusAvatarFallback]}>
                              <Text style={styles.statusAvatarText}>
                                {(item.displayName || 'U').slice(0, 1).toUpperCase()}
                              </Text>
                            </View>
                          )}
                          <View style={styles.statusInfo}>
                            <Text style={styles.statusName}>{item.displayName}</Text>
                          </View>
                        </View>
                      ))}
                    </ScrollView>
                  )}
                </View>
              </View>
            </View>
          </Modal>

          <Modal
            visible={isArchiveOpen}
            transparent
            animationType="slide"
            onRequestClose={() => setIsArchiveOpen(false)}
          >
            <View style={styles.groupModalOverlay}>
              <View style={[styles.groupModalCard, styles.archiveModalCard]}>
                <View style={styles.archiveHeaderRow}>
                  <Text style={styles.groupModalTitle}>Kho lưu trữ</Text>
                  <TouchableOpacity onPress={() => setIsArchiveOpen(false)}>
                    <Text style={styles.groupModalCancelText}>Đóng</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.archiveTabRow}>
                  <TouchableOpacity style={[styles.archiveTab, archiveTab === 'media' && styles.archiveTabActive]} onPress={() => setArchiveTab('media')}><Text style={styles.archiveTabText}>Ảnh/Video</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.archiveTab, archiveTab === 'files' && styles.archiveTabActive]} onPress={() => setArchiveTab('files')}><Text style={styles.archiveTabText}>File</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.archiveTab, archiveTab === 'links' && styles.archiveTabActive]} onPress={() => setArchiveTab('links')}><Text style={styles.archiveTabText}>Liên kết</Text></TouchableOpacity>
                </View>

                <ScrollView style={styles.archiveBody}>
                  {archiveTab === 'media' && (
                    <View style={styles.archiveMediaGrid}>
                      {allMediaItems.length === 0 && <Text style={styles.archiveEmptyText}>Chưa có ảnh/video.</Text>}
                      {allMediaItems.map((item) => (
                        <View key={item._id} style={styles.archiveMediaItem}>
                          {item.type === 'image' ? (
                            <TouchableOpacity style={{ flex: 1 }} onPress={() => { setSelectedMediaMessage(item); setShowMediaOverlay(true); }}>
                              <Image source={{ uri: item.mediaUrl }} style={styles.archiveMediaImage} resizeMode="cover" />
                            </TouchableOpacity>
                          ) : (
                            <ArchiveVideoItem mediaUrl={item.mediaUrl} />
                          )}
                        </View>
                      ))}
                    </View>
                  )}

                  {archiveTab === 'files' && (
                    <View style={styles.archiveList}>
                      {allFileItems.length === 0 && <Text style={styles.archiveEmptyText}>Chưa có file nào.</Text>}
                      {allFileItems.map((item) => (
                        <TouchableOpacity key={item._id} style={styles.archiveListItem} onPress={() => handleOpenMedia(item.mediaUrl)}>
                          <Text style={styles.archiveListText}>{getFileName(item.type, item.content)}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {archiveTab === 'links' && (
                    <View style={styles.archiveList}>
                      {allLinkItems.length === 0 && <Text style={styles.archiveEmptyText}>Chưa có liên kết nào.</Text>}
                      {allLinkItems.map((item) => (
                        <TouchableOpacity key={item._id} style={styles.archiveListItem} onPress={() => {
                          const content = item.content || '';
                          void Linking.openURL(content.startsWith('http') ? content : `https://${content}`);
                        }}>
                          <Text style={styles.archiveListText}>{item.content || ''}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </ScrollView>
              </View>
            </View>
          </Modal>

          <Modal
            visible={isMuteDurationModalOpen}
            transparent
            animationType="fade"
            onRequestClose={() => setIsMuteDurationModalOpen(false)}
          >
            <View style={styles.groupModalOverlay}>
              <View style={styles.dialogCard}>
                <Text style={styles.dialogTitle}>Tắt thông báo</Text>
                <Text style={styles.dialogMessage}>Chọn thời gian tắt thông báo hội thoại:</Text>

                <View style={styles.dialogActionsColumn}>
                  <TouchableOpacity
                    style={styles.dialogOptionButton}
                    onPress={() => {
                      void muteConversationWithDuration('1h');
                      setIsMuteDurationModalOpen(false);
                    }}
                  >
                    <Text style={styles.dialogOptionText}>Trong 1h</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.dialogOptionButton}
                    onPress={() => {
                      void muteConversationWithDuration('4h');
                      setIsMuteDurationModalOpen(false);
                    }}
                  >
                    <Text style={styles.dialogOptionText}>Trong 4h</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.dialogOptionButton}
                    onPress={() => {
                      void muteConversationWithDuration('8h');
                      setIsMuteDurationModalOpen(false);
                    }}
                  >
                    <Text style={styles.dialogOptionText}>Trong 8h</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.dialogOptionButton}
                    onPress={() => {
                      void muteConversationWithDuration('until_enabled');
                      setIsMuteDurationModalOpen(false);
                    }}
                  >
                    <Text style={styles.dialogOptionText}>Cho đến khi tôi bật lại</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[styles.dialogButton, styles.dialogCancelButton]}
                  onPress={() => setIsMuteDurationModalOpen(false)}
                >
                  <Text style={styles.dialogCancelText}>Đóng</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          <Modal
            visible={appDialog.visible}
            transparent
            animationType="fade"
            onRequestClose={closeInfoDialog}
          >
            <View style={styles.groupModalOverlay}>
              <View style={styles.dialogCard}>
                <Text style={[styles.dialogTitle, appDialog.tone === 'error' && styles.dialogTitleError]}>{appDialog.title}</Text>
                <Text style={[styles.dialogMessage, appDialog.tone === 'error' && styles.dialogMessageError]}>{appDialog.message}</Text>

                <View style={styles.dialogFooterRow}>
                  {appDialog.mode === 'confirm' && (
                    <TouchableOpacity
                      style={[styles.dialogButton, styles.dialogCancelButton]}
                      onPress={closeInfoDialog}
                    >
                      <Text style={styles.dialogCancelText}>{appDialog.cancelLabel || 'Hủy'}</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={[styles.dialogButton, appDialog.tone === 'error' ? styles.dialogDangerButton : styles.dialogPrimaryButton]}
                    onPress={appDialog.mode === 'confirm' ? handleDialogConfirm : closeInfoDialog}
                  >
                    <Text style={styles.dialogPrimaryText}>{appDialog.confirmLabel || 'Đóng'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

          <MessagePreviewOverlay
            previews={previews}
            onDismiss={dismissPreview}
            onPauseDismiss={pauseDismiss}
            onResumeDismiss={resumeDismiss}
            onQuickReply={quickReply}
            topOffset={previewTopOffset}
            onNavigate={(targetConversationId) => {
              router.replace({
                pathname: '/chat-room',
                params: {
                  conversationId: targetConversationId,
                  name: 'Chat',
                  isGroup: 'false',
                },
              });
            }}
          />

          <View style={[styles.composerContainer, { marginBottom: androidKeyboardOffset }]}>
            <TypingIndicator typingUsers={typingUsers} />

            {replyingTo && (
              <View style={styles.replyComposerBar}>
                <View style={styles.replyComposerMeta}>
                  <Text style={styles.replyComposerLabel}>Đang trả lời</Text>
                  <Text style={styles.replyComposerPreview} numberOfLines={1}>
                    {replyingTo.contentPreview || '[Tin nhắn]'}
                  </Text>
                </View>
                <TouchableOpacity style={styles.replyComposerCancelBtn} onPress={() => setReplyingTo(null)}>
                  <Ionicons name="close" size={16} color="#cbd5e1" />
                </TouchableOpacity>
              </View>
            )}

            {pendingMediaDraft && (
              <View style={styles.mediaDraftBar}>
                {pendingMediaDraft.messageType === 'image' ? (
                  <Image source={{ uri: pendingMediaDraft.localUri }} style={styles.mediaDraftPreview} resizeMode="cover" />
                ) : (
                  <View style={styles.mediaDraftVideoCard}>
                    <Ionicons name="videocam-outline" size={18} color="#cbd5e1" />
                    <Text style={styles.mediaDraftVideoText}>Video đã chọn</Text>
                  </View>
                )}

                <View style={styles.mediaDraftMeta}>
                  <Text style={styles.mediaDraftTitle} numberOfLines={1}>
                    {pendingMediaDraft.messageType === 'image' ? 'Ảnh đính kèm' : 'Video đính kèm'}
                  </Text>
                  <Text style={styles.mediaDraftStatus}>
                    {pendingMediaSend
                      ? isUploadingMedia
                        ? 'Đang tải sau khi gửi'
                        : 'Đang gửi tin nhắn'
                      : 'Sẵn sàng gửi'}
                  </Text>
                </View>

                {!pendingMediaSend && !isUploadingMedia && (
                  <TouchableOpacity
                    style={styles.mediaDraftRemoveBtn}
                    onPress={() => {
                      setPendingMediaDraft(null);
                    }}
                  >
                    <Ionicons name="close" size={16} color="#e2e8f0" />
                  </TouchableOpacity>
                )}
              </View>
            )}

            {showComposerPicker && (
              <View style={[styles.composerPickerWrap, { marginBottom: 16 }]}>
                <View style={styles.composerPickerTabs}>
                  <TouchableOpacity
                    style={[
                      styles.composerPickerTab,
                      composerPickerTab === 'emoji' ? styles.composerPickerTabActive : null,
                    ]}
                    onPress={() => setComposerPickerTab('emoji')}
                  >
                    <Text
                      style={[
                        styles.composerPickerTabText,
                        composerPickerTab === 'emoji' ? styles.composerPickerTabTextActive : null,
                      ]}
                    >
                      Emoji
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.composerPickerTab,
                      composerPickerTab === 'sticker' ? styles.composerPickerTabActive : null,
                    ]}
                    onPress={() => setComposerPickerTab('sticker')}
                  >
                    <Text
                      style={[
                        styles.composerPickerTabText,
                        composerPickerTab === 'sticker' ? styles.composerPickerTabTextActive : null,
                      ]}
                    >
                      Sticker
                    </Text>
                  </TouchableOpacity>
                </View>

                {composerPickerTab === 'emoji' ? (
                  <View style={styles.quickEmojiPanel}>
                    {QUICK_EMOJIS.map((emoji) => (
                      <TouchableOpacity
                        key={emoji}
                        style={styles.quickEmojiBtn}
                        onPress={() => handleSendComposerEmoji(emoji)}
                      >
                        <Text style={styles.quickEmojiText}>{emoji}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : (
                  <StickerPicker
                    isOpen={showComposerPicker && composerPickerTab === 'sticker'}
                    onSelectSticker={handleSendComposerSticker}
                  />
                )}
              </View>
            )}

            <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom + 14, 22) }]}>
              <TouchableOpacity
                style={styles.inputAction}
                onPress={() => {
                  void handlePickImage();
                }}
                disabled={isUploadingMedia || Boolean(pendingMediaSend)}
              >
                {isUploadingMedia ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Ionicons name="add-circle-outline" size={26} color={colors.textMuted} />
                )}
              </TouchableOpacity>

              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.textInput}
                  placeholder="Nhập tin nhắn..."
                  placeholderTextColor={colors.textMuted}
                  value={inputText}
                  onChangeText={handleTextChange}
                  onFocus={() => setShowComposerPicker(false)}
                  multiline
                  maxLength={2000}
                />
                <TouchableOpacity
                  style={styles.emojiBtn}
                  onPress={handleToggleComposerPicker}
                  disabled={Boolean(pendingMediaSend) || isUploadingMedia}
                >
                  <Ionicons name="happy-outline" size={22} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              {inputText.trim() || pendingMediaDraft ? (
                <TouchableOpacity
                  style={[styles.sendBtn, pendingMediaSend ? styles.sendBtnDisabled : null]}
                  onPress={handleComposerSend}
                  disabled={Boolean(pendingMediaSend)}
                >
                  <Ionicons name="send" size={20} color={colors.textOnAccent} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.micBtn} disabled>
                  <Ionicons name="mic-outline" size={24} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          <Modal
            visible={reactionPickerVisible}
            transparent
            animationType="fade"
            onRequestClose={closeReactionPicker}
          >
            <Pressable style={styles.reactionOverlay} onPress={closeReactionPicker}>
              <Pressable style={styles.reactionPickerCard} onPress={(event) => event.stopPropagation()}>
                <View style={styles.reactionEmojiRow}>
                  {REACTION_EMOJIS.map((emoji) => (
                    <Pressable
                      key={emoji}
                      style={styles.reactionEmojiButton}
                      onPress={() => handlePickReaction(emoji)}
                    >
                      <Text style={styles.reactionEmojiText}>{emoji}</Text>
                    </Pressable>
                  ))}
                </View>

                {canClearTargetReaction && targetMessage && (
                  <Pressable
                    style={styles.reactionClearButton}
                    onPress={() => {
                      sendReactionRemoveAllMine(targetMessage);
                      closeReactionPicker();
                    }}
                  >
                    <Text style={styles.reactionClearText}>Xóa cảm xúc của tôi</Text>
                  </Pressable>
                )}

                {targetMessage && (
                  <View style={styles.reactionActionRow}>
                    <Pressable
                      style={styles.reactionActionButton}
                      onPress={() => {
                        const senderNameFromMessage = getSenderName(targetMessage);
                        const inferredReplySenderDisplayName = senderNameFromMessage
                          || (getSenderId(targetMessage) === userId
                            ? 'Ban'
                            : (!isGroupChat ? conversationName : 'Thanh vien'));

                        setReplyingTo({
                          messageRef: targetMessage.idempotencyKey || targetMessage._id,
                          messageId: targetMessage._id,
                          senderId: getSenderId(targetMessage),
                          senderDisplayName: inferredReplySenderDisplayName,
                          contentPreview: String(targetMessage.content || '').slice(0, 160),
                          type: targetMessage.type,
                          isDeleted: false,
                        });
                        closeReactionPicker();
                      }}
                    >
                      <Ionicons name="return-up-back-outline" size={16} color="#e2e8f0" />
                      <Text style={styles.reactionActionText}>Trả lời</Text>
                    </Pressable>

                    <Pressable
                      style={styles.reactionActionButton}
                      onPress={() => {
                        void handleRecall(targetMessage._id, targetMessage.idempotencyKey);
                        closeReactionPicker();
                      }}
                    >
                      <Ionicons name="reload-outline" size={16} color="#e2e8f0" />
                      <Text style={styles.reactionActionText}>Thu hồi</Text>
                    </Pressable>

                    <Pressable
                      style={[styles.reactionActionButton, styles.reactionActionButtonDanger]}
                      onPress={() => {
                        void handleDeleteForMe(targetMessage._id, targetMessage.idempotencyKey);
                        closeReactionPicker();
                      }}
                    >
                      <Ionicons name="trash-outline" size={16} color="#fecaca" />
                      <Text style={[styles.reactionActionText, styles.reactionActionTextDanger]}>Xóa</Text>
                    </Pressable>
                  </View>
                )}
              </Pressable>
            </Pressable>
          </Modal>

          <Modal
            visible={reactionSheetVisible}
            transparent
            animationType="slide"
            onRequestClose={closeReactionSheet}
          >
            <View style={styles.sheetOverlay}>
              <Pressable style={styles.sheetBackdrop} onPress={closeReactionSheet} />

              <View style={[styles.sheetContainer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
                <View style={styles.sheetContent}>
                  <View style={styles.sheetHeader}>
                    <Text style={styles.sheetTitle}>Chi tiết cảm xúc</Text>
                    <TouchableOpacity
                      style={styles.sheetCloseBtn}
                      onPress={closeReactionSheet}
                    >
                      <Text style={styles.sheetCloseText}>Đóng</Text>
                    </TouchableOpacity>
                  </View>

                  {reactionSheetLoading ? (
                    <View style={styles.sheetLoadingBox}>
                      <ActivityIndicator size="small" color="#10b981" />
                      <Text style={styles.sheetLoadingText}>Đang tải...</Text>
                    </View>
                  ) : (
                    <>
                      <ScrollView
                        style={styles.sheetTabsScroll}
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.sheetTabsRow}
                      >
                        {reactionSheetTabs.map((tab) => {
                          const selected = reactionSheetTab === tab.emoji;
                          return (
                            <Pressable
                              key={tab.emoji}
                              onPress={() => setReactionSheetTab(tab.emoji)}
                              style={[styles.sheetTabPill, selected && styles.sheetTabPillActive]}
                            >
                              <Text style={[styles.sheetTabText, selected && styles.sheetTabTextActive]}>
                                {tab.emoji === 'ALL' ? `Tất cả ${tab.count}` : `${tab.emoji} ${tab.count}`}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </ScrollView>

                      <ScrollView style={styles.sheetRowsScroll} contentContainerStyle={styles.sheetRowsContent}>
                        {selectedReactionSheetRows.length === 0 ? (
                          <Text style={styles.sheetEmptyText}>Chưa có cảm xúc.</Text>
                        ) : (
                          selectedReactionSheetRows.map((row) => (
                            <View key={row.userId} style={styles.sheetRowItem}>
                              <View style={styles.sheetAvatarCircle}>
                                <Text style={styles.sheetAvatarText}>
                                  {(row.displayName || '?').slice(0, 1).toUpperCase()}
                                </Text>
                              </View>

                              <View style={styles.sheetRowBody}>
                                <Text style={styles.sheetRowName}>{row.displayName}</Text>
                                <View style={styles.sheetRowEmojiWrap}>
                                  {Object.entries(row.emojiCounts || {})
                                    .filter(([_, count]) => count > 0)
                                    .map(([emoji, count]) => (
                                      <View key={`${row.userId}-${emoji}`} style={styles.sheetRowEmojiPill}>
                                        <Text style={styles.sheetRowEmojiPillText}>{emoji} {count}</Text>
                                      </View>
                                    ))}
                                </View>
                              </View>

                              <Text style={styles.sheetRowCount}>{row.totalCount} lần</Text>
                            </View>
                          ))
                        )}
                      </ScrollView>
                    </>
                  )}
                </View>
              </View>
            </View>
          </Modal>

          {/* Action Menu Modal – hien khi long-press tin nhan */}
          <Modal
            visible={actionMenuVisible}
            animationType="slide"
            transparent
            onRequestClose={closeActionMenu}
          >
            <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={closeActionMenu}>
              <View style={{ flex: 1 }} />
              <Pressable
                onPress={(e) => e.stopPropagation()}
                style={{
                  backgroundColor: '#fff',
                  borderTopLeftRadius: 20,
                  borderTopRightRadius: 20,
                  paddingHorizontal: 16,
                  paddingTop: 16,
                  paddingBottom: Math.max(insets.bottom, 24),
                }}
              >
                <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#d1d5db', alignSelf: 'center', marginBottom: 16 }} />
                <Text style={{ fontSize: 15, fontWeight: '600', color: '#1e293b', marginBottom: 14, fontFamily: 'BeVietnamPro_600SemiBold' }}>
                  Tùy chọn tin nhắn
                </Text>

                {/* Phan hoi */}
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 13, gap: 14 }}
                  onPress={handleReplyFromMenu}
                >
                  <Ionicons name="return-up-back-outline" size={20} color="#3b82f6" />
                  <Text style={{ fontSize: 15, color: '#1e293b', fontFamily: 'BeVietnamPro_500Medium' }}>Trả lời</Text>
                </TouchableOpacity>

                {/* Cam xuc */}
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 13, gap: 14 }}
                  onPress={() => {
                    if (actionMenuMessage) {
                      openReactionPicker(actionMenuMessage);
                    }
                    closeActionMenu();
                  }}
                >
                  <Ionicons name="happy-outline" size={20} color="#f59e0b" />
                  <Text style={{ fontSize: 15, color: '#1e293b', fontFamily: 'BeVietnamPro_500Medium' }}>Thả cảm xúc</Text>
                </TouchableOpacity>

                {/* Chuyen tiep */}
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 13, gap: 14 }}
                  onPress={() => {
                    if (actionMenuMessage) handleOpenForward(actionMenuMessage);
                  }}
                >
                  <Ionicons name="arrow-redo-outline" size={20} color="#8b5cf6" />
                  <Text style={{ fontSize: 15, color: '#1e293b', fontFamily: 'BeVietnamPro_500Medium' }}>Chuyển tiếp</Text>
                </TouchableOpacity>

                {/* Xoa cho toi */}
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 13, gap: 14 }}
                  onPress={() => {
                    if (actionMenuMessage) {
                      void handleDeleteForMe(actionMenuMessage._id, actionMenuMessage.idempotencyKey);
                    }
                  }}
                >
                  <Ionicons name="eye-off-outline" size={20} color="#64748b" />
                  <Text style={{ fontSize: 15, color: '#1e293b', fontFamily: 'BeVietnamPro_500Medium' }}>Xóa cho tôi</Text>
                </TouchableOpacity>

                {/* Thu hoi – chi hien cho tin nhan cua chinh minh */}
                {actionMenuMessage && getSenderId(actionMenuMessage) === userId && (
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 13, gap: 14 }}
                    onPress={() => {
                      void handleRecall(actionMenuMessage._id, actionMenuMessage.idempotencyKey);
                    }}
                  >
                    <Ionicons name="close-circle-outline" size={20} color="#ef4444" />
                    <Text style={{ fontSize: 15, color: '#ef4444', fontFamily: 'BeVietnamPro_500Medium' }}>Thu hồi</Text>
                  </TouchableOpacity>
                )}

                {/* Huy */}
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 13, marginTop: 4, backgroundColor: '#f1f5f9', borderRadius: 12 }}
                  onPress={closeActionMenu}
                >
                  <Text style={{ fontSize: 15, color: '#64748b', fontFamily: 'BeVietnamPro_500Medium' }}>Hủy</Text>
                </TouchableOpacity>
              </Pressable>
            </Pressable>
          </Modal>

          {/* Forward Modal */}
          <ForwardModal
            visible={forwardModalVisible}
            messageId={forwardMessageId}
            currentConversationId={conversationId || ''}
            onClose={() => {
              setForwardModalVisible(false);
              setForwardMessageId(null);
            }}
            onForward={handleForwardToConversation}
          />

          {/* Media Fullscreen Modal */}
          <Modal
            visible={!!selectedMediaMessage}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setSelectedMediaMessage(null)}
          >
            <Pressable
              style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' }}
              onPress={() => setShowMediaOverlay(!showMediaOverlay)}
            >
              {selectedMediaMessage?.mediaUrl && (
                <Image
                  source={{ uri: selectedMediaMessage.mediaUrl }}
                  style={{ width: '100%', height: '100%' }}
                  resizeMode="contain"
                />
              )}

              {showMediaOverlay && selectedMediaMessage && (() => {
                const sId = getSenderId(selectedMediaMessage);
                const sTemp = groupMembers.find(u => u._id === sId);
                const displayName = sId === userId ? (userInfo?.displayName || 'Tôi') : (sTemp?.displayName || getSenderName(selectedMediaMessage) || 'Người dùng');
                const avatar = sId === userId ? (userInfo as any)?.avatarUrl : sTemp?.avatarUrl;

                return (
                  <>
                    <TouchableOpacity
                      style={{ position: 'absolute', top: Math.max(insets.top, 20), right: 20, zIndex: 10, padding: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 24 }}
                      onPress={(e) => { e.stopPropagation(); setSelectedMediaMessage(null); }}
                    >
                      <Ionicons name="close" size={28} color="#fff" />
                    </TouchableOpacity>
                    
                    <View style={{ position: 'absolute', bottom: Math.max(insets.bottom, 20), left: 0, right: 0, paddingHorizontal: 20, paddingVertical: 16, backgroundColor: 'rgba(0,0,0,0.5)', flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#334155', justifyContent: 'center', alignItems: 'center', marginRight: 12, overflow: 'hidden' }}>
                        {avatar ? (
                          <Image source={{ uri: avatar }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                        ) : (
                          <Text style={{ color: '#fff', fontSize: 18, fontFamily: 'BeVietnamPro_600SemiBold' }}>
                            {displayName.charAt(0).toUpperCase() || '?'}
                          </Text>
                        )}
                      </View>
                      <View>
                        <Text style={{ color: '#fff', fontSize: 16, fontFamily: 'BeVietnamPro_600SemiBold' }}>
                          {displayName}
                        </Text>
                        <Text style={{ color: '#94a3b8', fontSize: 13, fontFamily: 'BeVietnamPro_400Regular', marginTop: 2 }}>
                          {formatTime(selectedMediaMessage.createdAt)}
                        </Text>
                      </View>
                    </View>
                  </>
                );
              })()}
            </Pressable>
          </Modal>

        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const bubbleStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  rowLeft: {
    justifyContent: 'flex-start',
  },
  rowRight: {
    justifyContent: 'flex-end',
  },
  messagePressable: {
    maxWidth: '75%',
  },
  otherAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: lightTheme.bgHover,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    marginTop: 16,
    overflow: 'hidden',
  },
  otherAvatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
  },
  avatarLetter: {
    color: lightTheme.textSecondary,
    fontFamily: 'BeVietnamPro_600SemiBold',
    fontSize: 13,
  },
  senderName: {
    color: lightTheme.textTertiary,
    fontSize: 11,
    fontFamily: 'BeVietnamPro_500Medium',
    marginBottom: 2,
    marginLeft: 12,
  },
  bubble: {
    borderRadius: radius.card,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 60,
  },
  bubbleMe: {
    backgroundColor: lightTheme.accent,
    borderBottomRightRadius: 8,
  },
  bubbleOther: {
    backgroundColor: lightTheme.surface,
    borderBottomLeftRadius: 8,
    borderWidth: 1,
    borderColor: lightTheme.border,
    ...shadows.soft,
  },
  replyCard: {
    borderRadius: 12,
    borderLeftWidth: 3,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 8,
  },
  replyCardMe: {
    borderLeftColor: 'rgba(255,255,255,0.75)',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  replyCardOther: {
    borderLeftColor: lightTheme.accent,
    backgroundColor: lightTheme.bgHover,
  },
  replyLabel: {
    fontSize: 11,
    color: lightTheme.textOnAccent,
    fontFamily: fonts.semiBold,
    marginBottom: 1,
  },
  replyLabelMe: {
    color: 'rgba(255,255,255,0.8)',
  },
  replySenderName: {
    fontSize: 11,
    color: colors.accentSoft,
    fontFamily: 'BeVietnamPro_600SemiBold',
    marginBottom: 1,
  },
  replySenderNameMe: {
    color: colors.textOnAccent,
  },
  replyPreview: {
    fontSize: 12,
    color: colors.textSubtle,
    fontFamily: 'BeVietnamPro_400Regular',
  },
  replyPreviewMe: {
    color: 'rgba(255,255,255,0.82)',
  },
  msgText: {
    color: lightTheme.textPrimary,
    fontSize: 15,
    fontFamily: fonts.regular,
    lineHeight: 22,
  },
  msgTextMe: {
    color: lightTheme.textOnAccent,
  },
  mediaCaptionText: {
    marginTop: 8,
  },
  recallText: {
    fontStyle: 'italic',
    color: colors.textMuted,
  },
  recallTextMe: {
    color: colors.textMuted,
  },
  stickerText: {
    fontSize: 28,
    lineHeight: 34,
  },
  stickerImage: {
    width: 100,
    height: 100,
  },
  mediaPlaceholder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mediaLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontFamily: 'BeVietnamPro_400Regular',
  },
  mediaLabelMe: {
    color: colors.textOnAccent,
  },
  mediaImage: {
    width: 220,
    height: 160,
    borderRadius: 12,
    backgroundColor: colors.glassPanel,
  },
  mediaVideo: {
    width: 220,
    height: 160,
    borderRadius: 12,
    backgroundColor: colors.glassPanelStrong,
  },
  videoContainer: {
    width: 220,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.glassPanelStrong,
    borderWidth: 1,
    borderColor: colors.glassBorderSoft,
  },
  videoOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 157, 142, 0.24)',
  },
  videoOpenBtn: {
    height: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.glassPanel,
  },
  videoOpenBtnMe: {
    backgroundColor: colors.glassSoft,
  },
  videoOpenText: {
    color: colors.accentSoft,
    fontSize: 11,
    fontFamily: 'BeVietnamPro_500Medium',
  },
  videoOpenTextMe: {
    color: colors.accent,
  },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.glassPanel,
    borderWidth: 1,
    borderColor: colors.glassBorderSoft,
    minWidth: 180,
    gap: 8,
  },
  fileCardMe: {
    backgroundColor: colors.glassSoft,
    borderColor: colors.glassBorder,
  },
  fileMeta: {
    flex: 1,
    minWidth: 0,
  },
  fileTitle: {
    color: colors.text,
    fontSize: 13,
    fontFamily: 'BeVietnamPro_500Medium',
  },
  fileTitleMe: {
    color: colors.text,
  },
  fileAction: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: 'BeVietnamPro_400Regular',
  },
  fileActionMe: {
    color: colors.textMuted,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
  },
  time: {
    color: colors.textMuted,
    fontSize: 10,
    fontFamily: 'BeVietnamPro_400Regular',
  },
  timeMe: {
    color: 'rgba(255,255,255,0.78)',
  },
  readPreviewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 6,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: colors.glassPanel,
  },
  readPreviewStack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  readPreviewAvatar: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginLeft: -4,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: colors.glassPanel,
  },
  readPreviewFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  readPreviewFallbackText: {
    color: colors.accentSoft,
    fontSize: 9,
    fontFamily: 'BeVietnamPro_600SemiBold',
  },
  readPreviewMore: {
    marginLeft: 4,
    color: colors.textMuted,
    fontSize: 10,
    fontFamily: 'BeVietnamPro_600SemiBold',
  },
  reactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  reactionRowMe: {
    justifyContent: 'flex-end',
  },
  reactionRowOther: {
    justifyContent: 'flex-start',
  },
  summaryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.glassPanel,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 2,
  },
  summaryEmoji: {
    fontSize: 12,
    marginRight: 1,
  },
  summaryCount: {
    color: colors.accentSoft,
    fontSize: 12,
    fontFamily: 'BeVietnamPro_600SemiBold',
    marginLeft: 3,
  },
  reactionTrigger: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: colors.glassPanel,
    paddingHorizontal: 8,
  },
  reactionTriggerText: {
    fontSize: 15,
    lineHeight: 18,
  },
});

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    height: 64,
    backgroundColor: lightTheme.bg,
    borderBottomWidth: 1,
    borderBottomColor: lightTheme.border,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: lightTheme.surface,
    borderWidth: 1,
    borderColor: lightTheme.border,
  },
  headerInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: lightTheme.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: lightTheme.border,
  },
  headerAvatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
  },
  headerAvatarText: {
    color: colors.textSubtle,
    fontSize: 16,
    fontFamily: 'BeVietnamPro_700Bold',
  },
  headerName: {
    color: lightTheme.textPrimary,
    fontSize: 16,
    fontFamily: fonts.semiBold,
    maxWidth: 140,
  },
  headerStatus: {
    color: lightTheme.accent,
    fontSize: 13,
    fontFamily: fonts.medium,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 4,
  },
  actionIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: lightTheme.surface,
    borderWidth: 1,
    borderColor: lightTheme.border,
  },
  messageList: {
    paddingTop: 12,
    paddingBottom: 18,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  loadMoreIndicator: {
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: colors.textMuted,
    fontFamily: 'BeVietnamPro_400Regular',
    marginTop: 12,
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 16,
    fontFamily: 'BeVietnamPro_600SemiBold',
    marginTop: 16,
  },
  emptySubtext: {
    color: colors.textMuted,
    fontSize: 14,
    fontFamily: 'BeVietnamPro_400Regular',
    marginTop: 4,
  },
  composerContainer: {
    marginHorizontal: 10,
    marginBottom: 8,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: lightTheme.border,
    backgroundColor: 'rgba(255,255,255,0.94)',
    overflow: 'hidden',
    ...shadows.floating,
  },
  replyComposerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginHorizontal: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: lightTheme.surfaceSoft,
    borderWidth: 1,
    borderColor: lightTheme.border,
    gap: 10,
  },
  replyComposerMeta: {
    flex: 1,
    minWidth: 0,
  },
  replyComposerLabel: {
    color: lightTheme.accent,
    fontSize: 11,
    fontFamily: 'BeVietnamPro_600SemiBold',
  },
  replyComposerPreview: {
    marginTop: 2,
    color: lightTheme.textSecondary,
    fontSize: 12,
    fontFamily: 'BeVietnamPro_400Regular',
  },
  replyComposerCancelBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: lightTheme.surface,
  },
  mediaDraftBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginHorizontal: 12,
    padding: 8,
    borderRadius: 12,
    backgroundColor: lightTheme.surfaceSoft,
    borderWidth: 1,
    borderColor: lightTheme.border,
    gap: 10,
  },
  mediaDraftPreview: {
    width: 46,
    height: 46,
    borderRadius: 8,
    backgroundColor: colors.glassPanelStrong,
  },
  mediaDraftVideoCard: {
    width: 46,
    height: 46,
    borderRadius: 8,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaDraftVideoText: {
    marginTop: 2,
    color: '#cbd5e1',
    fontSize: 8,
    fontFamily: 'BeVietnamPro_500Medium',
  },
  mediaDraftMeta: {
    flex: 1,
    minWidth: 0,
  },
  mediaDraftTitle: {
    color: colors.text,
    fontSize: 12,
    fontFamily: 'BeVietnamPro_600SemiBold',
  },
  mediaDraftStatus: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: 'BeVietnamPro_400Regular',
  },
  mediaDraftRemoveBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceHover,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 10,
    paddingTop: 8,
  },
  inputAction: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: lightTheme.surfaceSoft,
    borderWidth: 1,
    borderColor: lightTheme.border,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 5,
    marginHorizontal: 8,
    maxHeight: 120,
  },
  textInput: {
    flex: 1,
    color: lightTheme.textPrimary,
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 20,
    paddingVertical: 6,
    minHeight: 32,
  },
  emojiBtn: {
    padding: 4,
    marginBottom: 2,
  },
  composerPickerWrap: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  composerPickerTabs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  composerPickerTab: {
    flex: 1,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: lightTheme.border,
    backgroundColor: lightTheme.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  composerPickerTabActive: {
    borderColor: lightTheme.accent,
    backgroundColor: lightTheme.accentSoft,
  },
  composerPickerTabText: {
    color: colors.textMuted,
    fontSize: 13,
    fontFamily: 'BeVietnamPro_500Medium',
  },
  composerPickerTabTextActive: {
    color: colors.accent,
    fontFamily: 'BeVietnamPro_600SemiBold',
  },
  quickEmojiPanel: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: lightTheme.border,
    backgroundColor: lightTheme.surface,
    padding: 10,
  },
  quickEmojiBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: lightTheme.surfaceSoft,
  },
  quickEmojiText: {
    fontSize: 22,
    lineHeight: 26,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: lightTheme.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 0,
  },
  sendBtnDisabled: {
    opacity: 0.65,
  },
  micBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 0,
  },
  groupModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.28)',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  groupModalCard: {
    width: '100%',
    maxHeight: '88%',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    backgroundColor: lightTheme.bg,
    borderWidth: 1,
    borderColor: lightTheme.border,
    padding: 16,
    ...shadows.floating,
  },
  groupModalScrollContent: {
    alignItems: 'center',
    paddingBottom: 4,
  },
  groupModalTitle: {
    color: lightTheme.textPrimary,
    fontSize: 18,
    fontFamily: 'BeVietnamPro_700Bold',
    marginBottom: 16,
  },
  groupAvatarPicker: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: lightTheme.surfaceSoft,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    marginBottom: 12,
  },
  groupAvatarPreview: {
    width: '100%',
    height: '100%',
  },
  groupAvatarPlaceholder: {
    color: lightTheme.textSecondary,
    fontSize: 34,
    fontFamily: 'BeVietnamPro_700Bold',
  },
  groupAvatarCameraBadge: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: lightTheme.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupNameInput: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: lightTheme.border,
    color: lightTheme.textPrimary,
    fontSize: 15,
    fontFamily: 'BeVietnamPro_500Medium',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
    backgroundColor: lightTheme.surface,
  },
  directInfoCard: {
    width: '100%',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: lightTheme.border,
    backgroundColor: lightTheme.surface,
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 12,
  },
  directInfoAvatarWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: lightTheme.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 8,
  },
  directInfoAvatar: {
    width: '100%',
    height: '100%',
  },
  directInfoAvatarText: {
    color: lightTheme.accent,
    fontSize: 24,
    fontFamily: 'BeVietnamPro_700Bold',
  },
  directInfoName: {
    color: lightTheme.textPrimary,
    fontSize: 16,
    fontFamily: 'BeVietnamPro_700Bold',
    maxWidth: '90%',
  },
  directInfoMeta: {
    marginTop: 2,
    color: lightTheme.textSecondary,
    fontSize: 12,
    fontFamily: 'BeVietnamPro_500Medium',
  },
  memberRoleSection: {
    width: '100%',
    marginBottom: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: lightTheme.border,
    backgroundColor: lightTheme.surface,
    padding: 10,
  },
  memberRoleTitle: {
    color: lightTheme.textSecondary,
    fontSize: 13,
    fontFamily: 'BeVietnamPro_700Bold',
    marginBottom: 8,
  },
  memberRoleList: {
    maxHeight: 180,
  },
  memberRoleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: lightTheme.border,
    backgroundColor: lightTheme.bg,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
  },
  memberRoleInfo: {
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  memberRoleName: {
    color: lightTheme.textPrimary,
    fontSize: 13,
    fontFamily: 'BeVietnamPro_600SemiBold',
  },
  memberRoleMeta: {
    color: lightTheme.textSecondary,
    fontSize: 11,
    fontFamily: 'BeVietnamPro_500Medium',
    marginTop: 2,
  },
  memberRoleAction: {
    borderRadius: 8,
    backgroundColor: lightTheme.accentSoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  memberRoleActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  memberRoleActionText: {
    color: lightTheme.accent,
    fontSize: 11,
    fontFamily: 'BeVietnamPro_700Bold',
  },
  memberRemoveAction: {
    borderRadius: 8,
    backgroundColor: lightTheme.dangerSoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  memberRemoveActionText: {
    color: lightTheme.danger,
    fontSize: 11,
    fontFamily: 'BeVietnamPro_700Bold',
  },
  groupModalActions: {
    width: '100%',
    flexDirection: 'row',
    gap: 10,
  },
  groupModalButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupModalCancelButton: {
    backgroundColor: lightTheme.surfaceSoft,
  },
  groupModalSaveButton: {
    backgroundColor: lightTheme.accent,
  },
  groupModalCancelText: {
    color: lightTheme.textSecondary,
    fontSize: 14,
    fontFamily: 'BeVietnamPro_600SemiBold',
  },
  groupModalSaveText: {
    color: lightTheme.textOnAccent,
    fontSize: 14,
    fontFamily: 'BeVietnamPro_700Bold',
  },
  groupActionRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  groupActionItem: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: lightTheme.surface,
    borderWidth: 1,
    borderColor: lightTheme.border,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  groupActionText: {
    color: lightTheme.textSecondary,
    fontSize: 12,
    fontFamily: 'BeVietnamPro_500Medium',
    textAlign: 'center',
  },
  leaveGroupButton: {
    marginTop: 12,
    width: '100%',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: lightTheme.dangerBorder,
    backgroundColor: lightTheme.dangerSoft,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  leaveGroupText: {
    color: lightTheme.danger,
    fontSize: 14,
    fontFamily: 'BeVietnamPro_700Bold',
  },
  dialogCard: {
    width: '100%',
    borderRadius: 16,
    backgroundColor: colors.glassPanelStrong,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    padding: 16,
  },
  dialogTitle: {
    color: colors.text,
    fontSize: 17,
    fontFamily: 'BeVietnamPro_700Bold',
  },
  dialogTitleError: {
    color: '#ffd8d8',
  },
  dialogMessage: {
    marginTop: 8,
    color: colors.textMuted,
    fontSize: 14,
    fontFamily: 'BeVietnamPro_400Regular',
  },
  dialogMessageError: {
    color: '#ffc7c7',
  },
  dialogActionsColumn: {
    marginTop: 14,
    gap: 8,
  },
  dialogOptionButton: {
    borderRadius: 10,
    backgroundColor: colors.glassSoft,
    borderWidth: 1,
    borderColor: colors.glassBorderSoft,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  dialogOptionText: {
    color: colors.text,
    fontSize: 13,
    fontFamily: 'BeVietnamPro_500Medium',
  },
  dialogFooterRow: {
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  dialogButton: {
    minWidth: 96,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogCancelButton: {
    backgroundColor: colors.surfaceHover,
  },
  dialogCancelText: {
    color: colors.text,
    fontSize: 13,
    fontFamily: 'BeVietnamPro_600SemiBold',
  },
  dialogPrimaryButton: {
    backgroundColor: colors.primary,
  },
  dialogDangerButton: {
    backgroundColor: '#8f2b2b',
  },
  dialogPrimaryText: {
    color: colors.background,
    fontSize: 13,
    fontFamily: 'BeVietnamPro_700Bold',
  },
  archiveModalCard: {
    maxHeight: '80%',
    alignItems: 'stretch',
  },
  archiveHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  archiveTabRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  archiveTab: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#0f4335',
    paddingVertical: 8,
    alignItems: 'center',
  },
  archiveTabActive: {
    backgroundColor: '#1f7a60',
  },
  archiveTabText: {
    color: '#d1fae5',
    fontSize: 12,
    fontFamily: 'BeVietnamPro_600SemiBold',
  },
  archiveBody: {
    width: '100%',
  },
  archiveMediaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  archiveMediaItem: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: '#13263b',
    overflow: 'hidden',
  },
  archiveMediaImage: {
    width: '100%',
    height: '100%',
  },
  archiveVideoPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  archiveList: {
    gap: 8,
  },
  archiveListItem: {
    borderRadius: 8,
    backgroundColor: '#0f4335',
    borderWidth: 1,
    borderColor: '#175443',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  archiveListText: {
    color: '#d6f8ec',
    fontSize: 13,
    fontFamily: 'BeVietnamPro_400Regular',
  },
  archiveEmptyText: {
    color: '#8abfab',
    fontSize: 13,
    fontFamily: 'BeVietnamPro_400Regular',
    marginTop: 6,
  },
  reactionOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.35)',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 120,
  },
  reactionPickerCard: {
    backgroundColor: 'rgba(7, 37, 30, 0.98)',
    borderWidth: 1,
    borderColor: 'rgba(45,212,191,0.22)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  reactionEmojiRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 4,
  },
  reactionEmojiButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 118, 110, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(45,212,191,0.28)',
  },
  reactionEmojiText: {
    fontSize: 24,
    lineHeight: 28,
  },
  reactionClearButton: {
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(127, 29, 29, 0.45)',
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.35)',
  },
  reactionClearText: {
    color: '#fecaca',
    fontFamily: 'BeVietnamPro_500Medium',
    fontSize: 12,
  },
  reactionActionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  reactionActionButton: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.4)',
    backgroundColor: 'rgba(2, 6, 23, 0.35)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  reactionActionButtonDanger: {
    borderColor: 'rgba(248, 113, 113, 0.35)',
    backgroundColor: 'rgba(127, 29, 29, 0.28)',
  },
  reactionActionText: {
    color: '#e2e8f0',
    fontFamily: 'BeVietnamPro_500Medium',
    fontSize: 12,
  },
  reactionActionTextDanger: {
    color: '#fecaca',
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetCard: {
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 16,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    maxHeight: '80%',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 6, 23, 0.45)',
  },
  sheetContainer: {
    minHeight: '45%',
    maxHeight: '75%',
    backgroundColor: '#f8fafc',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  sheetContent: {
    flex: 1,
    paddingTop: 8,
    paddingHorizontal: 14,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sheetTitle: {
    color: '#0f172a',
    fontFamily: 'BeVietnamPro_700Bold',
    fontSize: 17,
  },
  sheetCloseBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#e2e8f0',
  },
  sheetCloseText: {
    color: '#0f172a',
    fontFamily: 'BeVietnamPro_600SemiBold',
    fontSize: 14,
  },
  sheetLoadingBox: {
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  sheetLoadingText: {
    color: '#334155',
    fontFamily: 'BeVietnamPro_500Medium',
    fontSize: 13,
  },
  sheetTabsScroll: {
    maxHeight: 58,
    flexGrow: 0,
    marginBottom: 4,
  },
  sheetTabsRow: {
    alignItems: 'center',
    paddingBottom: 6,
    paddingRight: 8,
    gap: 6,
  },
  sheetTabPill: {
    alignSelf: 'flex-start',
    borderRadius: 13,
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 10,
    minHeight: 32,
    justifyContent: 'center',
  },
  sheetTabPillActive: {
    backgroundColor: '#0f766e',
  },
  sheetTabText: {
    color: '#0f172a',
    fontFamily: 'BeVietnamPro_600SemiBold',
    fontSize: 12,
  },
  sheetTabTextActive: {
    color: '#ecfeff',
  },
  sheetRowsScroll: {
    flex: 1,
  },
  sheetRowsContent: {
    gap: 10,
    paddingBottom: 12,
  },
  sheetEmptyText: {
    textAlign: 'center',
    color: '#64748b',
    marginTop: 24,
    fontFamily: 'BeVietnamPro_500Medium',
  },
  sheetRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 10,
  },
  sheetAvatarCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#d1fae5',
  },
  sheetAvatarText: {
    color: '#065f46',
    fontFamily: 'BeVietnamPro_700Bold',
    fontSize: 16,
  },
  sheetRowBody: {
    flex: 1,
    minWidth: 0,
  },
  sheetRowName: {
    color: '#0f172a',
    fontFamily: 'BeVietnamPro_600SemiBold',
    fontSize: 16,
  },
  sheetRowEmojiWrap: {
    marginTop: 4,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  sheetRowEmojiPill: {
    borderRadius: 10,
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  sheetRowEmojiPillText: {
    color: '#334155',
    fontFamily: 'BeVietnamPro_500Medium',
    fontSize: 12,
  },
  sheetRowCount: {
    color: '#334155',
    fontFamily: 'BeVietnamPro_600SemiBold',
    fontSize: 14,
  },
  statusDetailsCard: {
    minHeight: 260,
  },
  statusSection: {
    marginTop: 8,
  },
  statusSectionTitle: {
    color: '#0f172a',
    fontFamily: 'BeVietnamPro_700Bold',
    fontSize: 14,
    marginBottom: 8,
  },
  statusEmptyText: {
    color: '#64748b',
    fontFamily: 'BeVietnamPro_500Medium',
    fontSize: 12,
  },
  statusList: {
    maxHeight: 140,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
  },
  statusAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    marginRight: 10,
    backgroundColor: '#2f6657',
  },
  statusAvatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusAvatarText: {
    color: '#d1fae5',
    fontFamily: 'BeVietnamPro_600SemiBold',
    fontSize: 12,
  },
  statusInfo: {
    flex: 1,
    minWidth: 0,
  },
  statusName: {
    color: '#0f172a',
    fontFamily: 'BeVietnamPro_600SemiBold',
    fontSize: 13,
  },
  statusMeta: {
    color: '#64748b',
    fontFamily: 'BeVietnamPro_400Regular',
    fontSize: 11,
    marginTop: 2,
  },
});
