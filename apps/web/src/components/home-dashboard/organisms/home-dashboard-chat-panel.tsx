'use client';

import { type ChangeEvent, type ComponentType, type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Bot, CheckCircle2, ListChecks, HelpCircle, Bell, MessageSquare, Play, PenLine, RefreshCw, Sparkles, Heart, Phone, Video } from 'lucide-react';
import type { AiCatchupDigest, Message, MessageStatus } from '@zync/shared-types';
import {
  Menu,
  MenuProvider,
  MessageItem,
  ReactionDetailsModal,
  ReactionDetailsModalProvider,
  ReactionPicker,
  ReactionPickerProvider,
  StatusDetailsModal,
  StatusDetailsModalProvider,
} from '../molecules/message-item';
import { ForwardMessageModal } from '../molecules/forward-message-modal';
import { TypingIndicator } from '../atoms/typing-indicator';
import { MessageInput } from '../molecules/message-input';
import { MessageType } from '@zync/shared-types';
import { generateUploadSignature, verifyUpload } from '@/services/chat';
import type { ReactionDetailsResponse } from '@/services/chat';
import { reactMessage } from '@/services/chat';
import { fetchPostsByAuthor, type Post } from '@/services/posts';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useMediaViewer } from '@/context/media-viewer-context';
import { showSystemToast } from '@/components/notifications/InAppNotificationToasts';
import { ButtonSpinner } from '@/components/shared/loading-system';

type LucideIconComponent = ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
const PlayIcon = Play as unknown as LucideIconComponent;
const PenLineIcon = PenLine as unknown as LucideIconComponent;
const HeartIcon = Heart as unknown as LucideIconComponent;
const AlertCircleIcon = AlertCircle as unknown as LucideIconComponent;
const BotIcon = Bot as unknown as LucideIconComponent;
const CheckCircleIcon = CheckCircle2 as unknown as LucideIconComponent;
const RefreshIcon = RefreshCw as unknown as LucideIconComponent;
const SparklesIcon = Sparkles as unknown as LucideIconComponent;
const PhoneIcon = Phone as unknown as LucideIconComponent;
const VideoIcon = Video as unknown as LucideIconComponent;
const InfoIcon = AlertCircle as unknown as LucideIconComponent;

interface SendMessageOptions {
  idempotencyKey?: string;
  deferEmit?: boolean;
  replyTo?: Message['replyTo'];
}

type CallUiStatus = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'connected' | 'ended' | 'missed' | 'rejected';
interface ConversationActiveCall {
  callSessionId: string;
  type: 'audio' | 'video';
  status: string;
  startedAt?: string | null;
  initiatedBy: string;
}

function isActiveConversationCall(call?: ConversationActiveCall | null): call is ConversationActiveCall {
  return Boolean(
    call?.callSessionId
    && (call.status === 'ringing' || call.status === 'connecting' || call.status === 'connected'),
  );
}

// ==================== CALL UI ICONS ====================

function MicIcon({ className }: { className: string }) {
  return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="11" rx="3" /><path d="M5 10a7 7 0 0 0 14 0" /><path d="M12 17v5" /><path d="M8 22h8" /></svg>;
}

function CameraControlIcon({ className }: { className: string }) {
  return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m22 8-6 4 6 4V8Z" /><rect x="2" y="6" width="14" height="12" rx="2" ry="2" /></svg>;
}

function ScreenShareIcon({ className }: { className: string }) {
  return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8" /><path d="M12 17v4" /><path d="m9 10 3-3 3 3" /><path d="M12 7v7" /></svg>;
}

function MinimizeIcon({ className }: { className: string }) {
  return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3v5H3" /><path d="M21 16h-5v5" /><path d="M3 8l6-6" /><path d="M15 22l6-6" /></svg>;
}

function MaximizeIcon({ className }: { className: string }) {
  return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" /></svg>;
}

function EndCallIcon({ className }: { className: string }) {
  return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 15.5c4.8-4.5 10.2-4.5 15 0" /><path d="M8.5 12.5c.4 1.6.8 2.6 1.4 3.1" /><path d="M15.5 12.5c-.4 1.6-.8 2.6-1.4 3.1" /></svg>;
}

function CheckIcon({ className }: { className: string }) {
  return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 13 4 4L19 7" /></svg>;
}

function CloseIcon({ className }: { className: string }) {
  return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>;
}

function SearchIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="11" cy="11" r="6" />
      <path d="m16 16 4 4" strokeLinecap="round" />
    </svg>
  );
}

function BellOffMiniIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 3l18 18" strokeLinecap="round" />
      <path d="M10.58 6.53A5 5 0 0 1 17 11v3l2 2H7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 18a3 3 0 0 0 6 0" strokeLinecap="round" />
      <path d="M4 16h1l2-2v-3a5 5 0 0 1 .58-2.35" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PinMiniIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 3l6 6-2 2-3-3-3 3v4l-2 2v-6l-5 5-2-2 5-5H3l2-2h4l3-3-3-3 2-2 6 6z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ==================== AUTHOR POSTS SECTION ====================

interface AuthorConversationItem {
  name?: string;
  avatarUrl?: string;
  type?: 'direct' | 'group';
  isGroup?: boolean;
  updatedAt?: string;
  createdBy?: string;
  adminIds?: string[];
  memberApprovalEnabled?: boolean;
  removedFromGroup?: boolean;
  memberCount?: number;
  members?: Array<{ _id: string; displayName: string; avatarUrl?: string }>;
  online?: boolean;
  active?: boolean;
}

interface AuthorPostsSectionProps {
  conversation?: AuthorConversationItem;
  currentUserId?: string;
}

function AuthorPostsSection({ conversation, currentUserId }: AuthorPostsSectionProps) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const isGroupConversation = conversation?.type === 'group' || conversation?.isGroup === true;

  // Lay authorId tu conversation (nguoi khac trong direct conversation)
  const otherParticipant = conversation?.members?.find((m) => m._id !== currentUserId);
  const authorId = otherParticipant?._id;

  useEffect(() => {
    if (!authorId || isGroupConversation) return;

    setLoading(true);
    fetchPostsByAuthor(authorId, 3)
      .then(setPosts)
      .catch(() => {/* ignore */})
      .finally(() => setLoading(false));
  }, [authorId, isGroupConversation]);

  if (isGroupConversation || !authorId) return null;

  return (
    <div className="mt-4 space-y-2 rounded-2xl border border-border bg-bg-card p-4">
      <p className="text-sm font-semibold uppercase tracking-wide text-text-secondary flex items-center gap-1.5">
        <PenLineIcon className="h-3.5 w-3.5" />
        Bài viết gần đây
      </p>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-bg-hover" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <p className="text-xs text-text-tertiary">Chưa có bài viết nào</p>
      ) : (
        <div className="space-y-2">
          {posts.map((post) => (
            <button
              key={post._id}
              type="button"
              onClick={() => router.push(`/community?postId=${post._id}`)}
              className="block w-full rounded-lg border border-border bg-bg-hover p-3 text-left transition hover:border-accent"
            >
              <p className="line-clamp-2 text-sm text-text-primary">{post.title}</p>
              <p className="mt-1 flex items-center gap-2 text-xs text-text-tertiary">
                <HeartIcon className="h-3 w-3" />
                {post.likesCount}
                <span className="mx-1">-</span>
                <PenLineIcon className="h-3 w-3" />
                {post.commentsCount}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== TYPES ====================

interface ChatPanelProps {
  conversationId?: string;
  currentUserId?: string;
  participantName?: string;
  participantAvatar?: string;
  participantAvatarUrl?: string;
  isGroupConversation?: boolean;
  isOnline?: boolean;
  messages?: Message[];
  targetMessageRef?: string | null;
  onTargetMessageConsumed?: () => void;
  messageStatus?: Record<string, string>;
  typingUsers?: Array<{ userId: string; displayName: string }>;
  onSendMessage?: (content: string, type: MessageType, mediaUrl?: string, options?: SendMessageOptions) => Promise<string | null | undefined>;
  onCancelPendingMessage?: (idempotencyKey: string) => void;
  onStartTyping?: () => void;
  onStopTyping?: () => void;
  onLoadMore?: () => Promise<void>;
  onBack?: () => void;
  onInfoClick?: () => void;
  onDeleteMessageForMe?: (messageId: string, idempotencyKey: string) => void;
  onRecallMessage?: (messageId: string, idempotencyKey: string) => void;
  onForwardMessage?: (message: Message) => void;
  forwardModalOpen?: boolean;
  forwardingMessage?: Message | null;
  forwardLoading?: boolean;
  onCloseForwardModal?: () => void;
  onExecuteForward?: (toConversationId: string) => Promise<void> | void;
  onAvatarClick?: () => void;
  onNameClick?: () => void;
  inputDisabled?: boolean;
  inputDisabledReason?: string;
  onReactionUpsert?: (message: Message, emoji: string, delta: 1 | 2 | 3, actionSource: string) => void;
  onReactionRemoveAllMine?: (message: Message) => void;
  onFetchReactionDetails?: (message: Message) => Promise<ReactionDetailsResponse>;
  reactionUserStateByMessage?: Record<string, {
    lastEmoji: string | null;
    totalCount: number;
    emojiCounts: Record<string, number>;
  }>;
  callStatus?: CallUiStatus;
  callType?: 'audio' | 'video';
  activeConversationCall?: ConversationActiveCall | null;
  callPeerName?: string;
  callParticipantNames?: string[];
  isGroupCallActive?: boolean;
  callError?: string | null;
  callFriendError?: string | null;
  onDismissCallFriendError?: () => void;
  isCallingAvailable?: boolean;
  isMicMuted?: boolean;
  isCameraEnabled?: boolean;
  isScreenSharing?: boolean;
  screenSharingUserId?: string | null;
  localVideoRef?: RefObject<HTMLVideoElement>;
  screenShareVideoRef?: RefObject<HTMLVideoElement>;
  remoteVideoRef?: RefObject<HTMLVideoElement>;
  remoteParticipantVideos?: Array<{
    userId: string;
    displayName: string;
    stream: MediaStream;
  }>;
  onStartAudioCall?: () => void;
  onStartVideoCall?: () => void;
  onAcceptIncomingCall?: () => void;
  onRejectIncomingCall?: () => void;
  onEndCall?: () => void;
  onDismissCallBanner?: () => void;
  onToggleMic?: () => void;
  onToggleCamera?: () => void;
  onToggleScreenShare?: () => void;
  isLoading?: boolean;
  hasMoreMessages?: boolean;
  error?: string | null;
  aiCatchupDigest?: AiCatchupDigest | null;
  aiCatchupUnreadCount?: number;
  aiCatchupEnabled?: boolean;
  aiCatchupRequesting?: boolean;
  onRequestAiCatchup?: () => Promise<void> | void;
  onRegenerateAiCatchup?: () => Promise<void> | void;
  onCreateReminder?: (actionItem: { text: string; sourceMessageRefs: string[] }) => Promise<void> | void;
}

interface ConversationItem {
  id: string;
  name: string;
  preview: string;
  time: string;
  timestamp?: number;
  avatar: string;
  avatarUrl?: string;
  isPinned?: boolean;
  mutedUntil?: Date | null;
  isGroup?: boolean;
  createdBy?: string;
  adminIds?: string[];
  memberApprovalEnabled?: boolean;
  removedFromGroup?: boolean;
  memberCount?: number;
  members?: Array<{ _id: string; displayName: string; avatarUrl?: string }>;
  online?: boolean;
  active?: boolean;
  activeCall?: ConversationActiveCall | null;
  haveRead: boolean;
  unreadCount: number;
  aiCatchupEnabled: boolean;
}

interface GroupFriendOption {
  id: string;
  displayName: string;
  avatarUrl?: string;
}

function getDisplayFileName(message: Message): string {
  const messageType = String(message.type || '');
  if (messageType.startsWith('file/')) {
    const encodedName = messageType.slice('file/'.length);
    try {
      return decodeURIComponent(encodedName) || 'Tệp đính kèm';
    } catch {
      return encodedName || 'Tệp đính kèm';
    }
  }

  if (typeof message.content === 'string' && message.content.trim().length > 0) {
    return message.content;
  }

  return 'Tệp đính kèm';
}

// ==================== CONVERSATION LIST ====================

interface ConversationListProps {
  conversations?: ConversationItem[];
  selectedId?: string;
  onSelectConversation?: (id: string) => void;
  aiCatchupByConversation?: Record<string, AiCatchupDigest>;
  onRequestAiCatchup?: (conversationId: string) => Promise<void> | void;
  searchTargets?: ConversationSearchTarget[];
  onSelectSearchTarget?: (target: ConversationSearchTarget) => void;
}

interface ConversationSearchTarget {
  id: string;
  type: 'friend' | 'group';
  name: string;
  avatar?: string;
  avatarUrl?: string;
  conversationId?: string;
}

function ConversationList({
  conversations = [],
  selectedId,
  onSelectConversation = () => {},
  aiCatchupByConversation = {},
  onRequestAiCatchup,
  searchTargets = [],
  onSelectSearchTarget = () => {},
}: ConversationListProps) {
  const getMuteTimeLabel = (mutedUntil: Date | null | undefined): string => {
    if (!mutedUntil) {
      return '';
    }

    const remainingMs = new Date(mutedUntil).getTime() - Date.now();
    if (remainingMs <= 0) {
      return '';
    }

    const minutes = Math.ceil(remainingMs / (60 * 1000));
    if (minutes < 60) {
      return `${minutes} phút`;
    }

    const hours = Math.ceil(minutes / 60);
    if (hours < 24) {
      return `${hours} giờ`;
    }

    const days = Math.ceil(hours / 24);
    return `${days} ngày`;
  };

  const [query, setQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredConversations = normalizedQuery
    ? conversations.filter((item) => {
      return (item.name as string).toLowerCase().includes(normalizedQuery)
    })
    : conversations;

  return (
    <aside className="chat-sidebar">
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-ui-meta text-[0.7rem] uppercase tracking-[0.18em] text-text-tertiary">Trò chuyện</p>
            <h2 className="font-ui-title mt-1 text-xl text-text-primary">Tin nhắn</h2>
          </div>
        </div>
      </div>

      {/* Search */}
      <label className={`mb-4 flex h-11 w-full items-center gap-2 rounded-full border border-border-light bg-bg-hover px-[16px] text-text-tertiary transition duration-200 focus-within:border-emerald-500/50 focus-within:bg-bg-card focus-within:shadow-[0_0_0_3px_rgba(16,185,129,0.15)] ${
        !query && !isSearchFocused ? 'justify-center cursor-text' : 'justify-start'
      }`}>
        <SearchIcon className="shrink-0 h-4 w-4" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsSearchFocused(true)}
          onBlur={() => setIsSearchFocused(false)}
          placeholder="Tìm cuộc hội thoại..."
          className={`bg-transparent text-[15px] font-medium text-text-primary outline-none placeholder:text-text-tertiary transition-all duration-200 ${
            !query && !isSearchFocused ? 'w-[195px] text-center' : 'w-full text-left'
          }`}
        />
      </label>

      {/* Conversations */}
      {filteredConversations.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-bg-hover">
            <svg className="h-6 w-6 text-text-tertiary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <div>
            <p className="font-ui-title text-sm text-text-primary">
              {normalizedQuery ? 'Không tìm thấy' : 'Chưa có cuộc trò chuyện'}
            </p>
            <p className="font-ui-content mt-0.5 text-xs text-text-secondary">
              {normalizedQuery ? 'Thử từ khóa khác' : 'Bắt đầu nhắn tin với bạn bè'}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredConversations.map((item) => (
            (() => {
              const isMuted = Boolean(item.mutedUntil && new Date(item.mutedUntil) > new Date());
              const catchupDigest = aiCatchupByConversation[item.id];
              const shouldShowCatchup = item.aiCatchupEnabled && item.unreadCount >= 5;
              const catchupLabel = catchupDigest?.status === 'ready'
                ? 'AI san sang'
                : catchupDigest?.status === 'failed'
                  ? 'AI loi'
                  : catchupDigest?.status === 'queued' || catchupDigest?.status === 'processing'
                    ? 'AI dang tom tat'
                    : 'AI tom tat';

              return (
            <button
              key={item.id}
              onClick={() => onSelectConversation(item.id)}
              className={`chat-conv-item w-full px-3 py-3 ${selectedId === item.id ? 'active' : ''}`}
            >
              <div className="flex items-center gap-3">
                <div className="relative h-12 w-12 flex-shrink-0 rounded-2xl bg-accent text-white">
                    <span className="flex items-center justify-center overflow-hidden rounded-2xl h-full w-full text-sm font-semibold">
                      {item.avatarUrl?
                        <Image src={item.avatarUrl} alt={item.avatar} width={48} height={48} className="h-full w-full object-cover" />:
                        item.avatar
                      }
                    </span>
                  {item.online && (
                    <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-bg-card bg-emerald-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-[17px] font-bold text-text-primary">{item.name}</p>
                    <div className="flex items-center gap-2">
                      {isMuted && (
                        <span className="inline-flex items-center text-accent" aria-label="Đã tắt thông báo" title="Đã tắt thông báo">
                          <BellOffMiniIcon />
                        </span>
                      )}
                      <p className="text-xs uppercase tracking-wide text-text-tertiary whitespace-nowrap">{item.time}</p>
                    </div>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p className={`truncate text-[13.5px] font-medium text-text-primary ${item.haveRead? 'opacity-60': ''}`}>{item.preview}</p>
                    {isActiveConversationCall(item.activeCall) && (
                      <span className="shrink-0 rounded-full bg-accent-light px-2 py-0.5 text-[11px] font-semibold text-accent">
                        Đang gọi
                      </span>
                    )}
                    {shouldShowCatchup && (
                      <span
                        title={catchupLabel}
                        onClick={(event) => {
                          event.stopPropagation();
                          void onRequestAiCatchup?.(item.id);
                        }}
                        className="shrink-0 rounded-full border border-accent/25 bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent hover:bg-accent/15"
                      >
                        AI
                      </span>
                    )}
                    {item.isPinned && (
                        <span className="inline-flex items-center text-accent" aria-label="Đã ghim" title="Đã ghim">
                        <PinMiniIcon />
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </button>
              );
            })()
          ))}
        </div>
      )}
    </aside>
  );
}

// ==================== CHAT PANEL ====================

function ChatPanel({
  conversationId = 'demo',
  currentUserId = 'user123',
  participantName = 'Demo User',
  participantAvatar,
  participantAvatarUrl,
  isGroupConversation = false,
  isOnline = false,
  messages = [],
  targetMessageRef = null,
  onTargetMessageConsumed,
  messageStatus = {},
  typingUsers = [],
  onSendMessage = async () => null,
  onCancelPendingMessage = () => {},
  onStartTyping = () => {},
  onStopTyping = () => {},
  onLoadMore = async () => {},
  onBack,
  isLoading = false,
  error = null,
  onInfoClick,
  onDeleteMessageForMe,
  onRecallMessage,
  onForwardMessage,
  onAvatarClick,
  onNameClick,
  inputDisabled = false,
  inputDisabledReason,
  onReactionUpsert,
  onReactionRemoveAllMine,
  onFetchReactionDetails,
  reactionUserStateByMessage = {},
  callStatus = 'idle',
  callType = 'video',
  activeConversationCall = null,
  callPeerName,
  callParticipantNames = [],
  isGroupCallActive = false,
  callError = null,
  callFriendError = null,
  onDismissCallFriendError = () => {},
  isCallingAvailable = false,
  isMicMuted = false,
  isCameraEnabled = true,
  isScreenSharing = false,
  screenSharingUserId = null,
  localVideoRef,
  screenShareVideoRef,
  remoteVideoRef,
  remoteParticipantVideos = [],
  onStartAudioCall = () => {},
  onStartVideoCall = () => {},
  onAcceptIncomingCall = () => {},
  onRejectIncomingCall = () => {},
  onEndCall = () => {},
  onDismissCallBanner = () => {},
  onToggleMic = () => {},
  onToggleCamera = () => {},
  onToggleScreenShare = () => {},
  hasMoreMessages = true,
  aiCatchupDigest = null,
  aiCatchupUnreadCount = 0,
  aiCatchupEnabled = true,
  aiCatchupRequesting = false,
  onRequestAiCatchup = () => {},
  onRegenerateAiCatchup = () => {},
  onCreateReminder = () => {},
}: ChatPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const menuLayerRef = useRef<HTMLDivElement>(null);
  const messageRowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const messagesRef = useRef<Message[]>(messages);
  const onLoadMoreRef = useRef(onLoadMore);
  const jumpTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isJumpingRef = useRef(false);
  const lastExternalJumpRef = useRef<string | null>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [replyingTo, setReplyingTo] = useState<Message['replyTo'] | null>(null);
  const [jumpStatus, setJumpStatus] = useState<string | null>(null);
  const [isCallMinimized, setIsCallMinimized] = useState(false);

  const getMessageSenderId = useCallback((message: Message) => {
    const sender = message.senderId as unknown;
    if (sender && typeof sender === 'object') {
      return String((sender as { _id?: string })._id || '');
    }
    return String(message.senderId || '');
  }, []);

  const messagesForDisplay = useMemo(() => {
    const lastMessageIndex = messages.length - 1;

    return messages.map((message, index) => {
      const isBottomMessage = index === lastMessageIndex;
      const isOwnBottomMessage = isBottomMessage && getMessageSenderId(message) === String(currentUserId);

      if (isOwnBottomMessage) {
        return message;
      }

      const hasReadPreview = Array.isArray(message.readByPreview) && message.readByPreview.length > 0;
      const hasReadBy = Array.isArray(message.readBy) && message.readBy.length > 0;

      if (!hasReadPreview && !hasReadBy) {
        return message;
      }

      return {
        ...message,
        readByPreview: [],
        readBy: [],
      };
    });
  }, [currentUserId, getMessageSenderId, messages]);

  messagesRef.current = messages;

  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
  }, [onLoadMore]);

  useEffect(() => {
    return () => {
      if (jumpTimeoutRef.current) {
        clearTimeout(jumpTimeoutRef.current);
      }
    };
  }, []);
  const [activeSpeakerUserId, setActiveSpeakerUserId] = useState<string | null>(null);

  useEffect(() => {
    if (error) {
      showSystemToast({
        id: 'chat-error',
        type: 'community_post',
        title: 'Không thể thực hiện',
        body: error,
        variant: 'error',
      });
    }
  }, [error]);

  useEffect(() => {
    if (!callFriendError) return;
    showSystemToast({
      id: 'call-friend-error',
      type: 'community_post',
      title: 'Không thể gọi',
      body: callFriendError,
      variant: 'warning',
      actions: [
        {
          label: 'Đóng',
          variant: 'secondary',
          onClick: onDismissCallFriendError,
        },
      ],
    });
  }, [callFriendError, onDismissCallFriendError]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (shouldAutoScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, typingUsers, shouldAutoScroll]);

  // Detect if user scrolled up
  const handleScroll = () => {
    if (!messagesContainerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    // If scrolled to bottom (within 100px), enable auto-scroll
    setShouldAutoScroll(scrollHeight - scrollTop - clientHeight < 100);
  };

  // Check if message can be recalled (within 5 minutes)
  const canRecallMessage = (createdAt: string): boolean => {
    const messageTime = new Date(createdAt).getTime();
    const now = new Date().getTime();
    const fiveMinutesMs = 5 * 60 * 1000;
    return (now - messageTime) < fiveMinutesMs;
  };

  const isRemovedFromGroup = inputDisabled && inputDisabledReason?.toLowerCase().includes('bị xóa khỏi nhóm');
  const hasRemovedNoticeInMessages = messages.some((message) => message.content.toLowerCase().includes('bị xóa khỏi nhóm'));
  const isCallVisible = callStatus !== 'idle';
  const isTerminalCallState = callStatus === 'ended' || callStatus === 'missed' || callStatus === 'rejected';
  const isCompactCallState = isTerminalCallState || callStatus === 'incoming';
  const shouldRenderCallOverlay = isCallVisible && callStatus !== 'incoming';
  const isActiveCallState = callStatus === 'outgoing' || callStatus === 'incoming' || callStatus === 'connecting' || callStatus === 'connected';
  const isIncomingCallStatus = (status: CallUiStatus) => status === 'incoming';
  const isConversationActiveCall = isGroupConversation && isActiveConversationCall(activeConversationCall);
  const activeHeaderCallType = activeConversationCall?.type ?? callType;
  const isAudioCallActive = (isActiveCallState && callType === 'audio') || (isConversationActiveCall && activeHeaderCallType === 'audio');
  const isVideoCallActive = (isActiveCallState && callType === 'video') || (isConversationActiveCall && activeHeaderCallType === 'video');
  const shouldRenderCallMedia = callStatus === 'outgoing' || callStatus === 'connecting' || callStatus === 'connected';
  const callTypeLabel = callType === 'audio' ? 'Gọi thoại' : 'Gọi video';
  const showCameraOffBadge = callType === 'video' && !isCameraEnabled;
  const callStatusLabel: Record<Exclude<CallUiStatus, 'idle'>, string> = {
    outgoing: 'Đang đổ chuông...',
    incoming: 'Cuộc gọi đến',
    connecting: 'Đang kết nối...',
    connected: 'Đang trong cuộc gọi',
    ended: 'Đã kết thúc',
    missed: 'Nhỡ cuộc gọi',
    rejected: 'Đã từ chối',
  };

  const catchupStatus = aiCatchupDigest?.status;
  const canRequestCatchup = aiCatchupEnabled && !inputDisabled && !aiCatchupRequesting
    && catchupStatus !== 'queued'
    && catchupStatus !== 'processing';
  const shouldShowCatchupCard = aiCatchupEnabled && (
    aiCatchupUnreadCount >= 5
    || Boolean(aiCatchupDigest)
  );
  const catchupStatusLabel = catchupStatus === 'ready'
    ? 'San sang'
    : catchupStatus === 'failed'
      ? 'Loi'
      : catchupStatus === 'processing'
        ? 'Dang xu ly'
        : catchupStatus === 'queued'
          ? 'Dang cho'
          : `${aiCatchupUnreadCount} tin moi`;

  const handleRequestCatchup = () => {
    if (!canRequestCatchup) {
      return;
    }
    void onRequestAiCatchup();
  };

  const handleRegenerateCatchup = () => {
    if (!canRequestCatchup) {
      return;
    }
    void onRegenerateAiCatchup();
  };

  const handleCreateReminder = (actionItem: { text: string; sourceMessageRefs: string[] }) => {
    void onCreateReminder?.(actionItem);
  };

  useEffect(() => {
    if (!isGroupCallActive || callStatus !== 'connected' || remoteParticipantVideos.length === 0) {
      setActiveSpeakerUserId(null);
      return;
    }

    if (typeof window === 'undefined') {
      return;
    }

    const AudioContextClass = window.AudioContext
      ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) {
      return;
    }

    const audioContext = new AudioContextClass();
    type AudioMeter = {
      userId: string;
      analyser: AnalyserNode;
      data: Uint8Array<ArrayBuffer>;
      source: MediaStreamAudioSourceNode;
    };

    const meters: AudioMeter[] = [];
    remoteParticipantVideos.forEach((participant) => {
      const audioTracks = participant.stream.getAudioTracks();
      if (audioTracks.length === 0) {
        return;
      }

      const audioOnlyStream = new MediaStream(audioTracks);
      const source = audioContext.createMediaStreamSource(audioOnlyStream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      meters.push({
        userId: participant.userId,
        analyser,
        data: new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>,
        source,
      });
    });

    if (meters.length === 0) {
      setActiveSpeakerUserId(null);
      void audioContext.close();
      return;
    }

    const interval = setInterval(() => {
      let maxVolume = 0;
      let loudestUserId: string | null = null;

      meters.forEach((meter) => {
        meter.analyser.getByteTimeDomainData(meter.data);
        let sum = 0;
        for (const value of meter.data) {
          const normalized = (value - 128) / 128;
          sum += normalized * normalized;
        }
        const rms = Math.sqrt(sum / meter.data.length);
        if (rms > maxVolume) {
          maxVolume = rms;
          loudestUserId = meter.userId;
        }
      });

      if (maxVolume < 0.02) {
        setActiveSpeakerUserId(null);
        return;
      }

      setActiveSpeakerUserId(loudestUserId);
    }, 220);

    return () => {
      clearInterval(interval);
      meters.forEach((meter) => {
        meter.source.disconnect();
        meter.analyser.disconnect();
      });
      void audioContext.close();
    };
  }, [callStatus, isGroupCallActive, remoteParticipantVideos]);

  const activeSpeakerName = activeSpeakerUserId
    ? remoteParticipantVideos.find((participant) => participant.userId === activeSpeakerUserId)?.displayName
    : null;
  const remoteScreenShareParticipant = screenSharingUserId && screenSharingUserId !== currentUserId
    ? remoteParticipantVideos.find((participant) => participant.userId === screenSharingUserId)
    : null;
  const isViewingScreenShare = Boolean(isScreenSharing || remoteScreenShareParticipant);
  const participantVideosForTiles = remoteParticipantVideos.filter((participant) => participant.userId !== remoteScreenShareParticipant?.userId);
  const sharingParticipantName = isScreenSharing
    ? 'Bạn'
    : remoteScreenShareParticipant?.displayName ?? null;
  const mainStageParticipant = isGroupCallActive && !isViewingScreenShare
    ? (participantVideosForTiles.find((participant) => participant.userId === activeSpeakerUserId)
      ?? participantVideosForTiles[0]
      ?? null)
    : null;
  const mainStageClass = `relative flex-1 min-h-0 overflow-hidden ${isCallMinimized ? 'rounded-xl' : 'rounded-2xl'} border ${isViewingScreenShare ? 'border-accent' : 'border-border'} bg-black shadow-sm`;
  const stripContainerClass = isCallMinimized ? 'mt-3 flex-shrink-0' : 'mt-4 flex-shrink-0';
  const stripTrackClass = 'flex gap-3 overflow-x-auto pb-2';
  const stripTileClass = isCallMinimized
    ? 'relative h-20 w-32 flex-shrink-0 overflow-hidden rounded-xl border border-border bg-black shadow-sm'
    : 'relative h-24 w-40 sm:h-28 sm:w-48 flex-shrink-0 overflow-hidden rounded-xl border border-border bg-black shadow-sm';

  useEffect(() => {
    if (!isCallVisible || isCompactCallState) {
      setIsCallMinimized(false);
    }
  }, [isCallVisible, isCompactCallState]);

  // React to message
  const handleReactMessage = useCallback(async (messageId: string, reactionType: string) => {
    try {
      await reactMessage(messageId, reactionType);
    } catch {
      console.error('Failed to react to message');
    }
  }, []);

  const handleReplyMessage = useCallback((message: Message) => {
    const senderDisplayName = (message as Message & { senderDisplayName?: string }).senderDisplayName
      || (String(message.senderId) === String(currentUserId)
        ? 'Ban'
        : (!isGroupConversation ? participantName : undefined));

    setReplyingTo({
      messageRef: message.idempotencyKey || message._id,
      messageId: message._id,
      senderId: String(message.senderId),
      senderDisplayName,
      contentPreview: (message.content || '').slice(0, 160),
      type: message.type,
      isDeleted: false,
    });
  }, [currentUserId, isGroupConversation, participantName]);

  const showJumpStatus = useCallback((message: string) => {
    setJumpStatus(message);
    if (jumpTimeoutRef.current) {
      clearTimeout(jumpTimeoutRef.current);
    }
    jumpTimeoutRef.current = setTimeout(() => {
      setJumpStatus(null);
      jumpTimeoutRef.current = null;
    }, 3500);
  }, []);

  const scrollToMessageElement = useCallback((targetMessageId: string) => {
    const tryScroll = () => {
      const element = messageRowRefs.current[targetMessageId];
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.classList.add('zync-message-jump-highlight');
        window.setTimeout(() => {
          element.classList.remove('zync-message-jump-highlight');
        }, 1800);
      }
    };

    requestAnimationFrame(tryScroll);
    setTimeout(tryScroll, 120);
  }, []);

  const handleJumpToMessage = useCallback(async (messageRef: string) => {
    if (!messageRef || isJumpingRef.current) {
      return;
    }

    const findTarget = () => messagesRef.current.find(
      (msg) => msg.idempotencyKey === messageRef || msg._id === messageRef,
    );

    const immediateTarget = findTarget();
    if (immediateTarget) {
      scrollToMessageElement(immediateTarget._id);
      return;
    }

    isJumpingRef.current = true;

    try {
      let previousCount = messagesRef.current.length;
      let stagnantTurns = 0;
      const maxAttempts = 20;

      const waitForMessagesGrowth = async (baselineCount: number): Promise<boolean> => {
        const start = Date.now();
        const timeoutMs = 1200;

        while (Date.now() - start < timeoutMs) {
          if (messagesRef.current.length > baselineCount) {
            return true;
          }
          await new Promise<void>((resolve) => {
            setTimeout(() => resolve(), 60);
          });
        }

        return messagesRef.current.length > baselineCount;
      };

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const beforeLoadCount = messagesRef.current.length;
        await onLoadMoreRef.current();
        const hasGrowth = await waitForMessagesGrowth(beforeLoadCount);

        const found = findTarget();
        if (found) {
          scrollToMessageElement(found._id);
          return;
        }

        const currentCount = messagesRef.current.length;
        if (!hasGrowth || currentCount <= previousCount) {
          stagnantTurns += 1;
        } else {
          stagnantTurns = 0;
          previousCount = currentCount;
        }

        // No growth in consecutive attempts: likely no more accessible history for this user.
        if (stagnantTurns >= 3) {
          break;
        }
      }

      showJumpStatus('Tin nhắn không thể truy cập.');
    } catch {
      showJumpStatus('Không thể tải thêm tin nhắn để đi đến tin gốc.');
    } finally {
      isJumpingRef.current = false;
    }
  }, [scrollToMessageElement, showJumpStatus]);

  useEffect(() => {
    if (!targetMessageRef || isLoading) {
      return;
    }

    const jumpKey = `${conversationId}:${targetMessageRef}`;
    if (lastExternalJumpRef.current === jumpKey) {
      return;
    }
    lastExternalJumpRef.current = jumpKey;

    void handleJumpToMessage(targetMessageRef).finally(() => {
      onTargetMessageConsumed?.();
    });
  }, [conversationId, handleJumpToMessage, isLoading, onTargetMessageConsumed, targetMessageRef]);

  return (
    <article className="relative mx-auto flex h-full w-full max-w-[1440px] min-h-0 min-w-0 flex-col overflow-hidden chat-room-surface">
      {/* Header */}
      <header className="chat-header">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {onBack && (
            <button
              type="button"
              className="md:hidden flex h-10 w-10 items-center justify-center rounded-full text-text-primary hover:bg-bg-hover"
              onClick={onBack}
              aria-label="Quay lại"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </button>
          )}
          <button
            type="button"
            className={`relative h-11 w-11 overflow-hidden rounded-full bg-gradient-to-br from-accent to-accent-hover shadow-sm flex-shrink-0 ${
              isGroupConversation ? 'cursor-pointer hover:shadow-md hover:scale-105 transition-all' : 'cursor-default'
            }`}
            onClick={isGroupConversation ? onAvatarClick : undefined}
            title={isGroupConversation ? 'Đổi ảnh nhóm' : undefined}
          >
            {participantAvatarUrl ? (
              <img src={participantAvatarUrl} alt={participantName} className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-sm font-bold text-white">
                {participantAvatar ? participantAvatar[0] : participantName[0]}
              </span>
            )}
          </button>

          <div className="chat-header-info min-w-0">
            <button
              type="button"
              className={`text-left text-base font-bold text-[#050505] transition-colors block truncate max-w-full ${
                isGroupConversation ? 'cursor-pointer hover:text-accent' : 'cursor-default'
              }`}
              onClick={isGroupConversation ? onNameClick : undefined}
              title={isGroupConversation ? 'Doi ten nhom' : undefined}
            >
              {participantName}
            </button>
            <div className="chat-header-status">
              {isConversationActiveCall ? <span className="online-dot" /> : <span className={`online-dot ${isOnline ? '' : 'offline'}`} />}
              {isConversationActiveCall ? 'Đang gọi' : (isOnline ? 'Đang hoạt động' : 'Ngoại tuyến')}
            </div>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="chat-header-actions flex-shrink-0">
          {isConversationActiveCall && (
            <span className="hidden items-center gap-1.5 rounded-full border border-accent bg-accent-light px-3 py-1 text-xs font-semibold text-accent sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
              Đang gọi
            </span>
          )}
          <button
            type="button"
            className={`chat-header-btn ${isAudioCallActive ? 'is-active' : ''}`}
            title={isGroupConversation ? 'Gọi hoặc tham gia thoại nhóm' : 'Gọi thoại'}
            disabled={!isCallingAvailable}
            onClick={onStartAudioCall}
          >
            <PhoneIcon className="w-5 h-5" />
          </button>
          <button
            type="button"
            className={`chat-header-btn ${isVideoCallActive ? 'is-active' : ''}`}
            title={isGroupConversation ? 'Gọi hoặc tham gia video nhóm' : 'Gọi video'}
            disabled={!isCallingAvailable}
            onClick={onStartVideoCall}
          >
            <VideoIcon className="w-5 h-5" />
          </button>
          <button
            type="button"
            className="chat-header-btn"
            title="Thông tin"
            onClick={onInfoClick}
          >
            <InfoIcon className="w-5 h-5" />
          </button>
        </div>
      </header>
      
      {jumpStatus && (
        <div className="chat-jump-status">
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 animate-pulse text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="17 11 12 6 7 11"/>
              <polyline points="17 18 12 13 7 18"/>
            </svg>
            <span>{jumpStatus}</span>
          </div>
          <button onClick={() => setJumpStatus(null)} className="flex h-6 w-6 items-center justify-center rounded-full text-text-tertiary hover:bg-border hover:text-text-primary transition-colors">
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      )}

      {inputDisabled && (
        <div className="border-b border-border bg-bg-hover px-6 py-2 text-sm text-text-secondary">
          {inputDisabledReason ?? 'Bạn không thể nhắn tin trong hội thoại này.'}
        </div>
      )}

      {shouldRenderCallOverlay && (
        <div
          className={`absolute z-[40] flex flex-col ${
            isCallMinimized
              ? 'bottom-4 right-4 w-[min(360px,calc(100%-2rem))] pointer-events-none'
              : `inset-0 ${isCompactCallState ? 'items-start justify-center bg-transparent pointer-events-none p-3 sm:p-5' : 'bg-bg-card'}`
          }`}
        >
          <div
            className={`pointer-events-auto flex w-full flex-col overflow-hidden ${
              isCallMinimized
                ? 'max-h-[70vh] rounded-2xl border border-border shadow-2xl bg-bg-card'
                : isCompactCallState ? 'max-w-xl rounded-2xl border border-border shadow-2xl bg-bg-card' : 'flex-1 h-full'
            }`}
          >
            <div className={`border-b border-border shrink-0 bg-bg-card ${isCallMinimized ? 'px-3 py-3' : 'px-5 py-4'}`}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-sm font-semibold text-text-primary">
                    {callStatusLabel[callStatus]}
                  </p>
                  <p className="text-xs text-text-tertiary">
                    {callPeerName
                      ? (isGroupCallActive ? `Nhóm gọi: ${callPeerName}` : `Người tham gia: ${callPeerName}`)
                      : 'Đang đồng bộ thông tin cuộc gọi'}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-text-secondary">
                    <span className="rounded-full border border-border bg-bg-hover px-2.5 py-1">
                      {callTypeLabel}
                    </span>
                    {showCameraOffBadge && (
                      <span className="rounded-full border border-border bg-bg-hover px-2.5 py-1">
                        Camera tắt
                      </span>
                    )}
                  </div>
                  {isGroupCallActive && callParticipantNames.length > 0 && !isCallMinimized && (
                    <p className="mt-1 text-xs text-text-secondary">
                      Thành viên: {callParticipantNames.join(', ')}
                    </p>
                  )}
                  {isGroupCallActive && activeSpeakerName && callStatus === 'connected' && (
                    <p className="mt-1 text-xs font-semibold text-text-primary">
                      Đang nói: {activeSpeakerName}
                    </p>
                  )}
                  {callError && <p className="mt-1 text-xs text-text-primary">{callError}</p>}
                  {sharingParticipantName && callStatus === 'connected' && (
                    <p className="mt-1 text-xs font-semibold text-accent">
                      Đang chia sẻ: {sharingParticipantName}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {!isCompactCallState && (
                    <button
                      type="button"
                      onClick={() => setIsCallMinimized((prev) => !prev)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-bg-hover px-3 py-1.5 text-xs font-semibold text-text-primary hover:bg-accent transition"
                    >
                      {isCallMinimized ? <MaximizeIcon className="h-3.5 w-3.5" /> : <MinimizeIcon className="h-3.5 w-3.5" />}
                      {isCallMinimized ? 'Mở rộng' : 'Thu nhỏ'}
                    </button>
                  )}

                  {isTerminalCallState && (
                    <button
                      type="button"
                      onClick={onDismissCallBanner}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-bg-hover px-3 py-1.5 text-xs font-semibold text-text-primary hover:bg-accent"
                    >
                      <CloseIcon className="h-3.5 w-3.5" />
                      Đóng
                    </button>
                  )}

                  {isIncomingCallStatus(callStatus) && (
                    <>
                      <button
                        type="button"
                        onClick={onAcceptIncomingCall}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-bg-hover px-3 py-1.5 text-xs font-semibold text-text-primary hover:bg-bg-hover"
                      >
                        <CheckIcon className="h-3.5 w-3.5" />
                        Nhận
                      </button>
                      <button
                        type="button"
                        onClick={onRejectIncomingCall}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-text-primary hover:bg-red-500/20"
                      >
                        <CloseIcon className="h-3.5 w-3.5" />
                        Từ chối
                      </button>
                    </>
                  )}

                  {callStatus === 'connected' && (
                    <>
                      <button
                        type="button"
                        onClick={onToggleMic}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-bg-hover px-3 py-1.5 text-xs font-semibold text-text-primary hover:bg-accent transition"
                      >
                        <MicIcon className="h-3.5 w-3.5" />
                        {isMicMuted ? 'Bật mic' : 'Tắt mic'}
                      </button>
                      <button
                        type="button"
                        onClick={onToggleCamera}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-bg-hover px-3 py-1.5 text-xs font-semibold text-text-primary hover:bg-accent transition"
                      >
                        <CameraControlIcon className="h-3.5 w-3.5" />
                        {isCameraEnabled ? 'Tắt camera' : 'Bật camera'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void onToggleScreenShare();
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-bg-hover px-3 py-1.5 text-xs font-semibold text-text-primary hover:bg-accent transition"
                      >
                        <ScreenShareIcon className="h-3.5 w-3.5" />
                        {isScreenSharing ? 'Dừng chia sẻ' : 'Chia sẻ màn hình'}
                      </button>
                    </>
                  )}

                  {!isIncomingCallStatus(callStatus) && callStatus !== 'ended' && callStatus !== 'missed' && callStatus !== 'rejected' && (
                    <button
                      type="button"
                      onClick={onEndCall}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-500/20 transition"
                    >
                      <EndCallIcon className="h-3.5 w-3.5" />
                      Kết thúc
                    </button>
                  )}
                </div>
              </div>
            </div>

            {shouldRenderCallMedia && (
              <div className={`flex min-h-0 flex-col ${isCallMinimized ? 'max-h-52' : isTerminalCallState ? 'max-h-[52vh]' : 'flex-1'} bg-bg-primary p-4`}>
                <div className={mainStageClass}>
                  {isViewingScreenShare ? (
                    <>
                      {isScreenSharing ? (
                        <video
                          ref={screenShareVideoRef}
                          autoPlay
                          muted
                          playsInline
                          className="absolute inset-0 h-full w-full object-contain"
                        />
                      ) : (
                        <video
                          autoPlay
                          playsInline
                          className="absolute inset-0 h-full w-full object-contain"
                          ref={(node) => {
                            if (!node || !remoteScreenShareParticipant) {
                              return;
                            }
                            if (node.srcObject !== remoteScreenShareParticipant.stream) {
                              node.srcObject = remoteScreenShareParticipant.stream;
                            }
                          }}
                        />
                      )}
                      <div className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/80 to-transparent p-3 pointer-events-none">
                        <p className="text-xs font-medium text-white drop-shadow-sm">Màn hình đang chia sẻ</p>
                      </div>
                    </>
                  ) : isGroupCallActive ? (
                    <>
                      {mainStageParticipant ? (
                        <video
                          autoPlay
                          playsInline
                          className="absolute inset-0 h-full w-full object-contain"
                          ref={(node) => {
                            if (!node) {
                              return;
                            }
                            if (node.srcObject !== mainStageParticipant.stream) {
                              node.srcObject = mainStageParticipant.stream;
                            }
                          }}
                        />
                      ) : (
                        <video
                          autoPlay
                          muted
                          playsInline
                          className="absolute inset-0 h-full w-full object-contain"
                          ref={(node) => {
                            if (!node) {
                              return;
                            }
                            const localStream = localVideoRef?.current?.srcObject;
                            if (localStream && node.srcObject !== localStream) {
                              node.srcObject = localStream;
                            }
                          }}
                        />
                      )}
                      <div className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/80 to-transparent p-3 pointer-events-none">
                        <p className="text-xs font-medium text-white drop-shadow-sm">
                          {mainStageParticipant?.displayName ?? 'Camera của bạn'}
                          {mainStageParticipant?.userId === activeSpeakerUserId ? ' - Đang nói' : ''}
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <video
                        ref={remoteVideoRef}
                        autoPlay
                        playsInline
                        className="absolute inset-0 h-full w-full object-contain"
                      />
                      {callPeerName && (
                        <div className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/80 to-transparent p-4 pointer-events-none">
                          <p className="text-sm font-medium text-white drop-shadow-sm">{callPeerName}</p>
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className={stripContainerClass}>
                  <div className={stripTrackClass}>
                    <div className={stripTileClass}>
                      <video
                        ref={localVideoRef}
                        autoPlay
                        muted
                        playsInline
                        className="absolute inset-0 h-full w-full object-contain"
                      />
                      <div className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/80 to-transparent p-2 pointer-events-none">
                        <p className="text-[11px] font-medium text-white drop-shadow-sm">Bạn</p>
                      </div>
                    </div>

                    {isGroupCallActive && participantVideosForTiles.map((participant) => (
                      <div
                        key={participant.userId}
                        className={`${stripTileClass} ${
                          activeSpeakerUserId === participant.userId
                            ? 'border-accent ring-2 ring-accent'
                            : 'border-border'
                        }`}
                      >
                        <video
                          autoPlay
                          playsInline
                          className="absolute inset-0 h-full w-full object-contain"
                          ref={(node) => {
                            if (!node) {
                              return;
                            }
                            if (node.srcObject !== participant.stream) {
                              node.srcObject = participant.stream;
                            }
                          }}
                        />
                        <div className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/80 to-transparent p-2 pointer-events-none">
                          <p className="text-[11px] font-medium text-white drop-shadow-sm">
                            {participant.displayName}
                            {activeSpeakerUserId === participant.userId ? ' - Đang nói' : ''}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Messages Area */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-x-hidden overflow-y-auto px-4 py-4 chat-messages-scroll"
      >
        <ReactionDetailsModalProvider containerRef={messagesContainerRef}>
          <StatusDetailsModalProvider containerRef={messagesContainerRef}>
            <ReactionPickerProvider>
              <MenuProvider>
            <div ref={menuLayerRef} className="relative">
            {/* Load More Button */}
            {messages.length > 0 && hasMoreMessages && (
              <div className="flex justify-center mb-6">
                <button
                  onClick={onLoadMore}
                  disabled={isLoading}
                  className="chat-load-more-btn"
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <ButtonSpinner size="sm" tone="muted" />
                      Đang tải...
                    </span>
                  ) : (
                    'Tin nhắn cũ hơn'
                  )}
                </button>
              </div>
            )}

            {/* Empty State */}
            {messages.length === 0 ? (
              <div className="chat-empty-state">
                {/* Icon */}
                <div className="relative">
                  <div className="chat-empty-icon">
                    <svg className="h-10 w-10 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                  </div>
                </div>

                {/* Text */}
                <div className="space-y-1">
                  <p className="chat-empty-title">Bắt đầu cuộc trò chuyện</p>
                  <p className="chat-empty-desc">
                    Nhắn tin ngay để bắt đầu trò chuyện với <span className="font-semibold text-accent">{participantName}</span>
                  </p>
                </div>

                {/* Quick hint */}
                <div className="flex items-center gap-2 rounded-full border border-border bg-bg-hover px-4 py-2 text-xs text-text-tertiary">
                  <svg className="h-3.5 w-3.5 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"/>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                  Nhấn Enter để gửi tin nhắn
                </div>
              </div>
            ) : (
              <>
                {isRemovedFromGroup && !hasRemovedNoticeInMessages && (
                  <div className="my-3 flex flex-col items-center gap-1.5">
                  </div>
                )}

                {messagesForDisplay.map((message) => {
                  const avatarUrl = message.sender?.avatarUrl as string
                  const displayName = message.sender?.displayName as string

                  return (<div
                    key={message._id}
                    ref={(node) => {
                      messageRowRefs.current[message._id] = node;
                    }}
                    className={`chat-message-row ${String(message.senderId) === String(currentUserId) ? 'own' : 'other'}`}
                  >
                    <MessageItem
                      message={message}
                      isSender={String(message.senderId) === String(currentUserId)}
                      canRecall={canRecallMessage(message.createdAt)}
                      senderAvatar={avatarUrl}
                      senderDisplayName={displayName}
                      messageStatus={messageStatus}
                      onDeleteForMe={onDeleteMessageForMe}
                      onRecall={onRecallMessage}
                      onForward={onForwardMessage}
                      onReply={handleReplyMessage}
                      onJumpToMessage={handleJumpToMessage}
                      reactionUserState={reactionUserStateByMessage[message._id] || message.reactionUserState}
                      onReactionUpsert={onReactionUpsert}
                      onReactionRemoveAllMine={onReactionRemoveAllMine}
                      onFetchReactionDetails={onFetchReactionDetails}
                      onReact={handleReactMessage}
                    />
                  </div>)
                })}

                {/* Typing Indicator */}
                {typingUsers.length > 0 && (
                  <TypingIndicator
                    userNames={typingUsers.map((u) => u.displayName)}
                  />
                )}

                <div ref={messagesEndRef} />
              </>
            )}

              <ReactionPicker containerRef={menuLayerRef} staticRef={messagesContainerRef} />
              <Menu containerRef={menuLayerRef} staticRef={messagesContainerRef} />
            </div>
            <ReactionDetailsModal />
            <StatusDetailsModal />
              </MenuProvider>
            </ReactionPickerProvider>
          </StatusDetailsModalProvider>
        </ReactionDetailsModalProvider>
      </div>

      {/* Input Area */}
      <MessageInput
        conversationId={conversationId}
        onSend={(content, type, mediaUrl, options) => {
          return onSendMessage(content, type as MessageType, mediaUrl, options);
        }}
        onCancelPendingMessage={onCancelPendingMessage}
        onStartTyping={onStartTyping}
        onStopTyping={onStopTyping}
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
        isLoading={isLoading}
      />
    </article>
  );
}

// ==================== MAIN COMPONENT ====================

interface HomeDashboardChatPanelProps {
  conversations?: ConversationItem[];
  selectedConversationId?: string;
  onSelectConversation?: (id: string) => void;
  searchTargets?: ConversationSearchTarget[];
  onSelectSearchTarget?: (target: ConversationSearchTarget) => void;
  onToggleConversationPin?: (conversationId: string, shouldPin: boolean) => Promise<void>;
  onMuteConversation?: (conversationId: string, duration: '1h' | '4h' | '8h' | 'until_enabled') => Promise<void>;
  onUnmuteConversation?: (conversationId: string) => Promise<void>;
  isConversationPinned?: boolean;
  conversationMutedUntil?: Date | null;
  aiCatchupByConversation?: Record<string, AiCatchupDigest>;
  onRequestAiCatchup?: (conversationId: string) => Promise<void> | void;
  onToggleAiCatchupSetting?: (conversationId: string, catchupEnabled: boolean) => Promise<void> | void;
  friends?: GroupFriendOption[];
  onCreateGroup?: (name: string, memberIds: string[]) => Promise<{ _id: string }>;
  onUpdateGroup?: (groupId: string, payload: { name?: string; avatarUrl?: string | null }) => Promise<void>;
  onAddGroupMembers?: (groupId: string, memberIds: string[]) => Promise<void>;
  onUpdateGroupMemberRole?: (groupId: string, targetUserId: string, role: 'admin' | 'member') => Promise<void>;
  onUpdateGroupMemberApproval?: (groupId: string, memberApprovalEnabled: boolean) => Promise<void>;
  onRemoveGroupMember?: (groupId: string, targetUserId: string) => Promise<void>;
  onDisbandGroup?: (groupId: string) => Promise<void>;
  onLeaveGroup?: (groupId: string) => Promise<void>;
  isCreatingGroup?: boolean;
  initialCreateGroupOpen?: boolean;
  onLoadMore?: () => Promise<void>;
  chatPanelProps?: Partial<ChatPanelProps>;
}

interface CreateGroupModalProps {
  open: boolean;
  friends: GroupFriendOption[];
  selectedFriendIds: string[];
  groupName: string;
  query: string;
  isCreatingGroup: boolean;
  onClose: () => void;
  onChangeGroupName: (value: string) => void;
  onChangeQuery: (value: string) => void;
  onToggleFriend: (friendId: string) => void;
  onSubmit: () => void;
}

interface AddMembersModalProps {
  open: boolean;
  friends: GroupFriendOption[];
  existingMemberIds: string[];
  selectedMemberIds: string[];
  query: string;
  isSubmitting: boolean;
  onClose: () => void;
  onChangeQuery: (value: string) => void;
  onToggleMember: (friendId: string) => void;
  onSubmit: () => void;
}

interface ManageGroupModalProps {
  open: boolean;
  members: Array<{ _id: string; displayName: string; avatarUrl?: string }>;
  adminIds: string[];
  creatorId?: string;
  isSubmitting: boolean;
  groupName: string;
  onClose: () => void;
  onAssignRole: (memberId: string, role: 'admin' | 'member') => Promise<void>;
  onRemoveMember: (memberId: string) => Promise<void>;
  onDisbandGroup: () => Promise<void>;
}

function CreateGroupModal({
  open,
  friends,
  selectedFriendIds,
  groupName,
  query,
  isCreatingGroup,
  onClose,
  onChangeGroupName,
  onChangeQuery,
  onToggleFriend,
  onSubmit,
}: CreateGroupModalProps) {
  if (!open) return null;

  const normalizedQuery = query.trim().toLowerCase();
  const filteredFriends = normalizedQuery
    ? friends.filter((friend) => friend.displayName.toLowerCase().includes(normalizedQuery))
    : friends;

  const selectedSet = new Set(selectedFriendIds);
  const selectedFriends = friends.filter((friend) => selectedSet.has(friend.id));
  const canSubmit = selectedFriendIds.length >= 2 && selectedFriendIds.length <= 100 && !isCreatingGroup;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4">
      <div className="w-full max-w-4xl rounded-2xl border border-border bg-bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h3 className="text-2xl font-semibold text-text-primary">Tạo nhóm</h3>
          <button
            type="button"
            className="rounded-full bg-bg-hover px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-active"
            onClick={onClose}
          >
            Đóng
          </button>
        </div>

        <div className="px-6 py-4">
          <input
            value={groupName}
            onChange={(e) => onChangeGroupName(e.target.value)}
            placeholder="Nhập tên nhóm"
            className="mb-3 h-11 w-full rounded-xl border border-border bg-bg-hover px-4 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-accent"
          />

          <input
            value={query}
            onChange={(e) => onChangeQuery(e.target.value)}
            placeholder="Nhập tên bạn để tìm"
            className="h-11 w-full rounded-xl border border-border bg-bg-hover px-4 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-accent"
          />

          <p className="mt-3 text-sm text-text-secondary">
            Đã chọn {selectedFriendIds.length}/100 bạn. Cần tối thiểu 2 bạn để tạo nhóm.
          </p>
        </div>

        <div className="grid gap-4 border-t border-border px-6 py-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="max-h-[380px] overflow-y-auto rounded-xl border border-border bg-bg-hover p-3">
            <p className="mb-3 text-sm font-semibold text-text-primary">Bạn bè của tôi</p>
            <div className="space-y-2">
              {filteredFriends.map((friend) => {
                const isSelected = selectedSet.has(friend.id);
                return (
                  <button
                    key={friend.id}
                    type="button"
                    onClick={() => onToggleFriend(friend.id)}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition ${
                      isSelected
                        ? 'border-accent bg-bg-active'
                        : 'border-border hover:border-accent-light hover:bg-bg-active'
                    }`}
                  >
                    <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full border ${
                      isSelected ? 'border-accent bg-accent text-white' : 'border-border text-transparent'
                    }`}>
                      ✓
                    </span>
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-accent-light text-sm font-semibold text-accent">
                      {friend.displayName.substring(0, 2).toUpperCase()}
                    </span>
                    <span className="truncate text-sm font-medium text-text-primary">{friend.displayName}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="max-h-[380px] overflow-y-auto rounded-xl border border-border bg-bg-hover p-3">
            <p className="mb-3 text-sm font-semibold text-text-primary">Đã chọn</p>
            {selectedFriends.length === 0 ? (
              <p className="text-sm text-text-tertiary">Chưa có thành viên nào được chọn.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {selectedFriends.map((friend) => (
                  <button
                    key={friend.id}
                    type="button"
                    onClick={() => onToggleFriend(friend.id)}
                    className="inline-flex items-center gap-2 rounded-full bg-bg-active px-3 py-1 text-sm text-text-primary"
                  >
                    <span>{friend.displayName}</span>
                    <span>x</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
          <button
            type="button"
            className="rounded-lg bg-bg-hover px-6 py-2 font-semibold text-text-secondary hover:bg-bg-active"
            onClick={onClose}
            disabled={isCreatingGroup}
          >
            Hủy
          </button>
          <button
            type="button"
            className="rounded-lg bg-accent px-6 py-2 font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
            onClick={onSubmit}
            disabled={!canSubmit}
          >
            {isCreatingGroup ? 'Đang tạo...' : 'Tạo nhóm'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddMembersModal({
  open,
  friends,
  existingMemberIds,
  selectedMemberIds,
  query,
  isSubmitting,
  onClose,
  onChangeQuery,
  onToggleMember,
  onSubmit,
}: AddMembersModalProps) {
  if (!open) return null;

  const existingSet = new Set(existingMemberIds);
  const selectedSet = new Set(selectedMemberIds);
  const normalizedQuery = query.trim().toLowerCase();

  const filteredFriends = normalizedQuery
    ? friends.filter((friend) => friend.displayName.toLowerCase().includes(normalizedQuery))
    : friends;

  const canSubmit = selectedMemberIds.length > 0 && !isSubmitting;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4">
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h3 className="text-2xl font-semibold text-text-primary">Thêm thành viên</h3>
          <button
            type="button"
            className="rounded-full bg-bg-hover px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-active"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Đóng
          </button>
        </div>

        <div className="px-6 py-4">
          <label className="flex h-11 items-center gap-2 rounded-xl border border-border bg-bg-hover px-3 text-text-secondary">
            <SearchIcon />
            <input
              type="text"
              value={query}
              onChange={(e) => onChangeQuery(e.target.value)}
              placeholder="Nhập tên hiển thị hoặc @username"
              className="w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-tertiary"
            />
          </label>
        </div>

        <div className="max-h-[420px] overflow-y-auto border-t border-border px-6 py-4">
          <p className="mb-3 text-sm font-semibold text-text-primary">Trò chuyện gần đây</p>
          <div className="space-y-2">
            {filteredFriends.map((friend) => {
              const isExisting = existingSet.has(friend.id);
              const isSelected = selectedSet.has(friend.id);

              return (
                <button
                  key={friend.id}
                  type="button"
                  disabled={isExisting}
                  onClick={() => onToggleMember(friend.id)}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition ${
                    isExisting
                      ? 'cursor-not-allowed border-border bg-bg-hover opacity-70'
                      : isSelected
                        ? 'border-accent bg-bg-active'
                        : 'border-border hover:border-accent-light hover:bg-bg-active'
                  }`}
                >
                  <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full border ${
                    isExisting || isSelected
                      ? 'border-accent bg-accent text-white'
                      : 'border-border text-transparent'
                  }`}>
                    ✓
                  </span>
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-accent-light text-sm font-semibold text-accent">
                    {friend.displayName.substring(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text-primary">{friend.displayName}</p>
                    {isExisting && <p className="text-xs text-text-tertiary">Đã tham gia</p>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
          <button
            type="button"
            className="rounded-lg bg-bg-hover px-6 py-2 font-semibold text-text-secondary hover:bg-bg-active"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Hủy
          </button>
          <button
            type="button"
            className="rounded-lg bg-accent px-6 py-2 font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
            onClick={onSubmit}
            disabled={!canSubmit}
          >
            {isSubmitting ? 'Đang thêm...' : 'Xác nhận'}
          </button>
        </div>
      </div>
    </div>
  );
}

function GroupMembersPreview({
  members,
  adminIds,
  creatorId,
}: {
  members: Array<{ _id: string; displayName: string; avatarUrl?: string }>;
  adminIds: string[];
  creatorId?: string;
}) {
  if (members.length === 0) {
    return <p className="text-sm text-text-primary">Nhóm chưa có thành viên.</p>;
  }

  const adminSet = new Set(adminIds);

  return (
    <div className="space-y-2">
      {members.map((member) => {
        const isCreator = creatorId === member._id;
        const isAdmin = adminSet.has(member._id);

        return (
          <div key={member._id} className="flex items-center justify-between gap-3 rounded-xl bg-bg-hover px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-text-primary">{member.displayName}</p>
              <p className="text-xs text-text-tertiary">
                {isCreator ? 'Người tạo nhóm' : isAdmin ? 'Quản trị viên' : 'Thành viên'}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ManageGroupModal({
  open,
  members,
  adminIds,
  creatorId,
  isSubmitting,
  groupName,
  onClose,
  onAssignRole,
  onRemoveMember,
  onDisbandGroup,
}: ManageGroupModalProps) {
  if (!open) return null;

  const adminSet = new Set(adminIds);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4">
      <div className="w-full max-w-3xl rounded-2xl border border-border bg-bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h3 className="text-2xl font-semibold text-text-primary">Quản lý nhóm</h3>
          <button
            type="button"
            className="rounded-full bg-bg-hover px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-active"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Đóng
          </button>
        </div>

        <div className="max-h-[430px] overflow-y-auto px-6 py-4">
          <p className="mb-3 text-sm font-semibold text-text-primary">Thành viên nhóm</p>
          <div className="space-y-2">
            {members.map((member) => {
              const isCreator = creatorId === member._id;
              const isAdmin = adminSet.has(member._id);

              return (
                <div
                  key={member._id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-bg-hover px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text-primary">{member.displayName}</p>
                    <p className="text-xs text-text-secondary">
                      {isCreator ? 'Người tạo nhóm' : isAdmin ? 'Quản trị viên' : 'Thành viên'}
                    </p>
                  </div>

                  {!isCreator && (
                    <div className="flex flex-wrap items-center gap-2">
                      {isAdmin ? (
                        <button
                          type="button"
                          disabled={isSubmitting}
                          onClick={() => onAssignRole(member._id, 'member')}
                          className="rounded-lg bg-bg-active px-3 py-1 text-xs font-semibold text-text-primary hover:bg-bg-hover disabled:opacity-60"
                        >
                          Gỡ quyền
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={isSubmitting}
                          onClick={() => onAssignRole(member._id, 'admin')}
                          className="rounded-lg bg-accent px-3 py-1 text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
                        >
                          Gán quyền
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => onRemoveMember(member._id)}
                        className="rounded-lg bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-500 hover:bg-red-500/20 disabled:opacity-60"
                      >
                        Xóa thành viên
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
          <p className="text-xs text-text-tertiary">Nhóm: {groupName}</p>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onDisbandGroup}
            className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-60"
          >
            Giải tán nhóm
          </button>
        </div>
      </div>
    </div>
  );
}

export function HomeDashboardChatPanel({
  conversations,
  selectedConversationId = 'c1',
  onSelectConversation = () => {},
  searchTargets = [],
  onSelectSearchTarget = () => {},
  onToggleConversationPin,
  onMuteConversation,
  onUnmuteConversation,
  isConversationPinned = false,
  conversationMutedUntil = null,
  aiCatchupByConversation = {},
  onRequestAiCatchup,
  onToggleAiCatchupSetting,
  friends = [],
  onCreateGroup,
  onUpdateGroup,
  onAddGroupMembers,
  onUpdateGroupMemberRole,
  onUpdateGroupMemberApproval,
  onRemoveGroupMember,
  onDisbandGroup,
  onLeaveGroup,
  isCreatingGroup = false,
  initialCreateGroupOpen = false,
  onLoadMore,
  chatPanelProps = {},
}: HomeDashboardChatPanelProps = {}) {
  const { openViewer } = useMediaViewer();
  const conversationItems = conversations ?? [];
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isAddMembersOpen, setIsAddMembersOpen] = useState(false);
  const [isManageGroupOpen, setIsManageGroupOpen] = useState(false);
  const [isRenameGroupOpen, setIsRenameGroupOpen] = useState(false);
  const [renameGroupDraft, setRenameGroupDraft] = useState('');
  const [isMuteModalOpen, setIsMuteModalOpen] = useState(false);
  const [isLeaveGroupModalOpen, setIsLeaveGroupModalOpen] = useState(false);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [isMembersViewOpen, setIsMembersViewOpen] = useState(false);
  const [archiveTab, setArchiveTab] = useState<'media' | 'files' | 'links'>('media');
  const [groupManageError, setGroupManageError] = useState<string | null>(null);
  const [groupManageSuccess, setGroupManageSuccess] = useState<string | null>(null);
  const [isRemoveMemberConfirmOpen, setIsRemoveMemberConfirmOpen] = useState(false);
  const [removeMemberTargetId, setRemoveMemberTargetId] = useState<string | null>(null);
  const [isDisbandConfirmOpen, setIsDisbandConfirmOpen] = useState(false);
  const [locallyRemovedConversationIds, setLocallyRemovedConversationIds] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  const [groupQuery, setGroupQuery] = useState('');
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [selectedAddMemberIds, setSelectedAddMemberIds] = useState<string[]>([]);
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [isUploadingGroupAvatar, setIsUploadingGroupAvatar] = useState(false);

  const groupAvatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setIsManageGroupOpen(false);
    setGroupManageError(null);
    setGroupManageSuccess(null);
    setIsArchiveOpen(false);
    setIsMembersViewOpen(false);
  }, [selectedConversationId]);

  const visibleConversations = conversationItems.filter(
    (item) => !locallyRemovedConversationIds.includes(item.id),
  );
  const visibleSearchTargets = searchTargets.filter((target) => {
    if (target.type !== 'group') {
      return true;
    }

    const groupId = target.conversationId ?? target.id;
    return !locallyRemovedConversationIds.includes(groupId);
  });

  const selectedConversation = visibleConversations.find((item) => item.id === selectedConversationId);

  const uploadGroupAvatar = async (file: File): Promise<string> => {
    const signatureData = await generateUploadSignature('image');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('api_key', signatureData.apiKey);
    formData.append('signature', signatureData.signature);
    formData.append('timestamp', signatureData.timestamp.toString());
    formData.append('folder', signatureData.folder);

    const uploadedData = await new Promise<{ public_id: string }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `https://api.cloudinary.com/v1_1/${signatureData.cloudName}/image/upload`);

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText) as { public_id: string });
          } catch {
            reject(new Error('Cloudinary upload failed: invalid response'));
          }
          return;
        }

        reject(new Error('Cloudinary upload failed'));
      };

      xhr.onerror = () => {
        reject(new Error('Cloudinary upload failed: network error'));
      };

      xhr.send(formData);
    });

    const verifyResult = await verifyUpload(uploadedData.public_id, 'image');
    return verifyResult.secureUrl;
  };

  const handleOpenGroupAvatarPicker = () => {
    if (!isGroupConversation || !selectedConversationId || !onUpdateGroup || isCreatingGroup) {
      return;
    }

    groupAvatarInputRef.current?.click();
  };

  const handleGroupAvatarFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = '';

    if (!file || !selectedConversationId || !onUpdateGroup) {
      return;
    }

    try {
      setGroupManageError(null);
      setIsUploadingGroupAvatar(true);
      const secureUrl = await uploadGroupAvatar(file);
      await onUpdateGroup(selectedConversationId, { avatarUrl: secureUrl });
    } catch {
      setGroupManageError('Không thể cập nhật ảnh nhóm. Vui lòng thử lại.');
    } finally {
      setIsUploadingGroupAvatar(false);
    }
  };

  const handleChangeGroupName = () => {
    if (!isGroupConversation || !selectedConversationId || !onUpdateGroup || isCreatingGroup) {
      return;
    }

    setRenameGroupDraft(selectedConversation?.name ?? 'Nhóm');
    setIsRenameGroupOpen(true);
  };

  const handleSubmitGroupNameChange = async () => {
    if (!isGroupConversation || !selectedConversationId || !onUpdateGroup || isCreatingGroup) {
      return;
    }

    const suggestedName = selectedConversation?.name ?? 'Nhóm';
    const trimmedName = renameGroupDraft.trim();
    if (!trimmedName) {
      setGroupManageError('Tên nhóm không được để trống.');
      return;
    }

    if (trimmedName === suggestedName) {
      return;
    }

    try {
      setGroupManageError(null);
      await onUpdateGroup(selectedConversationId, { name: trimmedName });
      setIsRenameGroupOpen(false);
    } catch {
      setGroupManageError('Không thể cập nhật tên nhóm. Vui lòng thử lại.');
    }
  };

  const toggleFriendSelection = (friendId: string) => {
    setSelectedFriendIds((prev) => {
      if (prev.includes(friendId)) {
        return prev.filter((id) => id !== friendId);
      }

      if (prev.length >= 100) {
        return prev;
      }

      return [...prev, friendId];
    });
  };

  const openCreateGroupModal = useCallback(() => {
    setGroupName('');
    setGroupQuery('');
    setSelectedFriendIds([]);
    setIsCreateGroupOpen(true);
  }, []);

  const initialCreateGroupOpenRef = useRef(false);
  useEffect(() => {
    if (!initialCreateGroupOpen || initialCreateGroupOpenRef.current) {
      return;
    }

    initialCreateGroupOpenRef.current = true;
    openCreateGroupModal();
  }, [initialCreateGroupOpen, openCreateGroupModal]);

  const handleCreateGroup = async () => {
    if (!onCreateGroup) {
      return;
    }

    const trimmedName = groupName.trim();
    const finalName = trimmedName.length > 0 ? trimmedName : 'Nhóm mới';
    await onCreateGroup(finalName, selectedFriendIds);
    setIsCreateGroupOpen(false);
    setIsInfoOpen(false);
  };

  const openAddMembersModal = () => {
    setMemberSearchQuery('');
    setSelectedAddMemberIds([]);
    setIsAddMembersOpen(true);
  };

  const toggleAddMemberSelection = (friendId: string) => {
    setSelectedAddMemberIds((prev) => {
      if (prev.includes(friendId)) {
        return prev.filter((id) => id !== friendId);
      }
      return [...prev, friendId];
    });
  };

  const handleConfirmAddMembers = async () => {
    if (!onAddGroupMembers || !selectedConversationId || selectedAddMemberIds.length === 0) {
      return;
    }

    try {
      setGroupManageError(null);
      await onAddGroupMembers(selectedConversationId, selectedAddMemberIds);
      setIsAddMembersOpen(false);
    } catch {
      setGroupManageError(memberApprovalEnabled
        ? 'Nhóm đang bật duyệt thành viên. Chỉ chủ nhóm mới có thể duyệt và thêm thành viên.'
        : 'Không thể thêm thành viên. Vui lòng thử lại.');
    }
  };

  const handleToggleMemberApproval = async () => {
    if (!onUpdateGroupMemberApproval || !selectedConversationId || !isCurrentUserGroupCreator) {
      return;
    }

    try {
      setGroupManageError(null);
      await onUpdateGroupMemberApproval(selectedConversationId, !memberApprovalEnabled);
    } catch {
      setGroupManageError('Không thể cập nhật chế độ duyệt thành viên. Vui lòng thử lại.');
    }
  };

  const handleAssignMemberRole = async (memberId: string, role: 'admin' | 'member') => {
    if (!onUpdateGroupMemberRole || !selectedConversationId) {
      return;
    }

    try {
      setGroupManageError(null);
      await onUpdateGroupMemberRole(selectedConversationId, memberId, role);
    } catch {
      setGroupManageError('Không thể cập nhật quyền thành viên. Vui lòng thử lại.');
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!onRemoveGroupMember || !selectedConversationId) {
      return;
    }

    setRemoveMemberTargetId(memberId);
    setIsRemoveMemberConfirmOpen(true);
  };

  const handleConfirmRemoveMember = async () => {
    if (!onRemoveGroupMember || !selectedConversationId || !removeMemberTargetId) {
      return;
    }

    try {
      setGroupManageError(null);
      await onRemoveGroupMember(selectedConversationId, removeMemberTargetId);
      setIsRemoveMemberConfirmOpen(false);
      setRemoveMemberTargetId(null);
    } catch {
      setGroupManageError('Không thể xóa thành viên. Vui lòng thử lại.');
    }
  };

  const handleDisbandGroup = async () => {
    if (!onDisbandGroup || !selectedConversationId) {
      return;
    }

    setIsDisbandConfirmOpen(true);
  };

  const handleConfirmDisbandGroup = async () => {
    if (!onDisbandGroup || !selectedConversationId) {
      return;
    }

    try {
      setGroupManageError(null);
      setGroupManageSuccess(null);
      await onDisbandGroup(selectedConversationId);

      setLocallyRemovedConversationIds((prev) => (
        prev.includes(selectedConversationId) ? prev : [...prev, selectedConversationId]
      ));

      const fallbackConversationId = visibleConversations
        .find((conversation) => conversation.id !== selectedConversationId)?.id;
      onSelectConversation(fallbackConversationId ?? '');

      setIsManageGroupOpen(false);
      setIsInfoOpen(false);
      setIsDisbandConfirmOpen(false);
      setGroupManageSuccess('Nhóm đã giải tán');
    } catch {
      setGroupManageError('Không thể giải tán nhóm. Vui lòng thử lại.');
    }
  };

  const handleLeaveGroup = async () => {
    if (!onLeaveGroup || !selectedConversationId || !isGroupConversation) {
      return;
    }

    setIsLeaveGroupModalOpen(true);
  };

  const handleConfirmLeaveGroup = async () => {
    if (!onLeaveGroup || !selectedConversationId || !isGroupConversation) {
      return;
    }

    try {
      setGroupManageError(null);
      await onLeaveGroup(selectedConversationId);
      setIsLeaveGroupModalOpen(false);
      setIsInfoOpen(false);
      setIsManageGroupOpen(false);
    } catch {
      setGroupManageError('Không thể rời nhóm. Vui lòng thử lại.');
    }
  };

  const handleTogglePinConversation = async () => {
    if (!selectedConversationId || !onToggleConversationPin) {
      return;
    }

    try {
      setGroupManageError(null);
      await onToggleConversationPin(selectedConversationId, !isConversationPinned);
    } catch {
      setGroupManageError('Không thể cập nhật ghim hội thoại. Vui lòng thử lại.');
    }
  };

  const handleMuteConversation = async (duration: '1h' | '4h' | '8h' | 'until_enabled') => {
    if (!selectedConversationId || !onMuteConversation) {
      return;
    }

    try {
      setGroupManageError(null);
      await onMuteConversation(selectedConversationId, duration);
      setIsMuteModalOpen(false);
    } catch {
      setGroupManageError('Không thể tắt thông báo. Vui lòng thử lại.');
    }
  };

  const handleUnmuteConversation = async () => {
    if (!selectedConversationId || !onUnmuteConversation) {
      return;
    }

    try {
      setGroupManageError(null);
      await onUnmuteConversation(selectedConversationId);
    } catch {
      setGroupManageError('Không thể bật lại thông báo. Vui lòng thử lại.');
    }
  };

  const handleCloseInfoPanel = () => {
    setIsInfoOpen(false);
    setIsArchiveOpen(false);
    setIsMembersViewOpen(false);
  };

  const handleToggleInfoPanel = () => {
    setIsInfoOpen((prev) => {
      const next = !prev;
      if (!next) {
        setIsArchiveOpen(false);
        setIsMembersViewOpen(false);
      }
      return next;
    });
  };

  const openArchiveView = (tab: 'media' | 'files' | 'links') => {
    setArchiveTab(tab);
    setIsMembersViewOpen(false);
    setIsArchiveOpen(true);
  };

  const openMembersView = () => {
    setIsArchiveOpen(false);
    setIsMembersViewOpen(true);
  };

  const groupMemberPreview = selectedConversation?.members ?? [];
  const groupAdminIds = selectedConversation?.adminIds ?? [];
  const existingMemberIds = groupMemberPreview.map((member) => member._id);
  const isGroupConversation = Boolean(selectedConversation?.isGroup);
  const isRemovedFromGroup = Boolean(isGroupConversation && selectedConversation?.removedFromGroup);
  const memberApprovalEnabled = Boolean(selectedConversation?.memberApprovalEnabled);
  const groupCreatorId = selectedConversation?.createdBy ?? selectedConversation?.adminIds?.[0];
  const isCurrentUserGroupAdmin = Boolean(
    isGroupConversation
      && chatPanelProps.currentUserId
      && groupAdminIds.includes(chatPanelProps.currentUserId),
  );
  const isCurrentUserGroupCreator = Boolean(
    isGroupConversation
      && chatPanelProps.currentUserId
      && groupCreatorId
      && chatPanelProps.currentUserId === groupCreatorId,
  );
  const canManageGroup = isCurrentUserGroupCreator || isCurrentUserGroupAdmin;
  const infoTitle = isGroupConversation ? 'Thông tin nhóm' : 'Thông tin hội thoại';
  const isConversationMuted = Boolean(conversationMutedUntil && new Date(conversationMutedUntil) > new Date());

  const isAiCatchupEnabled = selectedConversation?.aiCatchupEnabled !== false;

  const handleToggleAiCatchup = () => {
    if (!selectedConversationId || !onToggleAiCatchupSetting) {
      return;
    }
    void onToggleAiCatchupSetting(selectedConversationId, !isAiCatchupEnabled);
  };

  const allMessages = chatPanelProps.messages || [];
  const allMediaItems = allMessages.filter((m) => m.type === 'image' || m.type === 'video');
  const allFileItems = allMessages.filter((m) => String(m.type).startsWith('file/') || m.type === 'audio');
  const allLinkItems = allMessages.filter((m) => {
    const content = typeof m.content === 'string' ? m.content : '';
    return /(https?:\/\/|www\.)/i.test(content);
  });
  const mediaItems = allMediaItems.slice(0, 8);
  const fileItems = allFileItems.slice(0, 5);

  return (
    <>
      <input
        ref={groupAvatarInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void handleGroupAvatarFileChange(e);
        }}
      />

      <section className="relative flex h-full w-full min-h-0 min-w-0 flex-1 overflow-hidden rounded-[2rem] border border-border bg-surface-card shadow-lg">
        <div className={`h-full shrink-0 border-r border-border-light bg-bg-card ${
          selectedConversationId
            ? 'hidden md:block md:w-[320px]'
            : 'block w-full md:w-[320px]'
        }`}>
          <ConversationList
            conversations={visibleConversations}
            selectedId={selectedConversationId}
            onSelectConversation={onSelectConversation}
            aiCatchupByConversation={aiCatchupByConversation}
            onRequestAiCatchup={onRequestAiCatchup}
            searchTargets={visibleSearchTargets}
            onSelectSearchTarget={onSelectSearchTarget}
          />
        </div>

        <div className={`h-full min-h-0 min-w-0 flex-1 overflow-hidden flex-col ${
          selectedConversationId 
            ? 'flex fixed md:relative inset-0 z-[60] md:z-auto bg-[var(--surface-card)] md:bg-transparent' 
            : 'hidden md:flex'
        }`}>
          <ChatPanel
            {...chatPanelProps}
            isGroupConversation={isGroupConversation}
            onLoadMore={onLoadMore}
            inputDisabled={isRemovedFromGroup}
            inputDisabledReason={isRemovedFromGroup ? 'Bạn đã bị xóa khỏi nhóm' : undefined}
            onBack={() => onSelectConversation('')}
            onInfoClick={handleToggleInfoPanel}
            onAvatarClick={handleOpenGroupAvatarPicker}
            onNameClick={() => {
              void handleChangeGroupName();
            }}
          />
        </div>

        {isInfoOpen && (
          <aside className="relative hidden h-full w-[320px] shrink-0 border-l border-border bg-bg-card xl:flex xl:flex-col shadow-inner">
            <div className="border-b border-border px-5 py-4">
              <h3 className="text-xl font-semibold text-text-primary">{isMembersViewOpen ? 'Thành viên' : isArchiveOpen ? 'Kho lưu trữ' : infoTitle}</h3>
            </div>

            <div className={`flex-1 overflow-y-auto px-5 py-5 ${(isArchiveOpen || isMembersViewOpen) ? 'hidden' : ''}`}>
              <div className="mb-6 flex flex-col items-center text-center">
                <button
                  type="button"
                  className={`mb-3 inline-flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-bg-hover text-lg font-bold text-accent border-2 border-accent/20 ${isGroupConversation ? 'cursor-pointer hover:border-accent transition-all' : 'cursor-default'}`}
                  onClick={isGroupConversation ? handleOpenGroupAvatarPicker : undefined}
                  disabled={!isGroupConversation || isUploadingGroupAvatar || isCreatingGroup}
                  title={isGroupConversation ? 'Đổi ảnh nhóm' : undefined}
                >
                  {selectedConversation?.avatarUrl ? (
                    <img src={selectedConversation.avatarUrl} alt={selectedConversation?.name ?? 'Nhóm'} className="h-full w-full object-cover" />
                  ) : (
                    <span>{selectedConversation?.avatar ?? 'N'}</span>
                  )}
                </button>
                <button
                  type="button"
                  className={`text-xl font-semibold text-text-primary ${isGroupConversation ? 'cursor-pointer hover:text-accent transition-colors' : 'cursor-default'}`}
                  onClick={isGroupConversation ? () => { void handleChangeGroupName(); } : undefined}
                  disabled={!isGroupConversation || isCreatingGroup}
                  title={isGroupConversation ? 'Đổi tên nhóm' : undefined}
                >
                  {selectedConversation?.name ?? 'Hội thoại'}
                </button>
                <p className="text-sm text-text-secondary mt-1">
                  {selectedConversation?.isGroup
                    ? `${selectedConversation.memberCount ?? 0} thành viên`
                    : 'Hội thoại cá nhân'}
                </p>
              </div>

              <div className="mb-5 grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={isConversationMuted ? () => { void handleUnmuteConversation(); } : () => setIsMuteModalOpen(true)}
                  className={`rounded-xl border px-2 py-2 text-xs font-semibold transition ${isConversationMuted
                    ? 'border-accent-light bg-accent/10 text-accent'
                    : 'border-transparent bg-bg-hover text-text-primary hover:bg-bg-active'}`}
                >
                  {isConversationMuted ? 'Bật thông báo' : 'Tắt thông báo'}
                </button>
                <button
                  type="button"
                  onClick={() => { void handleTogglePinConversation(); }}
                  className={`rounded-xl border px-2 py-2 text-xs font-semibold transition ${isConversationPinned
                    ? 'border-accent-light bg-accent/10 text-accent'
                    : 'border-transparent bg-bg-hover text-text-primary hover:bg-bg-active'}`}
                >
                  {isConversationPinned ? 'Bỏ ghim' : 'Ghim hội thoại'}
                </button>
                <button
                  type="button"
                  onClick={handleToggleAiCatchup}
                  className={`rounded-xl border px-2 py-2 text-xs font-semibold transition ${isAiCatchupEnabled
                    ? 'border-accent-light bg-accent/10 text-accent'
                    : 'border-transparent bg-bg-hover text-text-primary hover:bg-bg-active'}`}
                >
                  {isAiCatchupEnabled ? 'Tat AI' : 'Bat AI'}
                </button>
                {isGroupConversation ? (
                  <>
                    <button
                      type="button"
                      onClick={openAddMembersModal}
                      className="rounded-xl bg-bg-hover px-2 py-2 text-xs font-medium text-text-primary border border-border hover:bg-bg-active transition"
                    >
                      Thêm thành viên
                    </button>
                    {canManageGroup ? (
                      <button
                        type="button"
                        onClick={() => setIsManageGroupOpen(true)}
                        className="col-span-3 rounded-xl bg-accent px-2 py-2 text-xs font-semibold text-white hover:bg-accent-hover transition"
                      >
                        Quản lý nhóm
                      </button>
                    ) : (
                      <p className="col-span-3 rounded-xl bg-bg-hover px-3 py-2 text-xs text-text-secondary border border-border">
                        Bạn có thể đề xuất thêm thành viên. Khi bật duyệt, chỉ chủ nhóm mới có thể duyệt thêm thành viên.
                      </p>
                    )}
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={openCreateGroupModal}
                    className="col-span-1 rounded-xl bg-accent px-2 py-2 text-xs font-semibold text-white hover:bg-accent-hover transition"
                  >
                    Tạo nhóm
                  </button>
                )}
              </div>
                {!isGroupConversation && (
                  <>
                    <div className="mb-4 space-y-2 rounded-2xl border border-border bg-bg-card p-4">
                      <p className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Ảnh/Video</p>
                      <div className="grid grid-cols-4 gap-2">
                        {mediaItems.length > 0 ? (
                          mediaItems.map((media) => (
                            <button
                              key={media._id}
                              type="button"
                              onClick={() => openViewer({ 
                                mediaUrl: media.mediaUrl ?? '', 
                                type: (media.type as 'image' | 'video') || 'image', 
                                senderAvatar: media.sender?.avatarUrl, 
                                senderDisplayName: media.sender?.displayName, 
                                createdAt: media.createdAt 
                              })}
                              className="block h-12 overflow-hidden rounded-lg bg-bg-hover hover:opacity-80"
                            >
                              {media.type === 'image' ? (
                                <img src={media.mediaUrl} alt="media" className="h-full w-full object-cover" />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-xs text-text-primary">
                                  <PlayIcon className="h-3.5 w-3.5" aria-hidden />
                                </div>
                              )}
                            </button>
                          ))
                        ) : (
                          <p className="col-span-4 text-xs text-text-tertiary">Chưa có ảnh/video nào</p>
                        )}
                      </div>
                      <button type="button" onClick={() => openArchiveView('media')} className="w-full rounded-lg bg-bg-hover px-3 py-2 text-sm font-semibold text-text-primary">Xem tất cả</button>
                    </div>
                    <div className="space-y-2 rounded-2xl border border-border bg-bg-card p-4">
                      <p className="text-sm font-semibold uppercase tracking-wide text-text-secondary">File</p>
                      {fileItems.length > 0 ? (
                        fileItems.map((file) => {
                          const fileName = getDisplayFileName(file);
                          return (
                            <a
                              key={file._id}
                              href={file.mediaUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="block truncate text-sm text-text-primary hover:text-accent hover:underline"
                            >
                              {fileName}
                            </a>
                          );
                        })
                      ) : (
                        <p className="text-xs text-text-tertiary">Chưa có file nào</p>
                      )}
                      <button type="button" onClick={() => openArchiveView('files')} className="mt-2 w-full rounded-lg bg-bg-hover px-3 py-2 text-sm font-semibold text-text-primary">Xem tất cả</button>
                    </div>

                    {/* Bai viet cua nguoi dang chat - hien thi 3 bai viet gan nhat */}
                    <AuthorPostsSection conversation={selectedConversation} currentUserId={chatPanelProps.currentUserId} />
                  </>
                )}

                {isGroupConversation && (
                  <>
                    <div className="mb-4 space-y-3 rounded-2xl border border-border bg-bg-card p-4">
                      <p className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Duyệt thành viên</p>
                      <div className="flex items-center justify-between gap-3">
                        {isCurrentUserGroupCreator && (
                          <button
                            type="button"
                            disabled={isCreatingGroup}
                            onClick={handleToggleMemberApproval}
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${memberApprovalEnabled
                              ? 'bg-accent text-text-primary hover:bg-accent-hover'
                              : 'bg-bg-hover text-text-primary hover:bg-accent'} disabled:opacity-60`}
                          >
                            {memberApprovalEnabled ? 'Tắt duyệt' : 'Bật duyệt'}
                          </button>
                        )}
                      </div>
                      {!isCurrentUserGroupCreator && (
                        <p className="text-xs text-text-tertiary">Chỉ chủ nhóm có thể bật/tắt duyệt thành viên.</p>
                      )}
                    </div>

                    <div className="mb-4 space-y-2 rounded-2xl border border-border bg-bg-card p-4">
                      <p className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Thành viên nhóm</p>
                      <p className="text-sm text-text-primary">{selectedConversation?.memberCount ?? 0} thành viên</p>
                      <button
                        type="button"
                        onClick={openMembersView}
                        className="w-full rounded-lg bg-bg-hover px-3 py-2 text-sm font-semibold text-text-primary"
                      >
                        Xem thành viên
                      </button>
                    </div>
                    <div className="space-y-2 rounded-2xl border border-border bg-bg-card p-4">
                      <p className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Ảnh/Video</p>
                      <div className="grid grid-cols-4 gap-2">
                        {mediaItems.length > 0 ? (
                          mediaItems.map((media) => (
                            <button
                              key={media._id}
                              type="button"
                              onClick={() => openViewer({ 
                                mediaUrl: media.mediaUrl ?? '', 
                                type: (media.type as 'image' | 'video') || 'image', 
                                senderAvatar: media.sender?.avatarUrl, 
                                senderDisplayName: media.sender?.displayName, 
                                createdAt: media.createdAt 
                              })}
                              className="block h-12 overflow-hidden rounded-lg bg-bg-hover hover:opacity-80"
                            >
                              {media.type === 'image' ? (
                                <img src={media.mediaUrl} alt="media" className="h-full w-full object-cover" />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-xs text-text-primary">
                                  <PlayIcon className="h-3.5 w-3.5" aria-hidden />
                                </div>
                              )}
                            </button>
                          ))
                        ) : (
                          <p className="col-span-4 text-xs text-text-tertiary">Chưa có ảnh/video nào</p>
                        )}
                      </div>
                      <button type="button" onClick={() => openArchiveView('media')} className="w-full rounded-lg bg-bg-hover px-3 py-2 text-sm font-semibold text-text-primary">Xem tất cả</button>
                    </div>
                    {/* File section for group */}
                    <div className="mt-4 space-y-2 rounded-2xl border border-border bg-bg-card p-4">
                      <p className="text-sm font-semibold uppercase tracking-wide text-text-secondary">File</p>
                      {fileItems.length > 0 ? (
                        fileItems.map((file) => {
                          const fileName = getDisplayFileName(file);
                          return (
                            <a
                              key={file._id}
                              href={file.mediaUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="block truncate text-sm text-text-primary hover:text-accent hover:underline"
                            >
                              {fileName}
                            </a>
                          );
                        })
                      ) : (
                        <p className="text-xs text-text-tertiary">Chưa có file nào</p>
                      )}
                      <button type="button" onClick={() => openArchiveView('files')} className="mt-2 w-full rounded-lg bg-bg-hover px-3 py-2 text-sm font-semibold text-text-primary">Xem tất cả</button>
                    </div>
                    <button
                      type="button"
                      onClick={() => { void handleLeaveGroup(); }}
                      className="mt-4 w-full rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-500 hover:bg-red-500/30"
                    >
                      Rời nhóm
                    </button>
                  </>
                )}
              </div>

              {isArchiveOpen && (
                <div className="absolute inset-0 z-10 flex flex-col bg-bg-card border-l border-border">
                  <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <button type="button" onClick={() => setIsArchiveOpen(false)} className="rounded-lg bg-bg-hover px-3 py-1.5 text-sm text-text-primary">Quay lại</button>
                    <h4 className="text-base font-semibold text-text-primary">Kho lưu trữ</h4>
                    <span className="w-16" />
                  </div>
                  <div className="flex gap-2 border-b border-border px-4 py-3 text-sm">
                    <button type="button" onClick={() => setArchiveTab('media')} className={`rounded-lg px-3 py-1.5 ${archiveTab === 'media' ? 'bg-accent text-text-primary' : 'bg-bg-hover text-text-primary'}`}>Ảnh/Video</button>
                    <button type="button" onClick={() => setArchiveTab('files')} className={`rounded-lg px-3 py-1.5 ${archiveTab === 'files' ? 'bg-accent text-text-primary' : 'bg-bg-hover text-text-primary'}`}>Files</button>
                    <button type="button" onClick={() => setArchiveTab('links')} className={`rounded-lg px-3 py-1.5 ${archiveTab === 'links' ? 'bg-accent text-text-primary' : 'bg-bg-hover text-text-primary'}`}>Links</button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4">
                    {archiveTab === 'media' && (
                      <div className="grid grid-cols-3 gap-3">
                        {allMediaItems.length === 0 && <p className="col-span-full text-sm text-text-tertiary">Chưa có ảnh/video nào.</p>}
                        {allMediaItems.map((media) => (
                          <button key={media._id}
                          type="button"
                          onClick={() => openViewer({ 
                            mediaUrl: media.mediaUrl ?? '', 
                            type: (media.type as 'image' | 'video') || 'image', 
                            senderAvatar: media.sender?.avatarUrl, 
                            senderDisplayName: media.sender?.displayName, 
                            createdAt: media.createdAt 
                          })}
                          className="block h-24 overflow-hidden rounded-lg bg-bg-hover">
                            {media.type === 'image' ? (
                              <img src={media.mediaUrl} alt="media" className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center gap-1 text-xs text-text-primary">
                                <PlayIcon className="h-3.5 w-3.5" aria-hidden />
                                <span>Video</span>
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                    {archiveTab === 'files' && (
                      <div className="space-y-2">
                        {allFileItems.length === 0 && <p className="text-sm text-text-tertiary">Chưa có file nào.</p>}
                        {allFileItems.map((file) => (
                          <a key={file._id} href={file.mediaUrl} target="_blank" rel="noreferrer" className="block rounded-lg bg-bg-hover px-3 py-2 text-sm text-text-primary hover:text-accent">
                            {getDisplayFileName(file)}
                          </a>
                        ))}
                      </div>
                    )}
                    {archiveTab === 'links' && (
                      <div className="space-y-2">
                        {allLinkItems.length === 0 && <p className="text-sm text-text-tertiary">Chưa có link nào.</p>}
                        {allLinkItems.map((msg) => {
                          const content = typeof msg.content === 'string' ? msg.content : '';
                          return (
                            <a key={msg._id} href={content.startsWith('http') ? content : `https://${content}`} target="_blank" rel="noreferrer" className="block rounded-lg bg-bg-hover px-3 py-2 text-sm text-accent-light hover:text-accent">
                              {content}
                            </a>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {isMembersViewOpen && (
                <div className="absolute inset-0 z-10 flex flex-col bg-bg-card border-l border-border">
                  <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <button type="button" onClick={() => setIsMembersViewOpen(false)} className="rounded-lg bg-bg-hover px-3 py-1.5 text-sm text-text-primary">Quay lại</button>
                    <h4 className="text-base font-semibold text-text-primary">Thành viên</h4>
                    <span className="w-16" />
                  </div>

                  <div className="border-b border-border px-4 py-3">
                    <button
                      type="button"
                      onClick={openAddMembersModal}
                      className="w-full rounded-lg bg-bg-hover px-3 py-2 text-sm font-semibold text-text-primary"
                    >
                      + Thêm thành viên
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto px-4 py-3">
                    <p className="mb-3 text-sm font-semibold text-text-primary">Danh sách thành viên ({groupMemberPreview.length})</p>
                    <div className="space-y-2">
                      {groupMemberPreview.map((member) => {
                        const isCreator = groupCreatorId === member._id;
                        const isAdmin = groupAdminIds.includes(member._id);
                        const isMe = chatPanelProps.currentUserId === member._id;

                        return (
                          <div key={member._id} className="flex items-center justify-between rounded-xl bg-bg-hover px-3 py-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-text-primary">{member.displayName} {isMe ? '(Bạn)' : ''}</p>
                              <p className="text-xs text-text-tertiary">
                                {isCreator ? 'Trưởng nhóm' : isAdmin ? 'Quản trị viên' : 'Thành viên'}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </aside>
          )}
      </section>

      {isInfoOpen && (
        <div className="fixed inset-0 z-40 bg-black/45 xl:hidden">
          <aside className="zync-glass-panel zync-glass-panel-strong relative ml-auto h-full w-[88%] max-w-sm overflow-y-auto border-l zync-glass-divider bg-bg-card border-border p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-text-primary">{isMembersViewOpen ? 'Thành viên' : isArchiveOpen ? 'Kho lưu trữ' : infoTitle}</h3>
              <button
                type="button"
                className="rounded-full bg-bg-hover px-3 py-1 text-sm text-text-primary"
                onClick={handleCloseInfoPanel}
              >
                Đóng
              </button>
            </div>

            <div className={(isArchiveOpen || isMembersViewOpen) ? 'hidden' : ''}>
            <div className="mb-5 flex flex-col items-center text-center">
              <button
                type="button"
                className={`mb-3 inline-flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-bg-hover text-lg font-bold text-text-primary ${isGroupConversation ? 'cursor-pointer' : 'cursor-default'}`}
                onClick={isGroupConversation ? handleOpenGroupAvatarPicker : undefined}
                disabled={!isGroupConversation || isUploadingGroupAvatar || isCreatingGroup}
                title={isGroupConversation ? 'Đổi ảnh nhóm' : undefined}
              >
                {selectedConversation?.avatarUrl ? (
                  <img src={selectedConversation.avatarUrl} alt={selectedConversation?.name ?? 'Nhóm'} className="h-full w-full object-cover" />
                ) : (
                  <span>{selectedConversation?.avatar ?? 'N'}</span>
                )}
              </button>
              <button
                type="button"
                className={`text-lg font-semibold text-text-primary ${isGroupConversation ? 'cursor-pointer hover:text-accent-light' : 'cursor-default'}`}
                onClick={isGroupConversation ? () => { void handleChangeGroupName(); } : undefined}
                disabled={!isGroupConversation || isCreatingGroup}
                title={isGroupConversation ? 'Đổi tên nhóm' : undefined}
              >
                {selectedConversation?.name ?? 'Hội thoại'}
              </button>
              <p className="text-sm text-text-tertiary">
                {selectedConversation?.isGroup
                  ? `${selectedConversation.memberCount ?? 0} thành viên`
                  : 'Hội thoại cá nhân'}
              </p>
            </div>

            <div className="mb-5 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={isConversationMuted ? () => { void handleUnmuteConversation(); } : () => setIsMuteModalOpen(true)}
                className={`rounded-xl border px-2 py-2 text-xs font-semibold transition ${isConversationMuted
                  ? 'border-yellow-500/35 bg-yellow-500/10 text-yellow-500'
                  : 'border-transparent bg-bg-hover text-text-primary'}`}
              >
                {isConversationMuted ? 'Bật thông báo' : 'Tắt thông báo'}
              </button>
              <button
                type="button"
                onClick={() => { void handleTogglePinConversation(); }}
                className={`rounded-xl border px-2 py-2 text-xs font-semibold transition ${isConversationPinned
                  ? 'border-accent/35 bg-accent text-text-primary'
                  : 'border-transparent bg-bg-hover text-text-primary'}`}
              >
                {isConversationPinned ? 'Bỏ ghim' : 'Ghim hội thoại'}
              </button>
              {isGroupConversation ? (
                <>
                  <button
                    type="button"
                    onClick={openAddMembersModal}
                    className="rounded-xl bg-bg-hover px-2 py-2 text-xs font-medium text-text-primary"
                  >
                    Thêm thành viên
                  </button>
                  {canManageGroup ? (
                    <button
                      type="button"
                      onClick={() => setIsManageGroupOpen(true)}
                      className="col-span-3 rounded-xl bg-accent px-2 py-2 text-xs font-semibold text-text-primary"
                    >
                      Quản lý nhóm
                    </button>
                  ) : (
                    <p className="col-span-3 rounded-xl bg-bg-hover px-3 py-2 text-xs text-text-secondary">
                      Bạn có thể đề xuất thêm thành viên. Khi bật duyệt, chỉ chủ nhóm mới có thể duyệt thêm thành viên.
                    </p>
                  )}
                </>
              ) : (
                <button
                  type="button"
                  onClick={openCreateGroupModal}
                  className="rounded-xl bg-accent px-2 py-2 text-xs font-semibold text-text-primary"
                >
                  Tạo nhóm trò chuyện
                </button>
              )}
            </div>

            {!isGroupConversation && (
              <>
                <div className="mb-4 space-y-2 rounded-2xl border border-border bg-bg-card p-4">
                  <p className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Ảnh/Video</p>
                  <div className="grid grid-cols-4 gap-2">
                    {mediaItems.length > 0 ? (
                      mediaItems.map((media) => (
                        <button
                          key={media._id}
                          type="button"
                          onClick={() => openViewer({ 
                            mediaUrl: media.mediaUrl ?? '', 
                            type: (media.type as 'image' | 'video') || 'image', 
                            senderAvatar: media.sender?.avatarUrl, 
                            senderDisplayName: media.sender?.displayName, 
                            createdAt: media.createdAt 
                          })}
                          className="block h-12 overflow-hidden rounded-lg bg-bg-hover hover:opacity-80"
                        >
                          {media.type === 'image' ? (
                            <img src={media.mediaUrl} alt="media" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-xs text-text-primary">
                              <PlayIcon className="h-3.5 w-3.5" aria-hidden />
                            </div>
                          )}
                        </button>
                      ))
                    ) : (
                      <p className="col-span-4 text-xs text-text-tertiary">Chưa có ảnh/video nào</p>
                    )}
                  </div>
                  <button type="button" onClick={() => openArchiveView('media')} className="w-full rounded-lg bg-bg-hover px-3 py-2 text-sm font-semibold text-text-primary">Xem tất cả</button>
                </div>
                <div className="space-y-2 rounded-2xl border border-border bg-bg-card p-4">
                  <p className="text-sm font-semibold uppercase tracking-wide text-text-secondary">File</p>
                  {fileItems.length > 0 ? (
                    fileItems.map((file) => {
                      const fileName = getDisplayFileName(file);
                      return (
                        <a
                          key={file._id}
                          href={file.mediaUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="block truncate text-sm text-text-primary hover:text-accent hover:underline"
                        >
                          {fileName}
                        </a>
                      );
                    })
                  ) : (
                    <p className="text-xs text-text-tertiary">Chưa có file nào</p>
                  )}
                  <button type="button" onClick={() => openArchiveView('files')} className="mt-2 w-full rounded-lg bg-bg-hover px-3 py-2 text-sm font-semibold text-text-primary">Xem tất cả</button>
                </div>
              </>
            )}

            {isGroupConversation && (
              <>
                <div className="mb-4 space-y-3 rounded-2xl border border-border bg-bg-card p-4">
                  <p className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Duyệt thành viên</p>
                  <p className="text-sm text-text-primary">
                    Trạng thái: {memberApprovalEnabled ? 'ON - cần chủ nhóm duyệt' : 'OFF - thêm thẳng vào nhóm'}
                  </p>
                  {isCurrentUserGroupCreator ? (
                    <button
                      type="button"
                      disabled={isCreatingGroup}
                      onClick={handleToggleMemberApproval}
                      className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${memberApprovalEnabled
                        ? 'bg-accent text-text-primary'
                        : 'bg-bg-hover text-text-primary'} disabled:opacity-60`}
                    >
                      {memberApprovalEnabled ? 'Tắt duyệt' : 'Bật duyệt'}
                    </button>
                  ) : (
                    <p className="text-xs text-text-tertiary">Chỉ chủ nhóm có thể bật/tắt duyệt thành viên.</p>
                  )}
                </div>

                <div className="mb-4 space-y-2 rounded-2xl border border-border bg-bg-card p-4">
                  <p className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Thành viên nhóm</p>
                  <p className="text-sm text-text-primary">{selectedConversation?.memberCount ?? 0} thành viên</p>
                  <button
                    type="button"
                    onClick={openMembersView}
                    className="w-full rounded-lg bg-bg-hover px-3 py-2 text-sm font-semibold text-text-primary"
                  >
                    Xem thành viên
                  </button>
                </div>
                <div className="space-y-2 rounded-2xl border border-border bg-bg-card p-4">
                  <p className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Ảnh/Video</p>
                  <div className="grid grid-cols-4 gap-2">
                    {mediaItems.length > 0 ? (
                      mediaItems.map((media) => (
                        <button
                          key={media._id}
                          type="button"
                          onClick={() => openViewer({ 
                            mediaUrl: media.mediaUrl ?? '', 
                            type: (media.type as 'image' | 'video') || 'image', 
                            senderAvatar: media.sender?.avatarUrl, 
                            senderDisplayName: media.sender?.displayName, 
                            createdAt: media.createdAt 
                          })}
                          className="block h-12 overflow-hidden rounded-lg bg-bg-hover hover:opacity-80"
                        >
                          {media.type === 'image' ? (
                            <img src={media.mediaUrl} alt="media" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-xs text-text-primary">
                              <PlayIcon className="h-3.5 w-3.5" aria-hidden />
                            </div>
                          )}
                        </button>
                      ))
                    ) : (
                      <p className="col-span-4 text-xs text-text-tertiary">Chưa có ảnh/video nào</p>
                    )}
                  </div>
                  <button type="button" onClick={() => openArchiveView('media')} className="w-full rounded-lg bg-bg-hover px-3 py-2 text-sm font-semibold text-text-primary">Xem tất cả</button>
                </div>
                {/* File section for group (mobile view) */}
                <div className="mt-4 space-y-2 rounded-2xl border border-border bg-bg-card p-4">
                  <p className="text-sm font-semibold uppercase tracking-wide text-text-secondary">File</p>
                  {fileItems.length > 0 ? (
                    fileItems.map((file) => {
                      const fileName = getDisplayFileName(file);
                      return (
                        <a
                          key={file._id}
                          href={file.mediaUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="block truncate text-sm text-text-primary hover:text-accent hover:underline"
                        >
                          {fileName}
                        </a>
                      );
                    })
                  ) : (
                    <p className="text-xs text-text-tertiary">Chưa có file nào</p>
                  )}
                  <button type="button" onClick={() => openArchiveView('files')} className="mt-2 w-full rounded-lg bg-bg-hover px-3 py-2 text-sm font-semibold text-text-primary">Xem tất cả</button>
                </div>
                <button
                  type="button"
                  onClick={() => { void handleLeaveGroup(); }}
                  className="mt-4 w-full rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-500"
                >
                  Rời nhóm
                </button>
              </>
            )}
            </div>

            {isArchiveOpen && (
              <div className="absolute inset-0 z-10 flex flex-col bg-bg-card border-l border-border p-5">
                <div className="mb-4 flex items-center justify-between">
                  <button type="button" onClick={() => setIsArchiveOpen(false)} className="rounded-lg bg-bg-hover px-3 py-1.5 text-sm text-text-primary">Quay lại</button>
                  <h4 className="text-base font-semibold text-text-primary">Kho lưu trữ</h4>
                  <span className="w-16" />
                </div>
                <div className="mb-3 flex gap-2 text-sm">
                  <button type="button" onClick={() => setArchiveTab('media')} className={`rounded-lg px-3 py-1.5 ${archiveTab === 'media' ? 'bg-accent text-text-primary' : 'bg-bg-hover text-text-primary'}`}>Ảnh/Video</button>
                  <button type="button" onClick={() => setArchiveTab('files')} className={`rounded-lg px-3 py-1.5 ${archiveTab === 'files' ? 'bg-accent text-text-primary' : 'bg-bg-hover text-text-primary'}`}>Files</button>
                  <button type="button" onClick={() => setArchiveTab('links')} className={`rounded-lg px-3 py-1.5 ${archiveTab === 'links' ? 'bg-accent text-text-primary' : 'bg-bg-hover text-text-primary'}`}>Links</button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {archiveTab === 'media' && (
                    <div className="grid grid-cols-3 gap-3">
                      {allMediaItems.length === 0 && <p className="col-span-full text-sm text-text-tertiary">Chưa có ảnh/video nào.</p>}
                      {allMediaItems.map((media) => (
                        <button key={media._id} 
                        type="button"
                        onClick={() => openViewer({ 
                          mediaUrl: media.mediaUrl ?? '', 
                          type: (media.type as 'image' | 'video') || 'image', 
                          senderAvatar: media.sender?.avatarUrl, 
                          senderDisplayName: media.sender?.displayName, 
                          createdAt: media.createdAt 
                        })}
                        className="block h-24 overflow-hidden rounded-lg bg-bg-hover">
                          {media.type === 'image' ? (
                            <img src={media.mediaUrl} alt="media" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center gap-1 text-xs text-text-primary">
                              <PlayIcon className="h-3.5 w-3.5" aria-hidden />
                              <span>Video</span>
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                  {archiveTab === 'files' && (
                    <div className="space-y-2">
                      {allFileItems.length === 0 && <p className="text-sm text-text-tertiary">Chưa có file nào.</p>}
                      {allFileItems.map((file) => (
                        <a key={file._id} href={file.mediaUrl} target="_blank" rel="noreferrer" className="block rounded-lg bg-bg-hover px-3 py-2 text-sm text-text-primary hover:text-accent">
                          {getDisplayFileName(file)}
                        </a>
                      ))}
                    </div>
                  )}
                  {archiveTab === 'links' && (
                    <div className="space-y-2">
                      {allLinkItems.length === 0 && <p className="text-sm text-text-secondary">Chưa có link nào.</p>}
                      {allLinkItems.map((msg) => {
                        const content = typeof msg.content === 'string' ? msg.content : '';
                        return (
                          <a key={msg._id} href={content.startsWith('http') ? content : `https://${content}`} target="_blank" rel="noreferrer" className="block rounded-lg bg-bg-hover px-3 py-2 text-sm text-text-primary hover:text-accent">
                            {content}
                          </a>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {isMembersViewOpen && (
              <div className="absolute inset-0 z-10 flex flex-col bg-bg-primary p-5">
                <div className="mb-4 flex items-center justify-between">
                  <button type="button" onClick={() => setIsMembersViewOpen(false)} className="rounded-lg bg-bg-hover px-3 py-1.5 text-sm text-text-primary border border-border">Quay lại</button>
                  <h4 className="text-base font-semibold text-text-primary">Thành viên</h4>
                  <span className="w-16" />
                </div>

                <button
                  type="button"
                  onClick={openAddMembersModal}
                  className="mb-4 w-full rounded-lg bg-bg-hover px-3 py-2 text-sm font-semibold text-text-primary"
                >
                  + Thêm thành viên
                </button>

                <div className="flex-1 overflow-y-auto">
                  <p className="mb-3 text-sm font-semibold text-text-secondary">Danh sách thành viên ({groupMemberPreview.length})</p>
                  <div className="space-y-2">
                    {groupMemberPreview.map((member) => {
                      const isCreator = groupCreatorId === member._id;
                      const isAdmin = groupAdminIds.includes(member._id);
                      const isMe = chatPanelProps.currentUserId === member._id;

                      return (
                        <div key={member._id} className="rounded-xl bg-bg-hover border border-border px-3 py-2">
                          <p className="truncate text-sm font-medium text-text-primary">{member.displayName} {isMe ? '(Bạn)' : ''}</p>
                          <p className="text-xs text-text-secondary">
                            {isCreator ? 'Trưởng nhóm' : isAdmin ? 'Quản trị viên' : 'Thành viên'}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </aside>
        </div>
      )}

      {isRenameGroupOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-bg-card p-6 shadow-2xl">
            <h4 className="text-lg font-semibold text-text-primary">Đổi tên nhóm</h4>
            <input
              value={renameGroupDraft}
              onChange={(e) => setRenameGroupDraft(e.target.value)}
              className="mt-4 w-full rounded-xl border border-border bg-bg-hover px-4 py-2.5 text-sm text-text-primary outline-none focus:border-accent"
              placeholder="Nhập tên nhóm mới"
              maxLength={100}
            />
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setIsRenameGroupOpen(false)} className="rounded-lg bg-bg-hover px-4 py-2 text-sm font-medium text-text-secondary hover:bg-bg-active">Hủy</button>
              <button type="button" onClick={() => { void handleSubmitGroupNameChange(); }} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover transition">Lưu</button>
            </div>
          </div>
        </div>
      )}

      {isMuteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-bg-card p-6 shadow-2xl">
            <h4 className="text-lg font-semibold text-text-primary mb-4">Tắt thông báo</h4>
            <div className="space-y-2">
              <button type="button" onClick={() => { void handleMuteConversation('1h'); }} className="w-full rounded-xl bg-bg-hover px-4 py-3 text-left text-sm text-text-primary hover:bg-bg-active border border-border transition">Trong 1 giờ</button>
              <button type="button" onClick={() => { void handleMuteConversation('4h'); }} className="w-full rounded-xl bg-bg-hover px-4 py-3 text-left text-sm text-text-primary hover:bg-bg-active border border-border transition">Trong 4 giờ</button>
              <button type="button" onClick={() => { void handleMuteConversation('8h'); }} className="w-full rounded-xl bg-bg-hover px-4 py-3 text-left text-sm text-text-primary hover:bg-bg-active border border-border transition">Trong 8 giờ</button>
              <button type="button" onClick={() => { void handleMuteConversation('until_enabled'); }} className="w-full rounded-xl bg-bg-hover px-4 py-3 text-left text-sm text-text-primary hover:bg-bg-active border border-border transition">Cho đến khi tôi bật lại</button>
            </div>
            <button type="button" onClick={() => setIsMuteModalOpen(false)} className="mt-6 w-full rounded-lg bg-bg-hover px-4 py-2 text-sm font-medium text-text-secondary hover:bg-bg-active border border-border">Đóng</button>
          </div>
        </div>
      )}

      {isLeaveGroupModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-bg-card p-6 shadow-2xl">
            <h4 className="text-lg font-semibold text-text-primary">Rời nhóm</h4>
            <p className="mt-2 text-sm text-text-secondary leading-relaxed">Bạn có chắc muốn rời nhóm này? Bạn sẽ không còn nhận được tin nhắn từ nhóm này nữa.</p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsLeaveGroupModalOpen(false)}
                className="rounded-lg bg-bg-hover px-4 py-2 text-sm font-medium text-text-secondary hover:bg-bg-active border border-border"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => { void handleConfirmLeaveGroup(); }}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition"
              >
                Rời nhóm
              </button>
            </div>
          </div>
        </div>
      )}

      {isRemoveMemberConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-bg-card p-6 shadow-2xl">
            <h4 className="text-lg font-semibold text-text-primary">Xóa thành viên</h4>
            <p className="mt-2 text-sm text-text-secondary leading-relaxed">Bạn có chắc muốn xóa thành viên này khỏi nhóm?</p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsRemoveMemberConfirmOpen(false);
                  setRemoveMemberTargetId(null);
                }}
                className="rounded-lg bg-bg-hover px-4 py-2 text-sm font-medium text-text-secondary hover:bg-bg-active border border-border"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => { void handleConfirmRemoveMember(); }}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition"
              >
                Xóa
              </button>
            </div>
          </div>
        </div>
      )}

      {isDisbandConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-bg-card p-6 shadow-2xl">
            <h4 className="text-lg font-semibold text-text-primary">Giải tán nhóm</h4>
            <p className="mt-2 text-sm text-text-secondary leading-relaxed">Giải tán nhóm sẽ xóa toàn bộ nhóm. Bạn có chắc muốn tiếp tục?</p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsDisbandConfirmOpen(false)}
                className="rounded-lg bg-bg-hover px-4 py-2 text-sm font-medium text-text-secondary hover:bg-bg-active border border-border"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => { void handleConfirmDisbandGroup(); }}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition"
              >
                Giải tán
              </button>
            </div>
          </div>
        </div>
      )}

      {groupManageError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-bg-card p-6 shadow-2xl">
            <h4 className="text-lg font-semibold text-red-500">Thông báo</h4>
            <p className="mt-2 text-sm text-text-secondary leading-relaxed">{groupManageError}</p>
            <button
              type="button"
              onClick={() => setGroupManageError(null)}
              className="mt-6 w-full rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-2 text-sm font-semibold text-red-500 hover:bg-red-500/20 transition"
            >
              Đóng
            </button>
          </div>
        </div>
      )}

      {groupManageSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-bg-card p-5">
            <h4 className="text-lg font-semibold text-text-primary">Thành công</h4>
            <p className="mt-2 text-sm text-text-primary">{groupManageSuccess}</p>
            <button
              type="button"
              onClick={() => setGroupManageSuccess(null)}
              className="mt-4 w-full rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-text-primary"
            >
              Đóng
            </button>
          </div>
        </div>
      )}

      <ManageGroupModal
        open={isManageGroupOpen}
        members={groupMemberPreview}
        adminIds={groupAdminIds}
        creatorId={groupCreatorId}
        isSubmitting={isCreatingGroup}
        groupName={selectedConversation?.name ?? 'Nhóm'}
        onClose={() => setIsManageGroupOpen(false)}
        onAssignRole={handleAssignMemberRole}
        onRemoveMember={handleRemoveMember}
        onDisbandGroup={handleDisbandGroup}
      />

      <CreateGroupModal
        open={isCreateGroupOpen}
        friends={friends}
        selectedFriendIds={selectedFriendIds}
        groupName={groupName}
        query={groupQuery}
        isCreatingGroup={isCreatingGroup}
        onClose={() => setIsCreateGroupOpen(false)}
        onChangeGroupName={setGroupName}
        onChangeQuery={setGroupQuery}
        onToggleFriend={toggleFriendSelection}
        onSubmit={handleCreateGroup}
      />

      <AddMembersModal
        open={isAddMembersOpen}
        friends={friends}
        existingMemberIds={existingMemberIds}
        selectedMemberIds={selectedAddMemberIds}
        query={memberSearchQuery}
        isSubmitting={isCreatingGroup}
        onClose={() => setIsAddMembersOpen(false)}
        onChangeQuery={setMemberSearchQuery}
        onToggleMember={toggleAddMemberSelection}
        onSubmit={handleConfirmAddMembers}
      />

      <ForwardMessageModal
        open={Boolean(chatPanelProps.forwardModalOpen)}
        message={chatPanelProps.forwardingMessage ?? null}
        conversations={visibleConversations.map((conversation) => ({
          _id: conversation.id,
          name: conversation.name || 'Hội thoại',
          avatarUrl: conversation.avatarUrl,
          isGroup: conversation.isGroup,
          memberCount: conversation.memberCount,
        }))}
        currentConversationId={selectedConversationId}
        isLoading={Boolean(chatPanelProps.forwardLoading)}
        onClose={() => {
          chatPanelProps.onCloseForwardModal?.();
        }}
        onForward={(_message, toConversationId) => {
          void chatPanelProps.onExecuteForward?.(toConversationId);
        }}
      />
    </>
  );
}
