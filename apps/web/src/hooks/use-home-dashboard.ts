import { useState, useEffect, useCallback, useRef } from 'react';
import type { AxiosError } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { apiClient } from '@/services/api';
import { showSystemToast } from '@/components/notifications/InAppNotificationToasts';
import { fetchFriends, type FriendUser } from '@/services/friends';
import { getAccessToken } from '@/utils/auth-token';
import {
  emitCallAccept,
  emitCallEnd,
  emitCallGroupInvite,
  emitCallInvite,
  emitCallMediaState,
  emitCallReject,
  emitWebRtcAnswer,
  emitWebRtcIceCandidate,
  emitWebRtcOffer,
  emitForwardMessage,
  type CallIncomingPayload,
  type CallInvitedPayload,
  type CallMediaStatePayload,
  type CallParticipantPayload,
  type CallStatusPayload,
  type WebRtcAnswerPayload,
  type WebRtcIceCandidatePayload,
  type WebRtcOfferPayload,
  emitReactionRemoveAllMine,
  emitReactionUpsert,
  getRawSocket,
  getSocket,
  listenToCallIncoming,
  listenToCallInvited,
  listenToCallMediaState,
  listenToCallParticipantJoined,
  listenToCallParticipantLeft,
  listenToCallStatus,
  listenToErrors,
  listenToWebRtcAnswer,
  listenToWebRtcIceCandidate,
  listenToWebRtcOffer,
  listenToReactionAck,
  listenToMessageDeletion,
  listenToMessageRecall,
  listenToReactionError,
  listenToReactionUpdated,
  listenToAiCatchupDigestUpdated,
  unlistenToCallIncoming,
  unlistenToCallInvited,
  unlistenToCallMediaState,
  unlistenToCallParticipantJoined,
  unlistenToCallParticipantLeft,
  unlistenToCallStatus,
  unlistenToErrors,
  unlistenToWebRtcAnswer,
  unlistenToWebRtcIceCandidate,
  unlistenToWebRtcOffer,
  unlistenToReactionAck,
  unlistenToMessageDeletion,
  unlistenToMessageRecall,
  unlistenToReactionError,
  unlistenToReactionUpdated,
  unlistenToAiCatchupDigestUpdated,
} from '@/services/socket';
import { getMessageReactionDetails, type ReactionDetailsResponse } from '@/services/chat';
import type { AiCatchupDigest, AiCatchupDigestUpdatedPayload, AiReminder, Message, MessageReactionSummary, MessageReactionUserState } from '@zync/shared-types';
import {
  createAiCatchupDigest,
  getLatestAiCatchupDigest,
  regenerateAiCatchupDigest,
  updateAiCatchupSettings,
} from '@/services/ai-catchup';
import {
  createReminderFromActionItem,
} from '@/services/ai-reminder';
import {
  addGroupMembers,
  createGroup,
  disbandGroup,
  leaveGroup,
  removeGroupMember,
  updateGroup,
  updateGroupMemberApproval,
  updateGroupMemberRole,
} from '@/services/groups';
import {
  fetchPreferences,
  muteConversation,
  pinConversation,
  unmuteConversation,
  unpinConversation,
} from '@/services/notifications';
import { fetchNotifications, fetchUnreadCount, type Notification } from '@/services/notifications';
import { useChat, useMessageHistory, type SendMessageOptions } from '@/hooks/use-messaging';
import type {
  DashboardHomeMockData,
  DashboardNotificationItem,
  DashboardFriendActivityItem,
} from '@/components/home-dashboard/home-dashboard.types';
import { DASHBOARD_HOME_MOCK_DATA } from '@/components/home-dashboard/mock-data';
import { callStore, subscribeToCallStore, type CallSessionState } from '@/stores/call-store';
import type { MessageType } from '@zync/shared-types';
import { useNotifications } from './use-notifications';

interface DashboardUserPatch {
  displayName?: string;
  avatarUrl?: string;
}

interface Conversation {
  _id: string;
  name?: string;
  avatarUrl?: string;
  type: 'direct' | 'group';
  updatedAt?: string;
  createdBy?: string;
  adminIds?: string[];
  memberApprovalEnabled?: boolean;
  removedFromGroup?: boolean;
  users: Array<{ _id: string; displayName: string; avatarUrl?: string }>;
  lastMessage?: { senderId: string; senderDisplayName?: string; content: string; sentAt: string };
  activeCall?: ConversationActiveCall | null;
  unreadCounts?: Record<string, number>;
  aiPreferences?: {
    catchupEnabled: boolean;
    smartSearchEnabled?: boolean;
  };
}

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

interface ConversationListItem {
  id: string;
  name: string;
  preview: string;
  time: string;
  timestamp: number;
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

interface PresenceState {
  online: boolean;
  lastSeen: string | null;
}

interface ConversationSearchTarget {
  id: string;
  type: 'friend' | 'group';
  name: string;
  avatar?: string;
  avatarUrl?: string;
  conversationId?: string;
}

type ApiErrorPayload = {
  error?: string;
  code?: string;
};

function resolveDirectConversationErrorMessage(err: unknown): string {
  const axiosError = err as AxiosError<ApiErrorPayload>;
  const status = axiosError.response?.status;
  const payload = axiosError.response?.data;

  if (payload?.code === 'DIRECT_MESSAGE_BLOCKED') {
    return 'Không thể nhắn tin vì một trong hai tài khoản đã chặn người còn lại.';
  }

  if (payload?.code === 'DIRECT_MESSAGE_FRIENDS_ONLY') {
    return 'Người này chỉ nhận tin nhắn từ bạn bè.';
  }

  if (payload?.code === 'DIRECT_MESSAGE_USER_DEACTIVATED') {
    return 'Không thể nhắn tin vì tài khoản này đã ngừng hoạt động.';
  }

  if (status === 429) {
    return 'Bạn đang mở quá nhiều cuộc trò chuyện với người chưa kết bạn. Vui lòng thử lại sau.';
  }

  return payload?.error || 'Không thể mở cuộc trò chuyện. Vui lòng thử lại.';
}

function buildMessagePreview(message: Pick<Message, 'content' | 'type'>): string {
  return message.content && message.content.trim().length > 0
    ? message.content
    : message.type === 'image'
      ? 'Đã gửi ảnh'
      : message.type === 'video'
        ? 'Đã gửi video'
        : message.type?.startsWith('file/')
          ? 'Đã gửi tệp đính kèm'
          : message.type === 'audio'
            ? 'Đã gửi âm thanh'
            : message.type === 'sticker'
              ? 'Đã gửi sticker'
              : 'Tin nhắn media';
}

function normalizeCallText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function isVisibleChatMessage(message: Message): boolean {
  return !isCallSummaryMessage(message);
}

function isCallSummaryMessage(message: Message): boolean {
  if (message.type === 'call_history') {
    return false;
  }

  const idempotencyKey = String(message.idempotencyKey || '');
  if (idempotencyKey.startsWith('call-summary:')) {
    return true;
  }

  const content = normalizeCallText(String(message.content || ''));
  return (
    content.startsWith('cuoc goi')
    || content.startsWith('dang trong cuoc goi')
    || content.startsWith('dang co cuoc goi')
  );
}

function formatConversationPreview(lastMessage?: Conversation['lastMessage']): string {
  if (!lastMessage?.content) {
    return 'Không có tin nhắn';
  }

  const normalizedContent = normalizeCallText(lastMessage.content);
  if (
    normalizedContent.startsWith('cuoc goi')
    || normalizedContent.startsWith('dang trong cuoc goi')
    || normalizedContent.startsWith('dang co cuoc goi')
  ) {
    return 'Không có tin nhắn';
  }

  const senderDisplayName = lastMessage.senderDisplayName?.trim();
  if (!senderDisplayName) {
    return lastMessage.content;
  }

  return `${senderDisplayName}: ${lastMessage.content}`;
}

const REACTION_ACK_TIMEOUT_MS = 8000;
const WEBRTC_INSECURE_CONTEXT_MESSAGE = 'Không thể chia sẻ camera/màn hình và đồng bộ WebRTC khi truy cập bằng HTTP LAN. Vui lòng dùng https:// hoặc localhost.';
const LAN_DEMO_WARN_ENABLED = process.env['NEXT_PUBLIC_LAN_DEMO_WARN'] === 'true';

/**
 * Format thời gian tương đối cho notification
 */
function formatTimeLabel(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'Vừa xong';
  if (diffMins < 60) return `${diffMins} phút trước`;
  if (diffHours < 24) return `${diffHours} giờ trước`;
  if (diffDays < 7) return `${diffDays} ngày trước`;

  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

function getWebRtcInsecureContextMessage(): string | null {
  if (!LAN_DEMO_WARN_ENABLED) {
    return null;
  }

  if (typeof window === 'undefined') {
    return null;
  }

  const host = window.location.hostname;
  const isLocalhost = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
  if (window.isSecureContext || isLocalhost) {
    return null;
  }

  return WEBRTC_INSECURE_CONTEXT_MESSAGE;
}

function resolveCallMediaErrorMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof Error && error.message === WEBRTC_INSECURE_CONTEXT_MESSAGE) {
    return WEBRTC_INSECURE_CONTEXT_MESSAGE;
  }

  return fallbackMessage;
}

interface PendingReactionRequest {
  requestId: string;
  messageId: string;
  messageRef: string;
  previousSummary: MessageReactionSummary;
  previousUserState: MessageReactionUserState;
  ackTimeout: NodeJS.Timeout | null;
}

type CallUiStatus = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'connected' | 'ended' | 'missed' | 'rejected';
type CallMediaType = 'audio' | 'video';
const ACTIVE_CALL_CONFLICT_MESSAGE = 'Bạn đang trong một cuộc gọi khác. Vui lòng kết thúc cuộc gọi hiện tại trước.';

interface CallParticipantVideo {
  userId: string;
  displayName: string;
  stream: MediaStream;
}

export function useHomeDashboard() {
  const [data, setData] = useState<DashboardHomeMockData>(DASHBOARD_HOME_MOCK_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string>('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [presenceByUserId, setPresenceByUserId] = useState<Record<string, PresenceState>>({});
  const [pinnedConversationIds, setPinnedConversationIds] = useState<string[]>([]);
  const [mutedUntilByConversation, setMutedUntilByConversation] = useState<Record<string, Date | null>>({});
  const [selectedConversationId, setSelectedConversationId] = useState<string>('');
  const [friendsForGroup, setFriendsForGroup] = useState<FriendUser[]>([]);
  const [groupActionLoading, setGroupActionLoading] = useState(false);
  const [forwardModalOpen, setForwardModalOpen] = useState(false);
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);
  const [forwardLoading, setForwardLoading] = useState(false);
  const [reactionUserStateByMessage, setReactionUserStateByMessage] = useState<Record<string, MessageReactionUserState>>({});
  const [activeCall, setActiveCallState] = useState<CallSessionState | null>(callStore.activeCall);
  const [aiCatchupByConversation, setAiCatchupByConversation] = useState<Record<string, AiCatchupDigest>>({});
  const [aiCatchupRequestingByConversation, setAiCatchupRequestingByConversation] = useState<Record<string, boolean>>({});
  const [aiReminders, setAiReminders] = useState<AiReminder[]>([]);

  useEffect(() => {
    return subscribeToCallStore((call) => {
      setActiveCallState(call);
    });
  }, []);

  const setActiveCall = useCallback((updater: CallSessionState | null | ((prev: CallSessionState | null) => CallSessionState | null)) => {
    callStore.setActiveCall(updater);
  }, []);
  const [callError, setCallError] = useState<string | null>(null);
  const [callFriendError, setCallFriendError] = useState<string | null>(null);
  const callFriendErrorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCameraEnabled, setIsCameraEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenSharingUserId, setScreenSharingUserId] = useState<string | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingReactionRequestsRef = useRef<Map<string, PendingReactionRequest>>(new Map());
  const hydratedReactionStateRefsRef = useRef<Set<string>>(new Set());
  const activeCallRef = useRef<CallSessionState | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenShareVideoRef = useRef<HTMLVideoElement>(null);
  const screenShareStreamRef = useRef<MediaStream | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [remoteParticipantVideos, setRemoteParticipantVideos] = useState<CallParticipantVideo[]>([]);
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingRemoteCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const autoResetCallTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingOutgoingCallRef = useRef<{
    conversationId?: string;
    isGroupCall: boolean;
    initiatedBy: string;
    participantIds: string[];
    participantDisplayNames: Record<string, string>;
    callType?: CallMediaType;
  } | null>(null);

  const clearConversationActiveCallState = useCallback((sessionId: string, conversationId?: string | null) => {
    if (!sessionId && !conversationId) {
      return;
    }

    setConversations((prev) => prev.map((conversation) => {
      if (conversationId && conversation._id !== conversationId) {
        return conversation;
      }

      if (!conversationId && conversation.activeCall?.callSessionId !== sessionId) {
        return conversation;
      }

      if (sessionId && conversation.activeCall?.callSessionId && conversation.activeCall.callSessionId !== sessionId) {
        return conversation;
      }

      return {
        ...conversation,
        activeCall: null,
      };
    }));
  }, []);

  const notifyCallBlockingIssue = useCallback((message: string) => {
    setCallError(message);
    callStore.showActiveCallConflict(message);
  }, []);

  const resolvePeerInfo = useCallback((peerUserId: string): { displayName: string; conversationId?: string } => {
    const matchedConversation = conversations.find((conversation) => {
      if (conversation.type !== 'direct') {
        return false;
      }

      return conversation.users.some((member) => member._id === peerUserId);
    });

    const matchedUser = matchedConversation?.users.find((member) => member._id === peerUserId);
    return {
      displayName: matchedUser?.displayName ?? 'Người dùng',
      conversationId: matchedConversation?._id,
    };
  }, [conversations]);

  const getConversationPresence = useCallback((conversation: Conversation): PresenceState => {
    if (conversation.type !== 'direct') {
      return { online: false, lastSeen: null };
    }

    const peerId = conversation.users.find((member) => member._id !== userId)?._id;
    if (!peerId) {
      return { online: false, lastSeen: null };
    }

    return presenceByUserId[peerId] ?? { online: false, lastSeen: null };
  }, [presenceByUserId, userId]);

  const resolveParticipantDisplayNames = useCallback((participantIds: string[]): Record<string, string> => {
    const names: Record<string, string> = {};

    participantIds.forEach((participantId) => {
      if (participantId === userId) {
        names[participantId] = data.user.displayName || 'Bạn';
        return;
      }

      const matchedConversation = conversations.find((conversation) =>
        conversation.users.some((member) => member._id === participantId),
      );
      const matchedUser = matchedConversation?.users.find((member) => member._id === participantId);
      names[participantId] = matchedUser?.displayName ?? 'Người dùng';
    });

    return names;
  }, [conversations, data.user.displayName, userId]);

  const syncLocalPreview = useCallback(() => {
    if (!localVideoRef.current || !localStreamRef.current) {
      return;
    }

    if (localVideoRef.current.srcObject !== localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, []);

  const syncScreenSharePreview = useCallback(() => {
    if (!screenShareVideoRef.current || !screenShareStreamRef.current) {
      return;
    }

    if (screenShareVideoRef.current.srcObject !== screenShareStreamRef.current) {
      screenShareVideoRef.current.srcObject = screenShareStreamRef.current;
    }
  }, []);

  const syncRemoteParticipantsPreview = useCallback((nextCall?: CallSessionState | null) => {
    const callContext = nextCall ?? activeCallRef.current;
    const streams = Array.from(remoteStreamsRef.current.entries())
      .filter(([, stream]) => stream.getTracks().length > 0)
      .map(([participantId, stream]) => ({
        userId: participantId,
        displayName: callContext?.participantDisplayNames[participantId] ?? resolvePeerInfo(participantId).displayName,
        stream,
      }));

    streams.sort((a, b) => a.displayName.localeCompare(b.displayName, 'vi'));
    setRemoteParticipantVideos(streams);

    if (!callContext?.isGroupCall && remoteVideoRef.current) {
      const primaryStream = streams[0]?.stream ?? null;
      if (remoteVideoRef.current.srcObject !== primaryStream) {
        remoteVideoRef.current.srcObject = primaryStream;
      }
    }
  }, [resolvePeerInfo]);

  const getRtcConfiguration = useCallback((): RTCConfiguration => {
    const stunServers: RTCIceServer = {
      urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'],
    };

    const turnUrlsRaw = process.env['NEXT_PUBLIC_TURN_URLS'] ?? '';
    const turnUrls = turnUrlsRaw
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    if (turnUrls.length === 0) {
      return { iceServers: [stunServers] };
    }

    return {
      iceServers: [
        stunServers,
        {
          urls: turnUrls,
          username: process.env['NEXT_PUBLIC_TURN_USERNAME'] ?? undefined,
          credential: process.env['NEXT_PUBLIC_TURN_PASSWORD'] ?? undefined,
        },
      ],
    };
  }, []);

  const stopLocalMedia = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (screenShareStreamRef.current) {
      screenShareStreamRef.current.getTracks().forEach((track) => {
        track.onended = null;
        track.stop();
      });
      screenShareStreamRef.current = null;
    }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    if (screenShareVideoRef.current) {
      screenShareVideoRef.current.srcObject = null;
    }

    setIsScreenSharing(false);
    setScreenSharingUserId(null);
  }, []);

  const stopRemoteMedia = useCallback(() => {
    remoteStreamsRef.current.forEach((stream) => {
      stream.getTracks().forEach((track) => track.stop());
    });
    remoteStreamsRef.current.clear();
    setRemoteParticipantVideos([]);

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  }, []);

  const closePeerConnection = useCallback((peerUserId?: string) => {
    if (peerUserId) {
      const connection = peerConnectionsRef.current.get(peerUserId);
      if (connection) {
        connection.onicecandidate = null;
        connection.ontrack = null;
        connection.onconnectionstatechange = null;
        connection.close();
        peerConnectionsRef.current.delete(peerUserId);
      }
      pendingRemoteCandidatesRef.current.delete(peerUserId);
      remoteStreamsRef.current.delete(peerUserId);
      syncRemoteParticipantsPreview();
      return;
    }

    peerConnectionsRef.current.forEach((connection) => {
      connection.onicecandidate = null;
      connection.ontrack = null;
      connection.onconnectionstatechange = null;
      connection.close();
    });
    peerConnectionsRef.current.clear();
    pendingRemoteCandidatesRef.current.clear();
    remoteStreamsRef.current.clear();
    syncRemoteParticipantsPreview();
  }, [syncRemoteParticipantsPreview]);

  const attachLocalTracksToPeer = useCallback((connection: RTCPeerConnection) => {
    const stream = localStreamRef.current;
    if (!stream) {
      return;
    }

    const existingTrackIds = new Set(
      connection
        .getSenders()
        .map((sender) => sender.track?.id)
        .filter((trackId): trackId is string => Boolean(trackId)),
    );

    stream.getTracks().forEach((track) => {
      if (!existingTrackIds.has(track.id)) {
        try {
          connection.addTrack(track, stream);
        } catch (err) {
          console.warn('[Call] Failed to add track to peer connection:', err);
        }
      }
    });
  }, []);



  const flushPendingRemoteCandidates = useCallback(async (peerUserId: string, connection: RTCPeerConnection) => {
    const queuedCandidates = pendingRemoteCandidatesRef.current.get(peerUserId) ?? [];
    if (!connection.remoteDescription || queuedCandidates.length === 0) {
      return;
    }

    pendingRemoteCandidatesRef.current.delete(peerUserId);

    for (const candidate of queuedCandidates) {
      try {
        await connection.addIceCandidate(candidate);
      } catch {
        setCallError('Không thể đồng bộ ICE candidate cho cuộc gọi.');
      }
    }
  }, []);

  const ensurePeerConnection = useCallback((currentCall: CallSessionState, peerUserId: string): RTCPeerConnection | null => {
    if (typeof RTCPeerConnection === 'undefined') {
      return null;
    }

    const existing = peerConnectionsRef.current.get(peerUserId);
    if (existing) {
      attachLocalTracksToPeer(existing);
      return existing;
    }

    const connection = new RTCPeerConnection(getRtcConfiguration());

    connection.onicecandidate = (event) => {
      const latestCall = activeCallRef.current;
      if (!event.candidate || !latestCall || !latestCall.sessionId || !latestCall.callToken || !peerUserId) {
        return;
      }

      try {
        emitWebRtcIceCandidate(
          latestCall.sessionId,
          peerUserId,
          latestCall.callToken,
          event.candidate.toJSON(),
        );
      } catch {
        setCallError('Không thể gửi ICE candidate.');
      }
    };

    connection.ontrack = (event) => {
      const existingStream = remoteStreamsRef.current.get(peerUserId) ?? new MediaStream();

      event.streams[0]?.getTracks().forEach((track) => {
        if (!existingStream.getTracks().some((currentTrack) => currentTrack.id === track.id)) {
          existingStream.addTrack(track);
        }
      });

      remoteStreamsRef.current.set(peerUserId, existingStream);
      syncRemoteParticipantsPreview(latestCallWithFallback(currentCall));
    };

    connection.onconnectionstatechange = () => {
      if (connection.connectionState === 'failed' || connection.connectionState === 'closed') {
        closePeerConnection(peerUserId);
      }
    };

    peerConnectionsRef.current.set(peerUserId, connection);
    pendingRemoteCandidatesRef.current.set(peerUserId, []);
    attachLocalTracksToPeer(connection);

    if (currentCall.status === 'connected') {
      void flushPendingRemoteCandidates(peerUserId, connection);
    }

    return connection;
  }, [attachLocalTracksToPeer, closePeerConnection, flushPendingRemoteCandidates, getRtcConfiguration, syncRemoteParticipantsPreview]);

  const latestCallWithFallback = useCallback((fallback: CallSessionState): CallSessionState => {
    return activeCallRef.current ?? fallback;
  }, []);

  const shouldCreateOfferForPeer = useCallback((callState: CallSessionState, peerUserId: string): boolean => {
    return userId.localeCompare(peerUserId) > 0;
  }, [userId]);

  const createOfferForPeer = useCallback(async (callState: CallSessionState, peerUserId: string) => {
    if (!callState.callToken || !callState.sessionId || !peerUserId || peerUserId === userId) {
      return;
    }

    const connection = ensurePeerConnection(callState, peerUserId);
    if (!connection) {
      setCallError('Trình duyệt không hỗ trợ WebRTC.');
      return;
    }

    if (connection.signalingState !== 'stable') {
      return;
    }

    const offer = await connection.createOffer();
    await connection.setLocalDescription(offer);
    emitWebRtcOffer(callState.sessionId, peerUserId, callState.callToken, offer);
  }, [ensurePeerConnection, userId]);

  const replacePeerVideoTrack = useCallback((videoTrack: MediaStreamTrack | null) => {
    peerConnectionsRef.current.forEach((connection, peerUserId) => {
      const videoSender = connection.getSenders().find((sender) => sender.track?.kind === 'video');
      if (!videoSender) {
        if (videoTrack && localStreamRef.current) {
          try {
            connection.addTrack(videoTrack, localStreamRef.current);
            // Trigger renegotiation if track was newly added
            const currentCall = activeCallRef.current;
            if (currentCall && currentCall.status === 'connected') {
              void createOfferForPeer(currentCall, peerUserId).catch((err) => {
                console.error('[Call] Failed to renegotiate after adding video track:', err);
              });
            }
          } catch (err) {
            console.error('[Call] Failed to add video track to peer connection:', err);
          }
        }
        return;
      }

      videoSender.replaceTrack(videoTrack).catch((err) => {
        console.error('[Call] Failed to replace video track:', err);
      });
    });
  }, [createOfferForPeer]);

  const ensureLocalMedia = useCallback(async (cameraEnabled: boolean = true) => {
    const insecureContextMessage = getWebRtcInsecureContextMessage();
    if (insecureContextMessage) {
      throw new Error(insecureContextMessage);
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return;
    }

    const existingStream = localStreamRef.current;
    const existingAudioTrack = existingStream?.getAudioTracks().find((track) => track.readyState === 'live') ?? null;
    const existingVideoTrack = existingStream?.getVideoTracks().find((track) => track.readyState === 'live') ?? null;

    if (existingStream && existingAudioTrack && (!cameraEnabled || existingVideoTrack)) {
      existingAudioTrack.enabled = !isMicMuted;
      existingStream.getVideoTracks().forEach((track) => {
        track.enabled = cameraEnabled;
      });

      if (!screenShareStreamRef.current) {
        replacePeerVideoTrack(cameraEnabled ? existingVideoTrack : null);
      }

      setIsCameraEnabled(cameraEnabled);
      syncLocalPreview();
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: cameraEnabled,
    });

    const audioEnabled = !isMicMuted;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = audioEnabled;
    });
    stream.getVideoTracks().forEach((track) => {
      track.enabled = cameraEnabled;
    });

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
    }

    localStreamRef.current = stream;
    if (!screenShareStreamRef.current) {
      replacePeerVideoTrack(stream.getVideoTracks()[0] ?? null);
    }
    setIsCameraEnabled(cameraEnabled);
    syncLocalPreview();
  }, [isMicMuted, replacePeerVideoTrack, syncLocalPreview]);

  const resetCallUi = useCallback(() => {
    setActiveCall(null);
    setCallError(null);
    pendingOutgoingCallRef.current = null;
    closePeerConnection();
    stopLocalMedia();
    stopRemoteMedia();
  }, [closePeerConnection, stopLocalMedia, stopRemoteMedia]);
  const resetCallUiRef = useRef(resetCallUi);

  const scheduleCallReset = useCallback((delayMs: number = 2500) => {
    if (autoResetCallTimeoutRef.current) {
      clearTimeout(autoResetCallTimeoutRef.current);
    }

    autoResetCallTimeoutRef.current = setTimeout(() => {
      autoResetCallTimeoutRef.current = null;
      resetCallUi();
    }, delayMs);
  }, [resetCallUi]);

  const clearCallResetTimer = useCallback(() => {
    if (autoResetCallTimeoutRef.current) {
      clearTimeout(autoResetCallTimeoutRef.current);
      autoResetCallTimeoutRef.current = null;
    }
  }, []);
  const clearCallResetTimerRef = useRef(clearCallResetTimer);

  useEffect(() => {
    resetCallUiRef.current = resetCallUi;
    clearCallResetTimerRef.current = clearCallResetTimer;
  }, [clearCallResetTimer, resetCallUi]);

  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  useEffect(() => {
    if (!userId || !activeCall || activeCall.participantIds.includes(userId)) {
      return;
    }

    if (activeCall.direction === 'incoming') {
      setActiveCall((prev) => {
        if (!prev || prev.sessionId !== activeCall.sessionId || prev.participantIds.includes(userId)) {
          return prev;
        }

        return {
          ...prev,
          participantIds: [...prev.participantIds, userId],
        };
      });
      return;
    }

    resetCallUi();
  }, [activeCall, resetCallUi, userId]);

  useEffect(() => {
    const callStatus = activeCall?.status;
    if (!activeCall || (callStatus !== 'ended' && callStatus !== 'missed' && callStatus !== 'rejected')) {
      return;
    }

    const timeoutId = setTimeout(() => {
      const latestCall = activeCallRef.current;
      if (!latestCall || latestCall.sessionId !== activeCall.sessionId) {
        return;
      }

      if (latestCall.status === 'ended' || latestCall.status === 'missed' || latestCall.status === 'rejected') {
        resetCallUi();
      }
    }, 1600);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [activeCall?.sessionId, activeCall?.status, resetCallUi]);

  useEffect(() => {
    syncLocalPreview();
    syncRemoteParticipantsPreview(activeCall);
  }, [activeCall, syncLocalPreview, syncRemoteParticipantsPreview]);

  useEffect(() => {
    if (isScreenSharing) {
      syncScreenSharePreview();
    }
  }, [isScreenSharing, syncScreenSharePreview]);

  // Initialize chat hook for real-time messaging
  const {
    messages,
    typingUsers,
    messageStatus,
    sendMessage,
    cancelPendingMessage,
    markAsRead,
    startTyping,
    stopTyping,
    deleteMessageForMe,
    recallMessage,
    unsetMessages_Status,
    isLoading: chatLoading,
  } = useChat({
    conversationId: selectedConversationId,
    userId,
    token: getAccessToken() ?? '',
    displayName: data.user.displayName,
  });

  // Use message history hook for pagination
  const messageHistory = useMessageHistory({
    conversationId: selectedConversationId,
  });

  // Build combined message status from both real-time (useChat) and history messages
  const [combinedMessageStatus, setCombinedMessageStatus] = useState<Record<string, string>>({});

  useEffect(() => {
    // Populate status from all loaded messages
    const statusMap: Record<string, string> = { ...messageStatus };

    // Extract status from loaded messages (both real-time and history)
    messageHistory.messages.forEach((msg) => {
      if (msg.status && !statusMap[msg._id]) {
        statusMap[msg._id] = msg.status;
      }
    });

    setCombinedMessageStatus(statusMap);
  }, [messageHistory.messages, messageStatus]);

  const {notifications} = useNotifications()

  useEffect(() => {
    const latestNotification = notifications[0]
    if (!latestNotification) return;
    if (latestNotification.type !== 'new_message') return;
    setConversations((prev) => prev.map((conv) => {
        if (conv._id !== latestNotification.conversationId) return conv
        const unreadCounts = conv.unreadCounts? new Map(Object.entries(conv.unreadCounts)): new Map<string, number>() 
        if (conv._id !== selectedConversationId) {
          const count = unreadCounts.get(userId)
          unreadCounts.set(userId, count? count + 1: 1)
        }
        return {...conv, unreadCounts: Object.fromEntries(unreadCounts.entries()), lastMessage: {
            senderId: latestNotification.fromUserId as string,
            senderDisplayName: latestNotification.title.replace('Tin nhắn mới từ ', ''),
            content: latestNotification.body,
            sentAt: latestNotification.createdAt
        }}
      })
    )
  }, [notifications]);

  useEffect(() => {
    const lastMessage = messageHistory.messages[messageHistory.messages.length - 1]
    if (!lastMessage) return;
    setConversations((prev) => prev.map((conv) => {
        if (conv._id !== lastMessage.conversationId) return conv
        return {...conv, lastMessage: {
            senderId: lastMessage.senderId,
            senderDisplayName: lastMessage.sender?.displayName,
            content: lastMessage.content,
            sentAt: lastMessage.createdAt
        }}
      })
    )
  }, [messageHistory.messages]);

  const resolveMessageRef = useCallback((message: Message): string => {
    return message.idempotencyKey || message._id;
  }, []);

  const getConversationUnreadCount = useCallback((conversationId: string): number => {
    const conversation = conversations.find((item) => item._id === conversationId);
    const unreadValue = conversation?.unreadCounts?.[userId];
    return typeof unreadValue === 'number' && unreadValue > 0 ? unreadValue : 0;
  }, [conversations, userId]);

  const getLatestLoadedMessageRef = useCallback((conversationId: string): string | undefined => {
    if (conversationId !== selectedConversationId) {
      return undefined;
    }

    const latestMessage = [...messageHistory.messages]
      .reverse()
      .find((message) => !isCallSummaryMessage(message));

    return latestMessage ? resolveMessageRef(latestMessage) : undefined;
  }, [messageHistory.messages, resolveMessageRef, selectedConversationId]);

  const requestAiCatchup = useCallback(async (conversationId?: string) => {
    const targetConversationId = conversationId ?? selectedConversationId;
    if (!targetConversationId) {
      return;
    }

    const targetConversation = conversations.find((item) => item._id === targetConversationId);
    if (targetConversation?.aiPreferences?.catchupEnabled === false) {
      return;
    }

    setAiCatchupRequestingByConversation((prev) => ({ ...prev, [targetConversationId]: true }));
    try {
      const digest = await createAiCatchupDigest(targetConversationId, {
        trigger: 'manual',
        unreadCountHint: getConversationUnreadCount(targetConversationId),
        toMessageRef: getLatestLoadedMessageRef(targetConversationId),
      });
      setAiCatchupByConversation((prev) => ({ ...prev, [targetConversationId]: digest }));
    } finally {
      setAiCatchupRequestingByConversation((prev) => ({ ...prev, [targetConversationId]: false }));
    }
  }, [
    conversations,
    getConversationUnreadCount,
    getLatestLoadedMessageRef,
    selectedConversationId,
  ]);

  const regenerateAiCatchup = useCallback(async (digestId?: string) => {
    const digest = digestId
      ? Object.values(aiCatchupByConversation).find((item) => item._id === digestId)
      : aiCatchupByConversation[selectedConversationId];
    if (!digest) {
      return;
    }

    setAiCatchupRequestingByConversation((prev) => ({ ...prev, [digest.conversationId]: true }));
    try {
      const nextDigest = await regenerateAiCatchupDigest(digest._id);
      setAiCatchupByConversation((prev) => ({ ...prev, [nextDigest.conversationId]: nextDigest }));
    } finally {
      setAiCatchupRequestingByConversation((prev) => ({ ...prev, [digest.conversationId]: false }));
    }
  }, [aiCatchupByConversation, selectedConversationId]);

  const toggleAiCatchupSetting = useCallback(async (conversationId: string, catchupEnabled: boolean) => {
    const previousConversation = conversations.find((conversation) => conversation._id === conversationId);
    setConversations((prev) => prev.map((conversation) => {
      if (conversation._id !== conversationId) {
        return conversation;
      }

      return {
        ...conversation,
        aiPreferences: {
          ...(conversation.aiPreferences ?? { catchupEnabled: true }),
          catchupEnabled,
        },
      };
    }));

    try {
      await updateAiCatchupSettings(conversationId, catchupEnabled);
    } catch (error) {
      setConversations((prev) => prev.map((conversation) => {
        if (conversation._id !== conversationId) {
          return conversation;
        }

        return {
          ...conversation,
          aiPreferences: previousConversation?.aiPreferences ?? { catchupEnabled: true },
        };
      }));
      throw error;
    }
  }, [conversations]);

  const createReminderFromAiActionItem = useCallback(async (
    actionItem: { text: string; sourceMessageRefs: string[] },
  ) => {
    if (!selectedConversationId) {
      return;
    }
    const digest = aiCatchupByConversation[selectedConversationId];
    await createReminderFromActionItem(selectedConversationId, actionItem, digest?._id);
  }, [selectedConversationId, aiCatchupByConversation]);

  useEffect(() => {
    if (!selectedConversationId || !userId) {
      return;
    }

    let cancelled = false;
    getLatestAiCatchupDigest(selectedConversationId)
      .then((digest) => {
        if (cancelled || !digest) {
          return;
        }
        setAiCatchupByConversation((prev) => ({ ...prev, [selectedConversationId]: digest }));
      })
      .catch((error) => {
        console.warn('[AI Catch-up] Failed to load latest digest', error);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedConversationId, userId]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token || !userId) {
      return;
    }

    getSocket(token);

    const handleAiCatchupDigestUpdated = (payload: AiCatchupDigestUpdatedPayload) => {
      setAiCatchupRequestingByConversation((prev) => ({ ...prev, [payload.conversationId]: false }));
      setAiCatchupByConversation((prev) => {
        const existing = prev[payload.conversationId];
        const fallbackDigest: AiCatchupDigest = {
          _id: payload.digestId,
          userId,
          conversationId: payload.conversationId,
          cacheKey: '',
          fromMessageRef: '',
          toMessageRef: '',
          messageRefs: [],
          messageCount: 0,
          omittedOlderCount: 0,
          trigger: 'manual',
          status: payload.status,
          summary: payload.summary,
          inputHash: '',
          error: payload.error,
          createdAt: payload.updatedAt,
          updatedAt: payload.updatedAt,
        };

        return {
          ...prev,
          [payload.conversationId]: existing
            ? {
                ...existing,
                status: payload.status,
                summary: payload.summary ?? existing.summary,
                error: payload.error,
                updatedAt: payload.updatedAt,
              }
            : fallbackDigest,
        };
      });
    };

    listenToAiCatchupDigestUpdated(handleAiCatchupDigestUpdated);
    return () => {
      unlistenToAiCatchupDigestUpdated(handleAiCatchupDigestUpdated);
    };
  }, [userId]);

  const applyReactionSummaryToMessage = useCallback(
    (
      target: { messageId?: string; messageRef?: string },
      summary: MessageReactionSummary,
      userState?: MessageReactionUserState,
    ) => {
      messageHistory.setMessages((prev) =>
        prev.map((msg) => {
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
        }),
      );
    },
    [messageHistory.setMessages],
  );

  const updateReactionUserStateCache = useCallback(
    (messageId: string, messageRef: string, nextUserState: MessageReactionUserState) => {
      setReactionUserStateByMessage((prev) => ({
        ...prev,
        [messageId]: nextUserState,
        [messageRef]: nextUserState,
      }));
    },
    [],
  );

  const completePendingReaction = useCallback((requestId?: string) => {
    if (!requestId) {
      return;
    }

    const pending = pendingReactionRequestsRef.current.get(requestId);
    if (!pending) {
      return;
    }

    if (pending.ackTimeout) {
      clearTimeout(pending.ackTimeout);
    }

    pendingReactionRequestsRef.current.delete(requestId);
  }, []);

  const rollbackPendingReaction = useCallback(
    (requestId: string, reason: string) => {
      const pending = pendingReactionRequestsRef.current.get(requestId);
      if (!pending) {
        return;
      }

      if (pending.ackTimeout) {
        clearTimeout(pending.ackTimeout);
      }

      applyReactionSummaryToMessage(
        { messageId: pending.messageId, messageRef: pending.messageRef },
        pending.previousSummary,
        pending.previousUserState,
      );
      updateReactionUserStateCache(pending.messageId, pending.messageRef, pending.previousUserState);

      pendingReactionRequestsRef.current.delete(requestId);
      console.warn(`[Reaction] Rolled back request ${requestId}: ${reason}`);
    },
    [applyReactionSummaryToMessage, updateReactionUserStateCache],
  );

  const registerPendingReaction = useCallback(
    (params: {
      requestId: string;
      messageId: string;
      messageRef: string;
      previousSummary: MessageReactionSummary;
      previousUserState: MessageReactionUserState;
    }) => {
      const previous = pendingReactionRequestsRef.current.get(params.requestId);
      if (previous?.ackTimeout) {
        clearTimeout(previous.ackTimeout);
      }

      const ackTimeout = setTimeout(() => {
        rollbackPendingReaction(params.requestId, 'ACK timeout');
      }, REACTION_ACK_TIMEOUT_MS);

      pendingReactionRequestsRef.current.set(params.requestId, {
        ...params,
        ackTimeout,
      });
    },
    [rollbackPendingReaction],
  );

  // Subscribe to new messages from useChat and add them to messageHistory
  useEffect(() => {
    if (messages.length === 0) {
      return;
    }

    messageHistory.setMessages((prev) => {
      const merged = new Map<string, Message>();

      prev.forEach((msg) => {
        if (isCallSummaryMessage(msg)) {
          return;
        }
        const key = String(msg.idempotencyKey || msg._id);
        merged.set(key, msg);
      });

      messages.forEach((msg) => {
        if (isCallSummaryMessage(msg)) {
          return;
        }
        const key = String(msg.idempotencyKey || msg._id);
        const existing = merged.get(key);

        if (!existing) {
          merged.set(key, msg);
          return;
        }

        const existingIsRecalled = existing.type === 'system-recall';
        const incomingIsRecalled = msg.type === 'system-recall';

        if (existingIsRecalled && !incomingIsRecalled) {
          // Once recalled, keep placeholder content/media cleared.
          merged.set(key, {
            ...msg,
            ...existing,
            _id: existing._id || msg._id,
            idempotencyKey: existing.idempotencyKey || msg.idempotencyKey,
            createdAt: msg.createdAt || existing.createdAt,
            type: 'system-recall',
            content: existing.content || '[Tin nhắn đã được thu hồi]',
            mediaUrl: undefined,
          });
          return;
        }

        merged.set(key, {
          ...existing,
          ...msg,
          _id: msg._id || existing._id,
          idempotencyKey: msg.idempotencyKey || existing.idempotencyKey,
          createdAt: msg.createdAt || existing.createdAt,
          mediaUrl: incomingIsRecalled ? undefined : (msg.mediaUrl ?? existing.mediaUrl),
        });
      });

      return Array.from(merged.values()).sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    });
  }, [messages, messageHistory.setMessages]);

  useEffect(() => {
    hydratedReactionStateRefsRef.current.clear();
    setConversations((prev) => prev.map((conv) => {
        const unreadCounts = conv.unreadCounts? new Map(Object.entries(conv.unreadCounts)): new Map<string, number>() 
        unreadCounts.delete(userId)
        return {...conv, unreadCounts: Object.fromEntries(unreadCounts.entries())}
      })
    )
  }, [selectedConversationId]);

  useEffect(() => {
    if (!selectedConversationId || !userId || messageHistory.messages.length === 0) {
      return;
    }

    const candidates = messageHistory.messages.filter((msg) => {
      const totalCount = msg.reactionSummary?.totalCount || 0;
      if (totalCount <= 0) {
        return false;
      }

      const messageRef = resolveMessageRef(msg);
      if (hydratedReactionStateRefsRef.current.has(messageRef)) {
        return false;
      }

      return !reactionUserStateByMessage[msg._id] && !reactionUserStateByMessage[messageRef];
    });

    if (candidates.length === 0) {
      return;
    }

    candidates.forEach((msg) => hydratedReactionStateRefsRef.current.add(resolveMessageRef(msg)));

    let cancelled = false;

    void (async () => {
      const updates: Array<{
        messageId: string;
        messageRef: string;
        userState: MessageReactionUserState;
      }> = [];

      await Promise.allSettled(
        candidates.map(async (msg) => {
          try {
            const messageRef = resolveMessageRef(msg);
            const details = await getMessageReactionDetails(messageRef);
            const me = details.rows.find((row) => row.userId === userId && row.totalCount > 0);
            if (!me) {
              return;
            }

            updates.push({
              messageId: details.messageId || msg._id,
              messageRef,
              userState: {
                lastEmoji: me.lastEmoji,
                totalCount: me.totalCount,
                emojiCounts: me.emojiCounts,
              },
            });
          } catch {
            // Ignore one-off hydrate failures; realtime updates will still reconcile.
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

      messageHistory.setMessages((prev) =>
        prev.map((msg) => {
          const msgId = String(msg._id);
          const msgRef = String(msg.idempotencyKey || '');
          const found = updates.find(
            (item) =>
              msgId === String(item.messageId)
              || msgId === String(item.messageRef)
              || msgRef === String(item.messageId)
              || msgRef === String(item.messageRef),
          );

          if (!found) {
            return msg;
          }

          return {
            ...msg,
            reactionUserState: found.userState,
          };
        }),
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [
    messageHistory.messages,
    messageHistory.setMessages,
    reactionUserStateByMessage,
    resolveMessageRef,
    selectedConversationId,
    userId,
  ]);

  useEffect(() => {
    const handleReactionAck = (payload: {
      requestId: string;
      accepted: boolean;
      conversationId: string;
    }) => {
      if (payload.conversationId !== selectedConversationId) {
        return;
      }

      const pending = pendingReactionRequestsRef.current.get(payload.requestId);
      if (!pending) {
        return;
      }

      if (!payload.accepted) {
        rollbackPendingReaction(payload.requestId, 'Server rejected request');
        return;
      }

      if (pending.ackTimeout) {
        clearTimeout(pending.ackTimeout);
      }

      pendingReactionRequestsRef.current.set(payload.requestId, {
        ...pending,
        ackTimeout: null,
      });
    };

    const handleReactionUpdated = (payload: {
      requestId?: string;
      messageId: string;
      messageRef: string;
      conversationId: string;
      actor: {
        userId: string;
      };
      summary: MessageReactionSummary;
      userState?: MessageReactionUserState;
    }) => {
      if (payload.conversationId !== selectedConversationId) {
        return;
      }

      applyReactionSummaryToMessage(
        { messageId: payload.messageId, messageRef: payload.messageRef },
        payload.summary,
        payload.actor.userId === userId ? payload.userState : undefined,
      );

      if (payload.actor.userId === userId && payload.userState) {
        const nextUserState = payload.userState;
        updateReactionUserStateCache(payload.messageId, payload.messageRef, nextUserState);
      }

      if (payload.actor.userId === userId && payload.requestId) {
        completePendingReaction(payload.requestId);
      }
    };

    const handleReactionError = (payload: { requestId?: string; message: string }) => {
      if (payload.requestId) {
        rollbackPendingReaction(payload.requestId, payload.message);
        return;
      }

      console.error('[Reaction] Socket error:', payload.message);
    };

    listenToReactionAck(handleReactionAck);
    listenToReactionUpdated(handleReactionUpdated);
    listenToReactionError(handleReactionError);

    return () => {
      // Truyen dung callback thay vi unlisten khong co param (se xoa tat ca).
      unlistenToReactionAck(handleReactionAck);
      unlistenToReactionUpdated(handleReactionUpdated);
      unlistenToReactionError(handleReactionError);
    };
  }, [
    applyReactionSummaryToMessage,
    completePendingReaction,
    rollbackPendingReaction,
    selectedConversationId,
    updateReactionUserStateCache,
    userId,
  ]);

  // Fetch initial data
  useEffect(() => {
    async function fetchData() {
      try {
        setError(null);
        const [meRes, requestsRes, convosRes, prefs, notifRes, unreadNotifCount, friendsRes] = await Promise.all([
          apiClient.get('/api/users/me'),
          apiClient.get('/api/friends/requests'),
          apiClient.get('/api/conversations'),
          fetchPreferences(),
          fetchNotifications(undefined, 10),
          fetchUnreadCount(),
          fetchFriends(),
        ]);

        const user = meRes.data.user;
        setUserId(user._id as string);
        const pendingRequests = requestsRes.data.pendingRequests || [];
        const convos: Conversation[] = convosRes.data.data || [];

        setConversations(convos);
        setPinnedConversationIds(Array.isArray(prefs.pinnedConversations) ? prefs.pinnedConversations : []);

        const mutedMapRaw = (prefs.mutedUntil || {}) as Record<string, string>;
        const mutedMap: Record<string, Date | null> = {};
        Object.entries(mutedMapRaw).forEach(([conversationId, untilRaw]) => {
          const untilDate = new Date(untilRaw);
          if (!Number.isNaN(untilDate.getTime())) {
            mutedMap[conversationId] = untilDate;
          }
        });
        setMutedUntilByConversation(mutedMap);

        const allFriends: FriendUser[] = [];
        allFriends.push(...friendsRes.friends);

        // Fetch all friends for group creation
        let friendCursor: string | undefined = friendsRes.nextCursor ?? undefined;
        while (friendCursor) {
          const morePage = await fetchFriends(friendCursor);
          allFriends.push(...morePage.friends);
          friendCursor = morePage.nextCursor ?? undefined;
        }
        setFriendsForGroup(allFriends);

        // Select first conversation (pinned first, then latest updated), unless a selection
        // is already valid (e.g. /chat?conversationId=... applied before this fetch finished).
        if (convos.length > 0) {
          const pinnedSet = new Set(Array.isArray(prefs.pinnedConversations) ? prefs.pinnedConversations : []);
          const sorted = [...convos].sort((a, b) => {
            const aPinned = pinnedSet.has(a._id) ? 1 : 0;
            const bPinned = pinnedSet.has(b._id) ? 1 : 0;
            if (aPinned !== bPinned) {
              return bPinned - aPinned;
            }
            const aTs = new Date(a.lastMessage?.sentAt || a.updatedAt || 0).getTime();
            const bTs = new Date(b.lastMessage?.sentAt || b.updatedAt || 0).getTime();
            return bTs - aTs;
          });
          setSelectedConversationId((prev) => {
            if (prev && convos.some((c) => c._id === prev)) {
              return prev;
            }
            return sorted[0]?._id || '';
          });
        }

        let unreadMessagesCount = 0;
        let activeGroupsCount = 0;
        const activities: any[] = [];

        convos.forEach((conv: Conversation, index: number) => {
          if (conv.type === 'group') activeGroupsCount++;

          const unreadForMe = conv.unreadCounts?.[user._id] || 0;
          unreadMessagesCount += unreadForMe;

          if (conv.lastMessage && conv.lastMessage?.content) {
            const sender = conv.users?.find((u: any) => u._id === conv.lastMessage?.senderId);
            const otherUser = conv.users?.find((u: any) => u._id !== user._id);
            const avatarUrl = conv.type === 'group' ? conv.avatarUrl : otherUser?.avatarUrl;

            let title = sender?.displayName || 'Người dùng';
            let messageStr = conv.lastMessage.content || 'Tin nhắn media';

            if (conv.type === 'group') {
              title = conv.name || 'Nhóm';
              messageStr = `${sender?.displayName || 'Ai đó'}: ${messageStr}`;
            }

            let initials = 'U';
            const nameToInitials = conv.type === 'group' ? (conv.name || 'Nhóm') : (otherUser?.displayName || 'Người dùng');
            const parts = nameToInitials.split(' ');
            initials = parts.length > 1
              ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
              : parts[0].substring(0, 2).toUpperCase();

            const tones = ['bg-[#97a7b8]', 'bg-[#88b3c8]', 'bg-[#1a6f58]', 'bg-[#0f5845]'];

            activities.push({
              id: `act-${conv._id}-${index}`,
              conversationId: conv._id,
              title,
              message: messageStr,
              timeLabel: new Date(conv.lastMessage.sentAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
              initials,
              avatarUrl,
              toneClass: tones[index % tones.length],
              isUnread: unreadForMe > 0,
            });
          }
        });

        // Transform notifications for dashboard
        const notificationTones = ['bg-[#97a7b8]', 'bg-[#88b3c8]', 'bg-[#1a6f58]', 'bg-[#0f5845]'];
        const dashboardNotifications: DashboardNotificationItem[] = notifRes.notifications.slice(0, 8).map((notif: Notification, idx: number) => ({
          id: notif._id,
          type: notif.type as DashboardNotificationItem['type'],
          title: notif.title,
          body: notif.body,
          timeLabel: formatTimeLabel(notif.createdAt),
          initials: notif.title.substring(0, 2).toUpperCase() || 'NT',
          toneClass: notificationTones[idx % notificationTones.length],
          isRead: notif.read,
          avatarUrl: notif.data?.avatarUrl,
          conversationId: notif.conversationId,
          fromUserId: notif.fromUserId,
          action: notif.data?.action,
          postId: notif.data?.postId,
        }));

        // Transform friend activities
        const friendTones = ['bg-[#97a7b8]', 'bg-[#88b3c8]', 'bg-[#1a6f58]', 'bg-[#0f5845]'];
        const dashboardFriendActivities: DashboardFriendActivityItem[] = allFriends.slice(0, 6).map((friend: FriendUser, idx: number) => {
          const friendNameParts = friend.displayName.split(' ');
          const friendInitials = friendNameParts.length > 1
            ? `${friendNameParts[0][0]}${friendNameParts[friendNameParts.length - 1][0]}`.toUpperCase()
            : friend.displayName.substring(0, 2).toUpperCase();

          const action: DashboardFriendActivityItem['action'] = friend.status === 'online' ? 'online' : 'offline';

          return {
            id: `friend-act-${friend.id}`,
            userId: friend.id,
            userName: friend.displayName,
            userAvatar: friend.avatarUrl,
            initials: friendInitials,
            toneClass: friendTones[idx % friendTones.length],
            action,
            target: friend.username ? `@${friend.username}` : undefined,
            timeLabel: friend.status === 'online' ? 'Đang hoạt động' : 'Ngoại tuyến',
          };
        });

        const unreadNotificationCount = unreadNotifCount;

        const userInitials = user.displayName.split(' ').length > 1
          ? `${user.displayName.split(' ')[0][0]}${user.displayName.split(' ').slice(-1)[0][0]}`.toUpperCase()
          : user.displayName.substring(0, 2).toUpperCase();

        setData(prev => ({
          ...prev,
          greeting: `Xin chào, ${user.displayName}`,
          user: {
            displayName: user.displayName,
            roleLabel: 'Trực tuyến',
            initials: userInitials,
            avatarUrl: user.avatarUrl,
          },
          stats: [
            {
              id: 'stat-1',
              value: unreadMessagesCount.toString().padStart(2, '0'),
              label: 'Số tin nhắn mới',
              badge: unreadMessagesCount > 0 ? `+${unreadMessagesCount}` : '',
              icon: 'message'
            },
            {
              id: 'stat-2',
              value: pendingRequests.length.toString().padStart(2, '0'),
              label: 'Lời mời kết bạn',
              badge: pendingRequests.length > 0 ? pendingRequests.length.toString() : '',
              icon: 'friends'
            },
            {
              id: 'stat-3',
              value: activeGroupsCount.toString().padStart(2, '0'),
              label: 'Nhóm đang hoạt động',
              badge: '',
              icon: 'group'
            },
            {
              id: 'stat-4',
              value: unreadNotificationCount.toString().padStart(2, '0'),
              label: 'Thông báo chưa đọc',
              badge: unreadNotificationCount > 0 ? unreadNotificationCount.toString() : '',
              icon: 'bell'
            },
          ],
          activities: activities.slice(0, 5),
          notifications: dashboardNotifications,
          unreadNotificationCount,
          friendActivities: dashboardFriendActivities,
        }));
      } catch (error) {
        console.error('Failed to fetch dashboard data', error);
        setError('Không thể tải dữ liệu trang chủ. Vui lòng thử lại.');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  useEffect(() => {
    if (!userId || conversations.length === 0) {
      return;
    }

    const directPeerIds = Array.from(new Set(
      conversations
        .filter((conversation) => conversation.type === 'direct')
        .flatMap((conversation) => conversation.users
          .map((member) => member._id)
          .filter((memberId) => memberId !== userId)),
    ));

    if (directPeerIds.length === 0) {
      setPresenceByUserId({});
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const response = await apiClient.get('/api/users/presence/bulk');
        const payload = (response.data?.presence ?? {}) as Record<string, { online?: boolean; lastSeen?: string | null }>;
        const nextPresence: Record<string, PresenceState> = {};

        for (const peerId of directPeerIds) {
          const presence = payload[peerId];
          nextPresence[peerId] = {
            online: Boolean(presence?.online),
            lastSeen: presence?.lastSeen ?? null,
          };
        }

        if (!cancelled) {
          setPresenceByUserId(nextPresence);
        }
      } catch {
        if (!cancelled) {
          setPresenceByUserId({});
        }
      }
    })();

    const token = getAccessToken();
    if (!token) {
      return () => {
        cancelled = true;
      };
    }

    const socket = getSocket(token);
    const handlePresenceChanged = (payload: { userId: string; status: 'online' | 'offline'; lastSeen?: string | null }) => {
      if (!directPeerIds.includes(payload.userId)) {
        return;
      }

      setPresenceByUserId((prev) => ({
        ...prev,
        [payload.userId]: {
          online: payload.status === 'online',
          lastSeen: payload.lastSeen ?? prev[payload.userId]?.lastSeen ?? null,
        },
      }));
    };

    socket.on('presence_changed', handlePresenceChanged);

    return () => {
      cancelled = true;
      socket.off('presence_changed', handlePresenceChanged);
    };
  }, [conversations, userId]);
  
  // Update conversations list when receiving new messages
  useEffect(() => {
    if (messages.length === 0) return;

    const latestMessage = messages[messages.length - 1];
    if (isCallSummaryMessage(latestMessage)) {
      return;
    }
    setConversations(prev => prev.map(conv => {
      if (conv._id === latestMessage.conversationId) {
        const senderDisplayName = conv.users.find((member) => member._id === latestMessage.senderId)?.displayName;
        const messagePreview = buildMessagePreview(latestMessage);

        return {
          ...conv,
          lastMessage: {
            senderId: latestMessage.senderId,
            senderDisplayName,
            content: messagePreview,
            sentAt: latestMessage.createdAt,
          },
        };
      }
      return conv;
    }));
  }, [messages]);

  const updatePreviewConversation = (message: Message) => {
    if (isCallSummaryMessage(message)) {
      return;
    }
    setConversations(prev => prev.map(conv => {
      if (conv._id === message.conversationId) {
        const senderDisplayName = conv.users.find((member) => member._id === message.senderId)?.displayName;
        const messagePreview = buildMessagePreview(message);

        return {
          ...conv,
          lastMessage: {
            senderId: message.senderId,
            senderDisplayName,
            content: messagePreview,
            sentAt: message.createdAt,
          },
        };
      }
      return conv;
    }));
  };

  useEffect(() => {
    const token = getAccessToken();
    if (!token || !userId) {
      return;
    }

    const socket = getSocket(token);

    const handleConversationActiveCallUpdated = (payload: {
      conversationId?: string;
      activeCall?: ConversationActiveCall | null;
    }) => {
      if (!payload.conversationId) {
        return;
      }

      setConversations((prev) => prev.map((conversation) => {
        if (conversation._id !== payload.conversationId) {
          return conversation;
        }

        return {
          ...conversation,
          activeCall: isActiveConversationCall(payload.activeCall) ? payload.activeCall : null,
        };
      }));
    };

    const handleMessageDeletedForMe = (payload: {
      conversationId: string;
      unreadCount?: number;
      effectiveLastMessage?: {
        content: string;
        senderId: string;
        sentAt: string;
      } | null;
      lastVisibleMessage?: {
        content: string;
        senderId: string;
        senderDisplayName?: string;
        sentAt: string;
      } | null;
    }) => {
      if (!payload?.conversationId) {
        return;
      }

      setConversations((prev) => prev.map((conversation) => {
        if (conversation._id !== payload.conversationId) {
          return conversation;
        }

        let nextLastMessage = conversation.lastMessage;

        if (payload.lastVisibleMessage) {
          nextLastMessage = {
            senderId: payload.lastVisibleMessage.senderId,
            senderDisplayName: payload.lastVisibleMessage.senderDisplayName,
            content: payload.lastVisibleMessage.content,
            sentAt: payload.lastVisibleMessage.sentAt,
          };
        } else if (payload.effectiveLastMessage) {
          nextLastMessage = {
            senderId: payload.effectiveLastMessage.senderId,
            senderDisplayName: conversation.users.find((member) => member._id === payload.effectiveLastMessage?.senderId)?.displayName,
            content: payload.effectiveLastMessage.content,
            sentAt: payload.effectiveLastMessage.sentAt,
          };
        }

        const unreadCounts = {
          ...(conversation.unreadCounts || {}),
        };

        if (typeof payload.unreadCount === 'number') {
          unreadCounts[userId] = payload.unreadCount;
        }

        return {
          ...conversation,
          lastMessage: nextLastMessage,
          unreadCounts,
        };
      }));
    };

    const handleMessageRecalled = (payload: {
      conversationId?: string;
      recalledBy?: string;
      recalledAt?: string;
      conversationLastMessage?: {
        content: string;
        senderId: string;
        sentAt: string;
      } | null;
    }) => {
      if (!payload.conversationId) {
        return;
      }

      setConversations((prev) => prev.map((conversation) => {
        if (conversation._id !== payload.conversationId) {
          return conversation;
        }

        if (payload.conversationLastMessage) {
          return {
            ...conversation,
            lastMessage: {
              senderId: payload.conversationLastMessage.senderId,
              senderDisplayName: conversation.users.find((member) => member._id === payload.conversationLastMessage?.senderId)?.displayName,
              content: 'Tin nhắn đã được thu hồi cho tôi',
              sentAt: payload.conversationLastMessage.sentAt,
            },
          };
        }

        return {
          ...conversation,
          lastMessage: {
            senderId: payload.recalledBy || conversation.lastMessage?.senderId || '',
            senderDisplayName: conversation.lastMessage?.senderDisplayName,
            content: 'Tin nhắn đã được thu hồi cho tôi',
            sentAt: payload.recalledAt || conversation.lastMessage?.sentAt || new Date().toISOString(),
          },
        };
      }));
    };

    listenToMessageDeletion(handleMessageDeletedForMe);
    listenToMessageRecall(handleMessageRecalled);
    socket.on('conversation_active_call_updated', handleConversationActiveCallUpdated);

    return () => {
      unlistenToMessageDeletion(handleMessageDeletedForMe);
      unlistenToMessageRecall(handleMessageRecalled);
      socket.off('conversation_active_call_updated', handleConversationActiveCallUpdated);
    };
  }, [userId]);

  const convertConversationsToListItems = useCallback((): ConversationListItem[] => {
    const pinnedSet = new Set(pinnedConversationIds);
    const sortedConversations = [...conversations].sort((a, b) => {
      const aPinned = pinnedSet.has(a._id) ? 1 : 0;
      const bPinned = pinnedSet.has(b._id) ? 1 : 0;
      if (aPinned !== bPinned) {
        return bPinned - aPinned;
      }

      const aTs = new Date(a.lastMessage?.sentAt || a.updatedAt || 0).getTime();
      const bTs = new Date(b.lastMessage?.sentAt || b.updatedAt || 0).getTime();
      return bTs - aTs;
    });

    return sortedConversations.map((conv, idx) => {
      const unreadCounts = conv.unreadCounts? new Map(Object.entries(conv.unreadCounts)): new Map<string, number>() 
      return {
      id: conv._id,
      name: conv.type === 'group'
        ? conv.name || 'Nhóm'
        : conv.users.find(u => u._id !== userId)?.displayName || 'Người dùng',
      preview: formatConversationPreview(conv.lastMessage),
      time: conv.lastMessage?.sentAt
        ? new Date(conv.lastMessage.sentAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
        : '',
      timestamp: new Date(conv.lastMessage?.sentAt || conv.updatedAt || 0).getTime(),
      avatar: conv.type === 'group'
        ? (conv.name?.substring(0, 2).toUpperCase() || 'GR')
        : (conv.users.find(u => u._id !== userId)?.displayName?.substring(0, 2).toUpperCase() || 'U'),
      avatarUrl: conv.type === 'group'
        ? conv.avatarUrl
        : conv.users.find(u => u._id !== userId)?.avatarUrl,
      isPinned: pinnedSet.has(conv._id),
      mutedUntil: mutedUntilByConversation[conv._id] || null,
      isGroup: conv.type === 'group',
      createdBy: conv.createdBy,
      adminIds: conv.adminIds,
      memberApprovalEnabled: conv.memberApprovalEnabled,
      removedFromGroup: conv.removedFromGroup,
      memberCount: conv.users.length,
      members: conv.users,
      online: getConversationPresence(conv).online,
      active: conv._id === selectedConversationId,
      activeCall: conv.activeCall ?? null,
      haveRead: unreadCounts.get(userId)? false: true,
      unreadCount: unreadCounts.get(userId) ?? 0,
      aiCatchupEnabled: conv.aiPreferences?.catchupEnabled !== false,
    }});
  }, [conversations, getConversationPresence, mutedUntilByConversation, pinnedConversationIds, selectedConversationId, userId]);

  const createGroupConversation = useCallback(
    async (name: string, memberIds: string[]) => {
      setGroupActionLoading(true);
      try {
        const createdGroup = await createGroup({ name, memberIds });

        const normalizedConversation: Conversation = {
          _id: createdGroup._id,
          type: 'group',
          name: createdGroup.name,
          avatarUrl: createdGroup.avatarUrl,
          createdBy: createdGroup.createdBy,
          adminIds: createdGroup.adminIds,
          memberApprovalEnabled: createdGroup.memberApprovalEnabled,
          removedFromGroup: false,
          users: createdGroup.users,
          unreadCounts: {},
        };

        setConversations((prev) => [normalizedConversation, ...prev.filter((c) => c._id !== createdGroup._id)]);
        setSelectedConversationId(createdGroup._id);

        return createdGroup;
      } finally {
        setGroupActionLoading(false);
      }
    },
    [],
  );

  const addMembersToGroupConversation = useCallback(
    async (groupId: string, memberIds: string[]) => {
      if (memberIds.length === 0) {
        return;
      }

      setGroupActionLoading(true);
      try {
        const updatedGroup = await addGroupMembers(groupId, { memberIds });

        setConversations((prev) => prev.map((conversation) => {
          if (conversation._id !== groupId) {
            return conversation;
          }

          return {
            ...conversation,
            name: updatedGroup.name,
            avatarUrl: updatedGroup.avatarUrl,
            createdBy: updatedGroup.createdBy,
            adminIds: updatedGroup.adminIds,
            memberApprovalEnabled: updatedGroup.memberApprovalEnabled,
            removedFromGroup: false,
            users: updatedGroup.users,
          };
        }));
      } finally {
        setGroupActionLoading(false);
      }
    },
    [],
  );

  const updateGroupMemberRoleConversation = useCallback(
    async (groupId: string, targetUserId: string, role: 'admin' | 'member') => {
      setGroupActionLoading(true);
      try {
        const updatedGroup = await updateGroupMemberRole(groupId, targetUserId, { role });

        setConversations((prev) => prev.map((conversation) => {
          if (conversation._id !== groupId) {
            return conversation;
          }

          return {
            ...conversation,
            name: updatedGroup.name,
            avatarUrl: updatedGroup.avatarUrl,
            createdBy: updatedGroup.createdBy,
            adminIds: updatedGroup.adminIds,
            memberApprovalEnabled: updatedGroup.memberApprovalEnabled,
            removedFromGroup: false,
            users: updatedGroup.users,
          };
        }));
      } finally {
        setGroupActionLoading(false);
      }
    },
    [],
  );

  const removeGroupMemberConversation = useCallback(
    async (groupId: string, targetUserId: string) => {
      setGroupActionLoading(true);
      try {
        const updatedGroup = await removeGroupMember(groupId, targetUserId);

        setConversations((prev) => prev.map((conversation) => {
          if (conversation._id !== groupId) {
            return conversation;
          }

          return {
            ...conversation,
            name: updatedGroup.name,
            avatarUrl: updatedGroup.avatarUrl,
            createdBy: updatedGroup.createdBy,
            adminIds: updatedGroup.adminIds,
            memberApprovalEnabled: updatedGroup.memberApprovalEnabled,
            removedFromGroup: false,
            users: updatedGroup.users,
          };
        }));
      } finally {
        setGroupActionLoading(false);
      }
    },
    [],
  );

  const updateGroupMemberApprovalConversation = useCallback(
    async (groupId: string, memberApprovalEnabled: boolean) => {
      setGroupActionLoading(true);
      try {
        const updatedGroup = await updateGroupMemberApproval(groupId, { memberApprovalEnabled });

        setConversations((prev) => prev.map((conversation) => {
          if (conversation._id !== groupId) {
            return conversation;
          }

          return {
            ...conversation,
            name: updatedGroup.name,
            avatarUrl: updatedGroup.avatarUrl,
            createdBy: updatedGroup.createdBy,
            adminIds: updatedGroup.adminIds,
            memberApprovalEnabled: updatedGroup.memberApprovalEnabled,
            removedFromGroup: false,
            users: updatedGroup.users,
          };
        }));
      } finally {
        setGroupActionLoading(false);
      }
    },
    [],
  );

  const ensureConversationAvailable = useCallback(
    async (groupId: string) => {
      try {
        const convosRes = await apiClient.get('/api/conversations');
        const convos: Conversation[] = convosRes.data.data || [];
        const matched = convos.find((conversation) => conversation._id === groupId);
        if (!matched) {
          return;
        }

        setConversations((prev) => {
          const exists = prev.some((conversation) => conversation._id === groupId);
          if (exists) {
            return prev;
          }
          return [matched, ...prev];
        });
      } catch (error) {
        console.error('Failed to sync newly added group conversation', error);
      }
    },
    [],
  );

  const openConversationFromSearch = useCallback(async (target: ConversationSearchTarget) => {
    if (target.type === 'group') {
      if (target.conversationId) {
        setSelectedConversationId(target.conversationId);
      }
      return;
    }

    const existingDirect = conversations.find((conversation) => (
      conversation.type !== 'group'
      && conversation.users.some((member) => member._id === target.id)
    ));

    if (existingDirect) {
      setSelectedConversationId(existingDirect._id);
      return;
    }

    let directConversation: Conversation | undefined;
    try {
      const response = await apiClient.post('/api/conversations/direct', { targetUserId: target.id });
      directConversation = response.data?.data as Conversation | undefined;
      if (!directConversation?._id) {
        return;
      }
    } catch (error) {
      console.error('Failed to open direct conversation', error);
      showSystemToast({
        id: 'direct-message-error',
        type: 'new_message',
        title: 'Không thể nhắn tin',
        body: resolveDirectConversationErrorMessage(error),
        variant: 'error',
      });
      return;
    }

    const normalizedConversation: Conversation = {
      _id: directConversation._id,
      type: directConversation.type,
      name: directConversation.name,
      avatarUrl: directConversation.avatarUrl,
      createdBy: directConversation.createdBy,
      adminIds: directConversation.adminIds,
      memberApprovalEnabled: directConversation.memberApprovalEnabled,
      removedFromGroup: false,
      users: directConversation.users || [],
      unreadCounts: directConversation.unreadCounts || {},
      lastMessage: directConversation.lastMessage,
      updatedAt: directConversation.updatedAt,
    };

    setConversations((prev) => {
      const exists = prev.some((conversation) => conversation._id === normalizedConversation._id);
      if (exists) {
        return prev.map((conversation) => (
          conversation._id === normalizedConversation._id
            ? { ...conversation, ...normalizedConversation }
            : conversation
        ));
      }
      return [normalizedConversation, ...prev];
    });

    setSelectedConversationId(normalizedConversation._id);
  }, [conversations]);

  const searchTargets = useCallback((): ConversationSearchTarget[] => {
    const targets: ConversationSearchTarget[] = [];

    const seenGroupIds = new Set<string>();
    for (const conversation of conversations) {
      if (conversation.type !== 'group') {
        continue;
      }
      if (seenGroupIds.has(conversation._id)) {
        continue;
      }
      seenGroupIds.add(conversation._id);
      targets.push({
        id: conversation._id,
        type: 'group',
        name: conversation.name || 'Nhóm',
        avatar: conversation.name?.substring(0, 2).toUpperCase() || 'GR',
        avatarUrl: conversation.type === 'group'
        ? conversation.avatarUrl
        : conversation.users.find(u => u._id !== userId)?.avatarUrl,
        conversationId: conversation._id,
      });
    }

    const seenFriendIds = new Set<string>();
    for (const friend of friendsForGroup) {
      if (seenFriendIds.has(friend.id)) {
        continue;
      }
      seenFriendIds.add(friend.id);
      targets.push({
        id: friend.id,
        type: 'friend',
        name: friend.displayName,
        avatar: friend.displayName.substring(0, 2).toUpperCase(),
        avatarUrl: friend.avatarUrl
      });
    }

    return targets;
  }, [conversations, friendsForGroup]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token || !userId) {
      return;
    }

    const socket = getSocket(token);
    type GroupUpdatedEvent = {
      groupId: string;
      type: 'created' | 'name_changed' | 'avatar_changed' | 'member_added' | 'member_removed' | 'role_changed' | 'member_approval_changed' | 'disbanded';
      data: Record<string, unknown>;
    };

    const handleGroupUpdated = (payload: GroupUpdatedEvent) => {
      if (payload.type === 'member_added') {
        const addedMemberIds = (payload.data['memberIds'] as string[] | undefined) ?? [];
        if (addedMemberIds.includes(userId)) {
          void ensureConversationAvailable(payload.groupId);
        }
      }

      setConversations((prev) => {
        const index = prev.findIndex((conversation) => conversation._id === payload.groupId);

        if (payload.type === 'disbanded') {
          if (index === -1) {
            return prev;
          }
          setPinnedConversationIds((ids) => ids.filter((id) => id !== payload.groupId));
          setMutedUntilByConversation((current) => {
            const next = { ...current };
            delete next[payload.groupId];
            return next;
          });
          return prev.filter((conversation) => conversation._id !== payload.groupId);
        }

        if (payload.type === 'created') {
          const group = payload.data['group'] as Conversation | undefined;
          if (!group) {
            return prev;
          }
          const normalized = {
            ...group,
            memberApprovalEnabled: group.memberApprovalEnabled ?? false,
            removedFromGroup: false,
          };
          if (index === -1) {
            return [normalized, ...prev];
          }
          const updated = [...prev];
          updated[index] = { ...updated[index], ...normalized };
          return updated;
        }

        if (index === -1) {
          return prev;
        }

        const updated = [...prev];
        const current = updated[index] as Conversation;

        if (payload.type === 'name_changed') {
          current.name = payload.data['name'] as string | undefined;
        }

        if (payload.type === 'avatar_changed') {
          current.avatarUrl = payload.data['avatarUrl'] as string | undefined;
        }

        if (payload.type === 'member_approval_changed') {
          current.memberApprovalEnabled = Boolean(payload.data['memberApprovalEnabled']);
        }

        const nextCreatedBy = payload.data['createdBy'];
        if (typeof nextCreatedBy === 'string' && nextCreatedBy.trim().length > 0) {
          current.createdBy = nextCreatedBy;
        }

        const nextAdminIds = payload.data['adminIds'];
        if (Array.isArray(nextAdminIds)) {
          current.adminIds = nextAdminIds.filter((id): id is string => typeof id === 'string');
        }

        if (payload.type === 'member_removed') {
          const removedUserId = payload.data['userId'] as string | undefined;
          if (removedUserId === userId) {
            setPinnedConversationIds((ids) => ids.filter((id) => id !== payload.groupId));
            setMutedUntilByConversation((current) => {
              const next = { ...current };
              delete next[payload.groupId];
              return next;
            });
            const filtered = prev.filter((conversation) => conversation._id !== payload.groupId);
            if (selectedConversationId === payload.groupId) {
              setSelectedConversationId(filtered[0]?._id ?? '');
            }
            return filtered;
          }

          if (removedUserId) {
            current.users = current.users.filter((member) => member._id !== removedUserId);
            current.adminIds = (current.adminIds ?? []).filter((id) => id !== removedUserId);
          }
        }

        if (payload.type === 'role_changed') {
          const changedUserId = payload.data['userId'] as string | undefined;
          const changedRole = payload.data['role'] as 'admin' | 'member' | undefined;
          if (changedUserId && changedRole && !Array.isArray(nextAdminIds)) {
            const adminSet = new Set(current.adminIds ?? []);
            if (changedRole === 'admin') {
              adminSet.add(changedUserId);
            } else {
              adminSet.delete(changedUserId);
            }
            current.adminIds = Array.from(adminSet);
          }
        }

        updated[index] = { ...current };
        return updated;
      });
    };

    socket.on('group_updated', handleGroupUpdated);

    return () => {
      socket.off('group_updated', handleGroupUpdated);
    };
  }, [ensureConversationAvailable, selectedConversationId, userId]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token || !userId) {
      return;
    }

    getSocket(token);

    const handleCallInvited = (payload: CallInvitedPayload) => {
      const pendingOutgoing = pendingOutgoingCallRef.current;
      const isGroupCall = payload.isGroupCall === true;
      const participantIds = payload.participantIds && payload.participantIds.length > 0
        ? payload.participantIds
        : pendingOutgoing?.participantIds ?? [userId, payload.targetUserId ?? ''].filter((id) => id.length > 0);

      const participantDisplayNames = pendingOutgoing?.participantDisplayNames
        ?? resolveParticipantDisplayNames(participantIds);

      clearCallResetTimer();
      closePeerConnection();
      stopRemoteMedia();
      setCallError(null);
      setActiveCall({
        sessionId: payload.sessionId,
        conversationId: payload.conversationId ?? pendingOutgoing?.conversationId ?? null,
        conversationName: conversations.find((conversation) => conversation._id === (payload.conversationId ?? pendingOutgoing?.conversationId))?.name ?? null,
        isGroupCall,
        initiatedBy: pendingOutgoing?.initiatedBy ?? userId,
        participantIds,
        participants: participantIds.map((participantId) => ({
          userId: participantId,
          displayName: participantDisplayNames[participantId],
        })),
        joinedParticipantIds: [userId],
        participantDisplayNames,
        direction: 'outgoing',
        status: 'outgoing',
        callToken: payload.callToken,
        callType: payload.callType ?? pendingOutgoing?.callType ?? 'video',
        startedAt: null,
      });
    };

    const handleCallIncoming = (payload: CallIncomingPayload) => {
      const peerInfo = resolvePeerInfo(payload.fromUserId);
      const isGroupCall = payload.isGroupCall === true;
      const participantIds = payload.participantIds && payload.participantIds.length > 0
        ? payload.participantIds
        : [userId, payload.fromUserId];
      const participantDisplayNames = resolveParticipantDisplayNames(participantIds);

      const current = activeCallRef.current;
      if (
        current
        && current.sessionId !== payload.sessionId
        && current.status !== 'ended'
        && current.status !== 'missed'
        && current.status !== 'rejected'
      ) {
        emitCallReject(payload.sessionId, payload.callToken, 'busy');
        setCallError(ACTIVE_CALL_CONFLICT_MESSAGE);
        return;
      }

      if (current?.sessionId === payload.sessionId) {
        setActiveCall((prev) => {
          if (!prev || prev.sessionId !== payload.sessionId) {
            return prev;
          }

          return {
            ...prev,
            conversationId: payload.conversationId ?? prev.conversationId ?? peerInfo.conversationId ?? null,
            conversationName: payload.conversationName ?? prev.conversationName ?? null,
            isGroupCall,
            initiatedBy: payload.fromUserId,
            participantIds,
            participants: participantIds.map((participantId) => ({
              userId: participantId,
              displayName: (participantDisplayNames[participantId] ?? prev.participantDisplayNames[participantId]),
            })),
            participantDisplayNames: {
              ...participantDisplayNames,
              ...prev.participantDisplayNames,
            },
            callToken: payload.callToken,
            callType: payload.callType ?? prev.callType ?? 'video',
            status: prev.status === 'connected' || prev.status === 'connecting' ? prev.status : 'incoming',
          };
        });
        return;
      }

      clearCallResetTimer();
      closePeerConnection();
      stopRemoteMedia();
      setCallError(null);
      setActiveCall({
        sessionId: payload.sessionId,
        conversationId: payload.conversationId ?? peerInfo.conversationId ?? null,
        conversationName: payload.conversationName ?? null,
        isGroupCall,
        initiatedBy: payload.fromUserId,
        participantIds,
        participants: participantIds.map((participantId) => ({
          userId: participantId,
          displayName: participantDisplayNames[participantId],
        })),
        joinedParticipantIds: [payload.fromUserId],
        participantDisplayNames,
        direction: 'incoming',
        status: 'incoming',
        callToken: payload.callToken,
        callType: payload.callType ?? 'video',
        startedAt: null,
      });

      if (payload.conversationId) {
        setSelectedConversationId(payload.conversationId);
      } else if (peerInfo.conversationId) {
        setSelectedConversationId(peerInfo.conversationId);
      }
    };

    const handleCallStatus = (payload: CallStatusPayload) => {
      const current = activeCallRef.current;
      if (!current || current.sessionId !== payload.sessionId) {
        return;
      }

      clearCallResetTimer();
      setActiveCall((prev) => {
        if (!prev || prev.sessionId !== payload.sessionId) {
          return prev;
        }

        const nextStatus: CallUiStatus = payload.status === 'ringing'
          ? (prev.direction === 'incoming' ? 'incoming' : 'outgoing')
          : payload.status;
        const isAwaitingAccept = prev.direction === 'incoming' && !prev.joinedParticipantIds.includes(userId);
        const shouldKeepIncoming = isAwaitingAccept && (nextStatus === 'connecting' || nextStatus === 'connected');

        return {
          ...prev,
          status: shouldKeepIncoming ? 'incoming' : nextStatus,
          reason: payload.reason,
          startedAt: payload.status === 'connected' ? (prev.startedAt ?? new Date().toISOString()) : prev.startedAt,
        };
      });

      if (payload.status === 'connected') {
        void ensureLocalMedia(isCameraEnabled)
          .then(async () => {
            const latestCall = activeCallRef.current;
            if (!latestCall || latestCall.sessionId !== payload.sessionId) {
              return;
            }

            const joinedPeers = latestCall.joinedParticipantIds.filter((participantId) => participantId !== userId);
            await Promise.all(joinedPeers.map(async (peerUserId) => {
              const connection = ensurePeerConnection(latestCall, peerUserId);
              if (!connection) {
                return;
              }
              await flushPendingRemoteCandidates(peerUserId, connection);
            }));
          })
          .catch((error: unknown) => {
            setCallError(resolveCallMediaErrorMessage(error, 'Không thể truy cập camera hoặc microphone.'));
          });
      }

      if (payload.status === 'ended' || payload.status === 'rejected' || payload.status === 'missed') {
        const latestCall = activeCallRef.current;
        if (latestCall && latestCall.sessionId === payload.sessionId) {
          clearConversationActiveCallState(payload.sessionId, latestCall.conversationId);
          setScreenSharingUserId(null);
          setCallError(null);
          scheduleCallReset();
          return;
        }

        clearConversationActiveCallState(payload.sessionId);
      }
    };

    const handleCallParticipantJoined = async (payload: CallParticipantPayload) => {
      const current = activeCallRef.current;
      if (!current || current.sessionId !== payload.sessionId) {
        return;
      }

      if (current.direction === 'incoming' && !current.joinedParticipantIds.includes(userId) && payload.userId !== userId) {
        return;
      }

      const joinedParticipantIds = payload.joinedParticipantIds && payload.joinedParticipantIds.length > 0
        ? Array.from(new Set(payload.joinedParticipantIds))
        : Array.from(new Set([...current.joinedParticipantIds, payload.userId]));

      const participantIds = Array.from(new Set([...current.participantIds, ...joinedParticipantIds]));
      const participantDisplayNames = {
        ...current.participantDisplayNames,
        ...resolveParticipantDisplayNames(participantIds),
      };

      setActiveCall((prev) => {
        if (!prev || prev.sessionId !== payload.sessionId) {
          return prev;
        }

        return {
          ...prev,
          status: prev.status === 'connected' ? prev.status : 'connecting',
          participantIds,
          joinedParticipantIds,
          participantDisplayNames,
        };
      });

      const latestCall = activeCallRef.current;
      if (!latestCall || latestCall.sessionId !== payload.sessionId) {
        return;
      }

      const peersToOffer = (payload.userId === userId
        ? joinedParticipantIds.filter((participantId) => participantId !== userId)
        : [payload.userId]
      ).filter((peerUserId) => shouldCreateOfferForPeer(latestCall, peerUserId));

      if (peersToOffer.length === 0) {
        return;
      }

      try {
        try {
          await ensureLocalMedia(latestCall.callType === 'audio' ? false : isCameraEnabled);
        } catch (error: unknown) {
          if (latestCall.callType === 'video') {
            await ensureLocalMedia(false);
            setCallError('Không truy cập được camera, tiếp tục cuộc gọi với audio.');
          } else {
            throw error;
          }
        }
        let hasOfferFailure = false;
        for (const peerUserId of peersToOffer) {
          try {
            await createOfferForPeer(latestCall, peerUserId);
          } catch (error) {
            hasOfferFailure = true;
            console.warn('[Call] Failed to create WebRTC offer', { sessionId: payload.sessionId, peerUserId, error });
          }
        }

        if (hasOfferFailure) {
          setCallError('Một vài thành viên chưa kết nối được WebRTC. Cuộc gọi vẫn đang tiếp tục.');
        }
      } catch {
        setCallError('Không thể chuẩn bị camera hoặc microphone cho cuộc gọi.');
      }
    };

    const handleCallParticipantLeft = (payload: CallParticipantPayload) => {
      const current = activeCallRef.current;
      if (!current || current.sessionId !== payload.sessionId) {
        return;
      }

      if (payload.userId !== userId) {
        closePeerConnection(payload.userId);
      }
      setScreenSharingUserId((prev) => (prev === payload.userId ? null : prev));

      setActiveCall((prev) => {
        if (!prev || prev.sessionId !== payload.sessionId) {
          return prev;
        }

        const nextJoined = prev.joinedParticipantIds.filter((participantId) => participantId !== payload.userId);
        const remainingPeers = nextJoined.filter((participantId) => participantId !== userId);
        const shouldEnd = !prev.isGroupCall && remainingPeers.length === 0;

        if (!shouldEnd) {
          return {
            ...prev,
            joinedParticipantIds: nextJoined,
          };
        }

        return {
          ...prev,
          joinedParticipantIds: nextJoined,
          status: 'ended',
          reason: payload.reason ?? 'ended',
        };
      });

      const latestCall = activeCallRef.current;
      if (latestCall && latestCall.sessionId === payload.sessionId) {
        if (payload.userId === userId) {
          clearConversationActiveCallState(payload.sessionId, latestCall.conversationId);
          scheduleCallReset(500);
          return;
        }

        const remainingPeers = latestCall.joinedParticipantIds
          .filter((participantId) => participantId !== payload.userId)
          .filter((participantId) => participantId !== userId);
        if (!latestCall.isGroupCall && remainingPeers.length === 0) {
          scheduleCallReset();
        }
      }
    };

    const handleCallMediaState = (payload: CallMediaStatePayload) => {
      const current = activeCallRef.current;
      if (!current || current.sessionId !== payload.sessionId) {
        return;
      }

      setScreenSharingUserId((prev) => {
        if (payload.isScreenSharing) {
          return payload.userId;
        }
        return prev === payload.userId ? null : prev;
      });
    };

    const handleWebRtcOffer = async (payload: WebRtcOfferPayload) => {
      const current = activeCallRef.current;
      if (!current || current.sessionId !== payload.sessionId || !current.callToken) {
        return;
      }

      try {
        const connection = ensurePeerConnection(current, payload.fromUserId);
        if (!connection) {
          setCallError('Trình duyệt không hỗ trợ WebRTC.');
          return;
        }

        await connection.setRemoteDescription(payload.sdp as RTCSessionDescriptionInit);
        await flushPendingRemoteCandidates(payload.fromUserId, connection);

        const answer = await connection.createAnswer();
        await connection.setLocalDescription(answer);

        emitWebRtcAnswer(
          payload.sessionId,
          payload.fromUserId,
          current.callToken,
          answer,
        );
      } catch {
        setCallError('Không thể gửi phản hồi kết nối WebRTC.');
      }
    };

    const handleWebRtcAnswer = async (payload: WebRtcAnswerPayload) => {
      const current = activeCallRef.current;
      if (!current || current.sessionId !== payload.sessionId) {
        return;
      }

      const connection = peerConnectionsRef.current.get(payload.fromUserId) ?? ensurePeerConnection(current, payload.fromUserId);
      if (!connection) {
        return;
      }

      try {
        await connection.setRemoteDescription(payload.sdp as RTCSessionDescriptionInit);
        await flushPendingRemoteCandidates(payload.fromUserId, connection);
      } catch {
        setCallError('Không thể đồng bộ phản hồi WebRTC.');
      }
    };

    const handleWebRtcIceCandidate = async (payload: WebRtcIceCandidatePayload) => {
      const current = activeCallRef.current;
      if (!current || current.sessionId !== payload.sessionId) {
        return;
      }

      const connection = peerConnectionsRef.current.get(payload.fromUserId) ?? ensurePeerConnection(current, payload.fromUserId);
      if (!connection) {
        return;
      }

      if (!connection.remoteDescription) {
        const queued = pendingRemoteCandidatesRef.current.get(payload.fromUserId) ?? [];
        queued.push(payload.candidate);
        pendingRemoteCandidatesRef.current.set(payload.fromUserId, queued);
        return;
      }

      try {
        await connection.addIceCandidate(payload.candidate);
      } catch {
        setCallError('Không thể nhận ICE candidate.');
      }
    };

    const handleSocketError = (payload: { message: string; code?: string }) => {
      if (payload.code === 'ACTIVE_CALL_EXISTS') {
        notifyCallBlockingIssue(payload.message || ACTIVE_CALL_CONFLICT_MESSAGE);
        return;
      }

      if (payload.code === 'GROUP_CALL_REQUIRES_PARTICIPANTS') {
        setCallFriendError('Nhóm cần ít nhất 2 thành viên để bắt đầu cuộc gọi.');
        return;
      }

      if (!payload.message.toLowerCase().includes('call')) {
        return;
      }

      // Chi hien toast cho cac loi nhu "not accepted friends" - khong co sessionId
      // (co nghia la call bi tu choi truoc khi bat dau, can hien thi toast)
      const friendErrorPhrases = [
        'only accepted friends',
        'not friends',
        'friend',
        'chỉ có thể gọi với',
      ];
      const isFriendError = friendErrorPhrases.some((phrase) =>
        payload.message.toLowerCase().includes(phrase),
      );

      if (isFriendError) {
        // Hien thi toast error 5s roi tu dong tat
        if (callFriendErrorTimeoutRef.current) {
          clearTimeout(callFriendErrorTimeoutRef.current);
        }
        setCallFriendError(payload.message);
        callFriendErrorTimeoutRef.current = setTimeout(() => {
          setCallFriendError(null);
        }, 5000);
        // Reset call UI vi khong co session
        resetCallUi();
        return;
      }

      setCallError(payload.message);
      const current = activeCallRef.current;
      if (current && (!current.sessionId || !current.callToken)) {
        resetCallUi();
        setCallError(payload.message);
      }
    };

    listenToCallInvited(handleCallInvited);
    listenToCallIncoming(handleCallIncoming);
    listenToCallStatus(handleCallStatus);
    listenToCallParticipantJoined(handleCallParticipantJoined);
    listenToCallParticipantLeft(handleCallParticipantLeft);
    listenToCallMediaState(handleCallMediaState);
    listenToWebRtcOffer(handleWebRtcOffer);
    listenToWebRtcAnswer(handleWebRtcAnswer);
    listenToWebRtcIceCandidate(handleWebRtcIceCandidate);
    listenToErrors(handleSocketError);

    return () => {
      unlistenToCallInvited(handleCallInvited as (...args: unknown[]) => void);
      unlistenToCallIncoming(handleCallIncoming as (...args: unknown[]) => void);
      unlistenToCallStatus(handleCallStatus as (...args: unknown[]) => void);
      unlistenToCallParticipantJoined(handleCallParticipantJoined as (...args: unknown[]) => void);
      unlistenToCallParticipantLeft(handleCallParticipantLeft as (...args: unknown[]) => void);
      unlistenToCallMediaState(handleCallMediaState as (...args: unknown[]) => void);
      unlistenToWebRtcOffer(handleWebRtcOffer as (...args: unknown[]) => void);
      unlistenToWebRtcAnswer(handleWebRtcAnswer as (...args: unknown[]) => void);
      unlistenToWebRtcIceCandidate(handleWebRtcIceCandidate as (...args: unknown[]) => void);
      unlistenToErrors(handleSocketError as (...args: unknown[]) => void);
    };
  }, [
    closePeerConnection,
    clearConversationActiveCallState,
    conversations,
    createOfferForPeer,
    clearCallResetTimer,
    ensureLocalMedia,
    ensurePeerConnection,
    flushPendingRemoteCandidates,
    isCameraEnabled,
    notifyCallBlockingIssue,
    resolveParticipantDisplayNames,
    resolvePeerInfo,
    resetCallUi,
    scheduleCallReset,
    shouldCreateOfferForPeer,
    stopRemoteMedia,
    userId,
  ]);

  const handleStartCall = useCallback(async (callType: CallMediaType = 'video') => {
    if (!selectedConversationId || !userId) {
      return;
    }

    const selectedConversation = conversations.find((conversation) => conversation._id === selectedConversationId);
    if (!selectedConversation) {
      return;
    }

    const currentCall = activeCallRef.current;
    if (
      currentCall
      && currentCall.sessionId
      && currentCall.status !== 'ended'
      && currentCall.status !== 'missed'
      && currentCall.status !== 'rejected'
    ) {
      notifyCallBlockingIssue(ACTIVE_CALL_CONFLICT_MESSAGE);
      return;
    }

    const insecureContextMessage = getWebRtcInsecureContextMessage();
    if (insecureContextMessage) {
      notifyCallBlockingIssue(insecureContextMessage);
      return;
    }

    clearCallResetTimer();
    closePeerConnection();
    stopRemoteMedia();
    setCallError(null);
    setIsMicMuted(false);
    setIsCameraEnabled(callType === 'video');

    const participantIds = Array.from(new Set(selectedConversation.users.map((member) => member._id)));
    if (!participantIds.includes(userId)) {
      participantIds.push(userId);
    }

    if (selectedConversation.type === 'group' && participantIds.length < 2) {
      setCallFriendError('Nhóm cần ít nhất 2 thành viên để bắt đầu cuộc gọi.');
      return;
    }

    let isGroupCall = selectedConversation.type === 'group';
    let emitInvite: () => void;

    if (selectedConversation.type === 'direct') {
      const peer = selectedConversation.users.find((member) => member._id !== userId);
      if (!peer) {
        return;
      }

      emitInvite = () => {
        emitCallInvite(peer._id, selectedConversation._id, callType);
      };
      isGroupCall = false;
    } else {
      emitInvite = () => {
        emitCallGroupInvite(selectedConversation._id, callType);
      };
      isGroupCall = true;
    }

    const participantDisplayNames = resolveParticipantDisplayNames(participantIds);

    pendingOutgoingCallRef.current = {
      conversationId: selectedConversation._id,
      isGroupCall,
      initiatedBy: userId,
      participantIds,
      participantDisplayNames,
      callType,
    };

    setActiveCall({
      sessionId: '',
      conversationId: selectedConversation._id,
      conversationName: selectedConversation.name ?? null,
      isGroupCall,
      initiatedBy: userId,
      participantIds,
      participants: participantIds.map((participantId) => ({
        userId: participantId,
        displayName: participantDisplayNames[participantId],
      })),
      joinedParticipantIds: [userId],
      participantDisplayNames,
      direction: 'outgoing',
      status: 'outgoing',
      callToken: '',
      callType,
      startedAt: null,
    });

    try {
      await ensureLocalMedia(callType === 'video');
      emitInvite();
    } catch (error: unknown) {
      const message = resolveCallMediaErrorMessage(
        error,
        'Không thể bắt đầu cuộc gọi. Vui lòng kiểm tra camera và microphone.',
      );
      if (message === WEBRTC_INSECURE_CONTEXT_MESSAGE) {
        notifyCallBlockingIssue(message);
      } else {
        setCallError(message);
      }
      setActiveCall(null);
      pendingOutgoingCallRef.current = null;
      stopLocalMedia();
    }
  }, [
    closePeerConnection,
    clearCallResetTimer,
    conversations,
    ensureLocalMedia,
    notifyCallBlockingIssue,
    resolveParticipantDisplayNames,
    selectedConversationId,
    stopRemoteMedia,
    stopLocalMedia,
    userId,
  ]);

  const handleStartVideoCall = useCallback(() => handleStartCall('video'), [handleStartCall]);
  const handleStartAudioCall = useCallback(() => handleStartCall('audio'), [handleStartCall]);

  const handleAcceptIncomingCall = useCallback(async () => {
    const current = activeCallRef.current;
    if (!current || current.direction !== 'incoming') {
      return;
    }

    const currentJoinedCall = activeCallRef.current;
    if (
      currentJoinedCall
      && currentJoinedCall.sessionId !== current.sessionId
      && currentJoinedCall.status !== 'ended'
      && currentJoinedCall.status !== 'missed'
      && currentJoinedCall.status !== 'rejected'
    ) {
      notifyCallBlockingIssue(ACTIVE_CALL_CONFLICT_MESSAGE);
      return;
    }

    const insecureContextMessage = getWebRtcInsecureContextMessage();
    if (insecureContextMessage) {
      notifyCallBlockingIssue(insecureContextMessage);
      return;
    }

    clearCallResetTimer();
    setCallError(null);
    setIsCameraEnabled(current.callType === 'video');

    try {
      try {
        await ensureLocalMedia(current.callType === 'audio' ? false : true);
      } catch {
        await ensureLocalMedia(false);
        setCallError('Không truy cập được camera, tiếp tục cuộc gọi với audio.');
      }

      const joinedPeers = current.joinedParticipantIds.filter((participantId) => participantId !== userId);
      for (const peerUserId of joinedPeers) {
        const connection = ensurePeerConnection(current, peerUserId);
        if (!connection) {
          setCallError('Trình duyệt không hỗ trợ WebRTC.');
          return;
        }

        attachLocalTracksToPeer(connection);
      }

      emitCallAccept(current.sessionId, current.callToken);

      for (const peerUserId of joinedPeers) {
        if (shouldCreateOfferForPeer(current, peerUserId)) {
          await createOfferForPeer(current, peerUserId);
        }
      }

      setActiveCall((prev) => {
        if (!prev) {
          return prev;
        }
        return {
          ...prev,
          status: 'connecting',
        };
      });
    } catch (error: unknown) {
      const message = resolveCallMediaErrorMessage(error, 'Không thể chấp nhận cuộc gọi. Vui lòng thử lại.');
      if (message === WEBRTC_INSECURE_CONTEXT_MESSAGE) {
        notifyCallBlockingIssue(message);
      } else {
        setCallError(message);
      }
    }
  }, [
    attachLocalTracksToPeer,
    clearCallResetTimer,
    createOfferForPeer,
    ensureLocalMedia,
    ensurePeerConnection,
    isCameraEnabled,
    notifyCallBlockingIssue,
    shouldCreateOfferForPeer,
    userId,
  ]);

  const handleRejectIncomingCall = useCallback(() => {
    const current = activeCallRef.current;
    if (!current || current.direction !== 'incoming') {
      return;
    }

    try {
      emitCallReject(current.sessionId, current.callToken, 'rejected');
    } catch {
      setCallError('Không thể từ chối cuộc gọi lúc này.');
    }

    setActiveCall((prev) => {
      if (!prev) {
        return prev;
      }
      return {
        ...prev,
        status: 'rejected',
        reason: 'rejected',
      };
    });
    clearConversationActiveCallState(current.sessionId, current.conversationId);
    setCallError(null);
    scheduleCallReset(1200);
  }, [clearConversationActiveCallState, scheduleCallReset]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!activeCall || activeCall.direction !== 'incoming') {
      return;
    }

    if (activeCall.status !== 'incoming' && activeCall.status !== 'ringing') {
      return;
    }

    const autoAcceptSessionId = window.sessionStorage.getItem('zync.autoAcceptCallSessionId');
    if (autoAcceptSessionId !== activeCall.sessionId) {
      return;
    }

    window.sessionStorage.removeItem('zync.autoAcceptCallSessionId');
    void handleAcceptIncomingCall();
  }, [activeCall, handleAcceptIncomingCall]);

  const handleEndCall = useCallback(() => {
    const current = activeCallRef.current;
    if (!current) {
      return;
    }

    if (current.sessionId && current.callToken) {
      try {
        emitCallEnd(current.sessionId, current.callToken, 'ended');
      } catch {
        setCallError('Không thể kết thúc cuộc gọi từ server.');
      }
    }

    setActiveCall((prev) => {
      if (!prev) {
        return prev;
      }
      return {
        ...prev,
        status: 'ended',
        reason: 'ended',
      };
    });
    setCallError(null);
    scheduleCallReset(1200);
  }, [scheduleCallReset]);

  const handleDismissCallUi = useCallback(() => {
    clearCallResetTimer();
    resetCallUi();
  }, [clearCallResetTimer, resetCallUi]);

  const handleToggleMic = useCallback(() => {
    setIsMicMuted((prev) => {
      const next = !prev;
      localStreamRef.current?.getAudioTracks().forEach((track) => {
        track.enabled = !next;
      });
      return next;
    });
  }, []);

  const handleToggleCamera = useCallback(() => {
    setIsCameraEnabled((prev) => {
      const next = !prev;
      localStreamRef.current?.getVideoTracks().forEach((track) => {
        track.enabled = next;
      });
      return next;
    });
  }, []);

  const handleToggleScreenShare = useCallback(async () => {
    const insecureContextMessage = getWebRtcInsecureContextMessage();
    if (insecureContextMessage) {
      notifyCallBlockingIssue(insecureContextMessage);
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
      setCallError('Không thể chia sẻ màn hình trên trình duyệt hiện tại.');
      return;
    }

    if (isScreenSharing) {
      const current = activeCallRef.current;
      const cameraTrack = localStreamRef.current?.getVideoTracks()[0] ?? null;
      screenShareStreamRef.current?.getTracks().forEach((track) => {
        track.onended = null;
        track.stop();
      });
      screenShareStreamRef.current = null;
      if (screenShareVideoRef.current) {
        screenShareVideoRef.current.srcObject = null;
      }
      replacePeerVideoTrack(cameraTrack);
      setIsScreenSharing(false);
      setScreenSharingUserId(null);
      if (current?.sessionId && current.callToken) {
        try {
          emitCallMediaState(current.sessionId, current.callToken, { isScreenSharing: false });
        } catch {
          setCallError('Không thể đồng bộ trạng thái chia sẻ màn hình.');
        }
      }
      return;
    }

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const displayTrack = displayStream.getVideoTracks()[0];
      if (!displayTrack) {
        return;
      }

      screenShareStreamRef.current = displayStream;
      replacePeerVideoTrack(displayTrack);
      setIsScreenSharing(true);
      setScreenSharingUserId(userId);
      syncScreenSharePreview();
      const current = activeCallRef.current;
      if (current?.sessionId && current.callToken) {
        try {
          emitCallMediaState(current.sessionId, current.callToken, { isScreenSharing: true });
        } catch {
          setCallError('Không thể đồng bộ trạng thái chia sẻ màn hình.');
        }
      }
      displayTrack.onended = () => {
        const latestCall = activeCallRef.current;
        const cameraTrack = localStreamRef.current?.getVideoTracks()[0] ?? null;
        screenShareStreamRef.current = null;
        if (screenShareVideoRef.current) {
          screenShareVideoRef.current.srcObject = null;
        }
        replacePeerVideoTrack(cameraTrack);
        setIsScreenSharing(false);
        setScreenSharingUserId(null);
        if (latestCall?.sessionId && latestCall.callToken) {
          try {
            emitCallMediaState(latestCall.sessionId, latestCall.callToken, { isScreenSharing: false });
          } catch {
            setCallError('Không thể đồng bộ trạng thái chia sẻ màn hình.');
          }
        }
      };
    } catch (error: unknown) {
      const message = resolveCallMediaErrorMessage(error, 'Không thể bật chia sẻ màn hình.');
      if (message === WEBRTC_INSECURE_CONTEXT_MESSAGE) {
        notifyCallBlockingIssue(message);
      } else {
        setCallError(message);
      }
    }
  }, [isScreenSharing, notifyCallBlockingIssue, replacePeerVideoTrack, syncScreenSharePreview, userId]);

  const disbandGroupConversation = useCallback(
    async (groupId: string) => {
      setGroupActionLoading(true);
      try {
        await disbandGroup(groupId);

        setConversations((prev) => {
          const filtered = prev.filter((conversation) => conversation._id !== groupId);
          if (selectedConversationId === groupId) {
            setSelectedConversationId(filtered[0]?._id ?? '');
          }
          return filtered;
        });

        setPinnedConversationIds((prev) => prev.filter((id) => id !== groupId));
        setMutedUntilByConversation((prev) => {
          const next = { ...prev };
          delete next[groupId];
          return next;
        });
      } finally {
        setGroupActionLoading(false);
      }
    },
    [selectedConversationId],
  );

  const leaveGroupConversation = useCallback(
    async (groupId: string) => {
      setGroupActionLoading(true);
      try {
        await leaveGroup(groupId);

        setConversations((prev) => {
          const filtered = prev.filter((conversation) => conversation._id !== groupId);
          if (selectedConversationId === groupId) {
            setSelectedConversationId(filtered[0]?._id ?? '');
          }
          return filtered;
        });

        setPinnedConversationIds((prev) => prev.filter((id) => id !== groupId));
        setMutedUntilByConversation((prev) => {
          const next = { ...prev };
          delete next[groupId];
          return next;
        });
      } finally {
        setGroupActionLoading(false);
      }
    },
    [selectedConversationId],
  );

  const toggleConversationPin = useCallback(
    async (conversationId: string, shouldPin: boolean) => {
      if (!conversationId) {
        return;
      }

      const prevPinned = pinnedConversationIds;
      setPinnedConversationIds((prev) => (
        shouldPin ? Array.from(new Set([...prev, conversationId])) : prev.filter((id) => id !== conversationId)
      ));

      try {
        if (shouldPin) {
          await pinConversation(conversationId);
        } else {
          await unpinConversation(conversationId);
        }
      } catch (error) {
        setPinnedConversationIds(prevPinned);
        throw error;
      }
    },
    [pinnedConversationIds],
  );

  const muteConversationByDuration = useCallback(
    async (conversationId: string, duration: '1h' | '4h' | '8h' | 'until_enabled') => {
      if (!conversationId) {
        return;
      }

      const now = Date.now();
      const until = duration === '1h'
        ? new Date(now + 60 * 60 * 1000)
        : duration === '4h'
          ? new Date(now + 4 * 60 * 60 * 1000)
          : duration === '8h'
            ? new Date(now + 8 * 60 * 60 * 1000)
            : new Date('9999-12-31T23:59:59.999Z');

      const prevMuted = mutedUntilByConversation[conversationId] ?? null;
      setMutedUntilByConversation((prev) => ({ ...prev, [conversationId]: until }));

      try {
        await muteConversation(conversationId, until.toISOString());
      } catch (error) {
        setMutedUntilByConversation((prev) => ({ ...prev, [conversationId]: prevMuted }));
        throw error;
      }
    },
    [mutedUntilByConversation],
  );

  const unmuteConversationById = useCallback(async (conversationId: string) => {
    if (!conversationId) {
      return;
    }

    const prevMuted = mutedUntilByConversation[conversationId] ?? null;
    setMutedUntilByConversation((prev) => ({ ...prev, [conversationId]: null }));

    try {
      await unmuteConversation(conversationId);
    } catch (error) {
      setMutedUntilByConversation((prev) => ({ ...prev, [conversationId]: prevMuted }));
      throw error;
    }
  }, [mutedUntilByConversation]);

  const getSelectedConversationInfo = useCallback(() => {
    const conv = conversations.find(c => c._id === selectedConversationId);
    if (!conv) return null;

    if (conv.type === 'group') {
      return {
        participantName: conv.name || 'Nhóm',
        participantAvatar: conv.name?.substring(0, 2).toUpperCase() || 'GR',
        participantAvatarUrl: conv.avatarUrl,
        isOnline: false,
        participantUserId: undefined,
      };
    }

    const otherUser = conv.users.find(u => u._id !== userId);
    return {
      participantName: otherUser?.displayName || 'Người dùng',
      participantAvatar: otherUser?.displayName?.substring(0, 2).toUpperCase(),
      participantAvatarUrl: otherUser?.avatarUrl,
      isOnline: presenceByUserId[otherUser?._id ?? '']?.online ?? false,
      participantUserId: otherUser?._id,
    };
  }, [conversations, presenceByUserId, selectedConversationId, userId]);

  const updateGroupConversation = useCallback(
    async (groupId: string, payload: { name?: string; avatarUrl?: string | null }) => {
      setGroupActionLoading(true);
      try {
        const updatedGroup = await updateGroup(groupId, payload);

        setConversations((prev) => prev.map((conversation) => {
          if (conversation._id !== groupId) {
            return conversation;
          }

          return {
            ...conversation,
            name: updatedGroup.name,
            avatarUrl: updatedGroup.avatarUrl,
            createdBy: updatedGroup.createdBy,
            adminIds: updatedGroup.adminIds,
            memberApprovalEnabled: updatedGroup.memberApprovalEnabled,
            removedFromGroup: false,
            users: updatedGroup.users,
          };
        }));
      } finally {
        setGroupActionLoading(false);
      }
    },
    [],
  );

  // Send message handler
  const handleSendMessage = useCallback(
    async (content: string, type: MessageType, mediaUrl?: string, options?: SendMessageOptions) => {
      if (!selectedConversationId || !userId) return;

      try {
        // Use sendMessage from useChat hook
        const result = await sendMessage(content, type, data.user.displayName, data.user.avatarUrl, mediaUrl, options);
        console.debug('[handleSendMessage] sent, idempotencyKey:', result);
        return result;
      } catch (error) {
        console.error('Failed to send message:', error);
        return null;
      }
    },
    [selectedConversationId, userId, sendMessage],
  );

  const handleCancelPendingMessage = useCallback((idempotencyKey: string) => {
    cancelPendingMessage(idempotencyKey);
  }, [cancelPendingMessage]);

  // Start typing handler
  const handleStartTyping = useCallback(() => {
    if (!selectedConversationId) return;

    startTyping();

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set debounce timeout (3s)
    typingTimeoutRef.current = setTimeout(() => {
      stopTyping();
      typingTimeoutRef.current = null;
    }, 3000);
  }, [selectedConversationId, startTyping, stopTyping]);

  // Stop typing handler
  const handleStopTyping = useCallback(() => {
    if (!selectedConversationId) return;

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }

    stopTyping();
  }, [selectedConversationId, stopTyping]);

  // Forward message
  const handleForwardMessage = useCallback((message: Message) => {
    setForwardingMessage(message);
    setForwardModalOpen(true);
  }, []);

  const handleReactionUpsert = useCallback(
    (message: Message, emoji: string, delta: 1 | 2 | 3, actionSource: string) => {
      if (!selectedConversationId) {
        return;
      }

      const messageRef = resolveMessageRef(message);
      const requestId = uuidv4();
      const idempotencyKey = uuidv4();

      const prevUserState = reactionUserStateByMessage[message._id] || message.reactionUserState;
      const prevSummary = message.reactionSummary || { totalCount: 0, emojiCounts: {} };
      const previousSummary: MessageReactionSummary = {
        totalCount: prevSummary.totalCount,
        emojiCounts: { ...(prevSummary.emojiCounts || {}) },
      };
      const previousUserState: MessageReactionUserState = prevUserState
        ? {
          lastEmoji: prevUserState.lastEmoji,
          totalCount: prevUserState.totalCount,
          emojiCounts: { ...(prevUserState.emojiCounts || {}) },
        }
        : {
          lastEmoji: null,
          totalCount: 0,
          emojiCounts: {},
        };

      const nextEmojiCounts = { ...(prevSummary.emojiCounts || {}) };
      nextEmojiCounts[emoji] = (nextEmojiCounts[emoji] || 0) + delta;

      const nextSummary: MessageReactionSummary = {
        totalCount: prevSummary.totalCount + delta,
        emojiCounts: nextEmojiCounts,
      };

      const nextUserEmojiCounts = { ...(prevUserState?.emojiCounts || {}) };
      nextUserEmojiCounts[emoji] = (nextUserEmojiCounts[emoji] || 0) + delta;

      const nextUserState: MessageReactionUserState = {
        lastEmoji: emoji,
        totalCount: (prevUserState?.totalCount || 0) + delta,
        emojiCounts: nextUserEmojiCounts,
      };

      registerPendingReaction({
        requestId,
        messageId: message._id,
        messageRef,
        previousSummary,
        previousUserState,
      });

      applyReactionSummaryToMessage({ messageId: message._id, messageRef }, nextSummary, nextUserState);
      updateReactionUserStateCache(message._id, messageRef, nextUserState);

      try {
        emitReactionUpsert(
          selectedConversationId,
          messageRef,
          emoji,
          delta,
          idempotencyKey,
          actionSource,
          requestId,
        );
      } catch (error) {
        console.error('Failed to emit reaction_upsert', error);
        rollbackPendingReaction(requestId, 'Failed to emit reaction_upsert');
      }
    },
    [
      applyReactionSummaryToMessage,
      reactionUserStateByMessage,
      registerPendingReaction,
      resolveMessageRef,
      rollbackPendingReaction,
      selectedConversationId,
      updateReactionUserStateCache,
    ],
  );

  const handleReactionRemoveAllMine = useCallback(
    (message: Message) => {
      if (!selectedConversationId) {
        return;
      }

      const messageRef = resolveMessageRef(message);
      const requestId = uuidv4();
      const idempotencyKey = uuidv4();
      const myState = reactionUserStateByMessage[message._id] || message.reactionUserState;

      if (!myState || myState.totalCount <= 0) {
        return;
      }

      const summary = message.reactionSummary || { totalCount: 0, emojiCounts: {} };
      const previousSummary: MessageReactionSummary = {
        totalCount: summary.totalCount,
        emojiCounts: { ...(summary.emojiCounts || {}) },
      };
      const previousUserState: MessageReactionUserState = myState
        ? {
          lastEmoji: myState.lastEmoji,
          totalCount: myState.totalCount,
          emojiCounts: { ...(myState.emojiCounts || {}) },
        }
        : {
          lastEmoji: null,
          totalCount: 0,
          emojiCounts: {},
        };
      const nextEmojiCounts: Record<string, number> = { ...(summary.emojiCounts || {}) };

      Object.entries(myState.emojiCounts).forEach(([emoji, count]) => {
        nextEmojiCounts[emoji] = Math.max(0, (nextEmojiCounts[emoji] || 0) - count);
        if (nextEmojiCounts[emoji] === 0) {
          delete nextEmojiCounts[emoji];
        }
      });

      const nextSummary: MessageReactionSummary = {
        totalCount: Math.max(0, summary.totalCount - myState.totalCount),
        emojiCounts: nextEmojiCounts,
      };

      const clearedUserState: MessageReactionUserState = {
        lastEmoji: null,
        totalCount: 0,
        emojiCounts: {},
      };

      registerPendingReaction({
        requestId,
        messageId: message._id,
        messageRef,
        previousSummary,
        previousUserState,
      });

      applyReactionSummaryToMessage({ messageId: message._id, messageRef }, nextSummary, clearedUserState);
      updateReactionUserStateCache(message._id, messageRef, clearedUserState);

      try {
        emitReactionRemoveAllMine(selectedConversationId, messageRef, idempotencyKey, requestId);
      } catch (error) {
        console.error('Failed to emit reaction_remove_all_mine', error);
        rollbackPendingReaction(requestId, 'Failed to emit reaction_remove_all_mine');
      }
    },
    [
      applyReactionSummaryToMessage,
      reactionUserStateByMessage,
      registerPendingReaction,
      resolveMessageRef,
      rollbackPendingReaction,
      selectedConversationId,
      updateReactionUserStateCache,
    ],
  );

  const handleFetchReactionDetails = useCallback(
    async (message: Message): Promise<ReactionDetailsResponse> => {
      const messageRef = resolveMessageRef(message);
      return getMessageReactionDetails(messageRef);
    },
    [resolveMessageRef],
  );

  const handleExecuteForward = useCallback(async (toConversationId: string) => {
    if (!forwardingMessage) return;

    try {
      setForwardLoading(true);
      
      const idempotencyKey = forwardingMessage.idempotencyKey || uuidv4();

      // Emit forward message
      emitForwardMessage(forwardingMessage._id, toConversationId, idempotencyKey);

      unsetMessages_Status()

      // Comment để chuyển qua conversation khác trước khi server chưa kịp gửi socket về
      // Nếu muốn có loading ở nút thì mới uncomment
      // 700ms là có thể truy vấn được từ database, 500ms nữa là chờ một người trong conversation read
      // await new Promise((resolve) => setTimeout(resolve, 1200))

      updatePreviewConversation({
        ...forwardingMessage,
        conversationId: toConversationId,
        createdAt: new Date().toISOString(),
      })

      setSelectedConversationId(toConversationId)

      setForwardModalOpen(false);
      setForwardingMessage(null);
    } finally {
      setForwardLoading(false);
    }
  }, [forwardingMessage]);

  const selectedConversationRaw = conversations.find((conversation) => conversation._id === selectedConversationId);
  const selectedConversationActiveCall = selectedConversationRaw?.activeCall ?? null;
  const isCallConversationSelected = Boolean(
    selectedConversationRaw && (selectedConversationRaw.type === 'direct' || selectedConversationRaw.type === 'group'),
  );
  const activeCallParticipantNames = activeCall
    ? activeCall.participantIds
      .filter((participantId) => activeCall.isGroupCall || participantId !== userId)
      .map((participantId) => {
        const name = activeCall.participantDisplayNames[participantId] ?? resolvePeerInfo(participantId).displayName;
        return participantId === userId ? `${name} (Bạn)` : name;
      })
    : [];
  const callPeerName = activeCall?.isGroupCall
    ? (selectedConversationRaw?.name ?? 'Nhóm gọi')
    : activeCallParticipantNames[0];

  // Cleanup typing timeout and active calls on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      const currentCall = activeCallRef.current;
      const shouldPreserveIncomingCall = currentCall?.direction === 'incoming';

      if (
        currentCall
        && currentCall.direction !== 'incoming'
        && currentCall.sessionId
        && currentCall.callToken
        && !['ended', 'missed', 'rejected'].includes(currentCall.status)
      ) {
        const socket = getRawSocket();
        if (socket?.connected) {
          socket.emit('call_end', {
            sessionId: currentCall.sessionId,
            callToken: currentCall.callToken,
            reason: 'ended'
          });
        }
      }

      clearCallResetTimerRef.current();
      if (!shouldPreserveIncomingCall) {
        resetCallUiRef.current();
      }

      pendingReactionRequestsRef.current.forEach((pending) => {
        if (pending.ackTimeout) {
          clearTimeout(pending.ackTimeout);
        }
      });
      pendingReactionRequestsRef.current.clear();
    };
  }, []);

  // Refresh notifications
  const refreshNotifications = useCallback(async () => {
    try {
      const [notifRes, unreadNotifCount] = await Promise.all([
        fetchNotifications(undefined, 10),
        fetchUnreadCount(),
      ]);
      const notificationTones = ['bg-[#97a7b8]', 'bg-[#88b3c8]', 'bg-[#1a6f58]', 'bg-[#0f5845]'];
      const dashboardNotifications: DashboardNotificationItem[] = notifRes.notifications.slice(0, 8).map((notif: Notification, idx: number) => ({
        id: notif._id,
        type: notif.type as DashboardNotificationItem['type'],
        title: notif.title,
        body: notif.body,
        timeLabel: formatTimeLabel(notif.createdAt),
        initials: notif.title.substring(0, 2).toUpperCase() || 'NT',
        toneClass: notificationTones[idx % notificationTones.length],
        isRead: notif.read,
        avatarUrl: notif.data?.avatarUrl,
        conversationId: notif.conversationId,
        fromUserId: notif.fromUserId,
        action: notif.data?.action,
        postId: notif.data?.postId,
      }));

      setData(prev => ({
        ...prev,
        notifications: dashboardNotifications,
        unreadNotificationCount: unreadNotifCount,
        stats: prev.stats.map((stat) => (
          stat.id === 'stat-4'
            ? {
              ...stat,
              value: unreadNotifCount.toString().padStart(2, '0'),
              badge: unreadNotifCount > 0 ? unreadNotifCount.toString() : '',
            }
            : stat
        )),
      }));
    } catch (error) {
      console.error('Failed to refresh notifications', error);
    }
  }, []);

  // Đồng bộ khung "Thông báo" ở /home (và dữ liệu dashboard) khi server đẩy new_notification
  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;

    let debounce: ReturnType<typeof setTimeout> | null = null;
    const socket = getSocket(token);
    const onNewNotification = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        debounce = null;
        void refreshNotifications();
      }, 200);
    };

    socket.on('new_notification', onNewNotification);
    return () => {
      if (debounce) clearTimeout(debounce);
      socket.off('new_notification', onNewNotification);
    };
  }, [refreshNotifications]);

  useEffect(() => {
    const onCustomRefresh = () => {
      void refreshNotifications();
    };
    const onVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void refreshNotifications();
      }
    };
    window.addEventListener('zync:focus-refresh-notifications', onCustomRefresh);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('zync:focus-refresh-notifications', onCustomRefresh);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refreshNotifications]);

  return {
    data,
    loading,
    error,
    userId,
    conversations: convertConversationsToListItems(),
    selectedConversationId,
    onSelectConversation: setSelectedConversationId,
    aiCatchupByConversation,
    onRequestAiCatchup: requestAiCatchup,
    onRegenerateAiCatchup: regenerateAiCatchup,
    onToggleAiCatchupSetting: toggleAiCatchupSetting,
    onCreateReminder: createReminderFromAiActionItem,
    searchTargets: searchTargets(),
    onSelectSearchTarget: openConversationFromSearch,
    messages: messageHistory.messages.filter(isVisibleChatMessage),
    messageStatus: combinedMessageStatus,
    messagesLoading: messageHistory.loading,
    messagesHasMore: messageHistory.hasMore,
    aiCatchupDigest: selectedConversationId ? (aiCatchupByConversation[selectedConversationId] ?? null) : null,
    aiCatchupUnreadCount: selectedConversationId ? getConversationUnreadCount(selectedConversationId) : 0,
    aiCatchupEnabled: selectedConversationRaw?.aiPreferences?.catchupEnabled !== false,
    aiCatchupRequesting: selectedConversationId ? Boolean(aiCatchupRequestingByConversation[selectedConversationId]) : false,
    conversationInfo: getSelectedConversationInfo(),
    typingUsers,
    friendsForGroup,
    groupActionLoading,
    onCreateGroup: createGroupConversation,
    onUpdateGroup: updateGroupConversation,
    onAddGroupMembers: addMembersToGroupConversation,
    onUpdateGroupMemberRole: updateGroupMemberRoleConversation,
    onUpdateGroupMemberApproval: updateGroupMemberApprovalConversation,
    onRemoveGroupMember: removeGroupMemberConversation,
    onDisbandGroup: disbandGroupConversation,
    onLeaveGroup: leaveGroupConversation,
    onToggleConversationPin: toggleConversationPin,
    onMuteConversation: muteConversationByDuration,
    onUnmuteConversation: unmuteConversationById,
    isSelectedConversationPinned: pinnedConversationIds.includes(selectedConversationId),
    selectedConversationMutedUntil: selectedConversationId ? (mutedUntilByConversation[selectedConversationId] ?? null) : null,
    onSendMessage: handleSendMessage,
    onCancelPendingMessage: handleCancelPendingMessage,
    onStartTyping: handleStartTyping,
    onStopTyping: handleStopTyping,
    onDeleteMessageForMe: deleteMessageForMe,
    onRecallMessage: recallMessage,
    onForwardMessage: handleForwardMessage,
    onReactionUpsert: handleReactionUpsert,
    onReactionRemoveAllMine: handleReactionRemoveAllMine,
    onFetchReactionDetails: handleFetchReactionDetails,
    reactionUserStateByMessage,
    callStatus: (
      activeCall?.status === 'ringing'
        ? (activeCall.direction === 'incoming' ? 'incoming' : 'outgoing')
        : activeCall?.status ?? 'idle'
    ) as CallUiStatus,
    callPeerName,
    callParticipantNames: activeCallParticipantNames,
    callType: activeCall?.callType ?? 'video',
    isGroupCallActive: activeCall?.isGroupCall ?? false,
    selectedConversationActiveCall,
    callError,
    callFriendError,
    onDismissCallFriendError: () => setCallFriendError(null),
    isMicMuted,
    isCameraEnabled,
    isScreenSharing,
    screenSharingUserId,
    localVideoRef,
    screenShareVideoRef,
    remoteVideoRef,
    remoteParticipantVideos,
    isCallingAvailable: isCallConversationSelected && (!activeCall || ['ended', 'idle', 'rejected', 'missed'].includes(activeCall.status) || activeCall.conversationId === selectedConversationId),
    onStartAudioCall: handleStartAudioCall,
    onStartVideoCall: handleStartVideoCall,
    onAcceptIncomingCall: handleAcceptIncomingCall,
    onRejectIncomingCall: handleRejectIncomingCall,
    onEndCall: handleEndCall,
    onDismissCallUi: handleDismissCallUi,
    onToggleMic: handleToggleMic,
    onToggleCamera: handleToggleCamera,
    onToggleScreenShare: handleToggleScreenShare,
    forwardModalOpen,
    setForwardModalOpen,
    forwardingMessage,
    forwardLoading,
    onCloseForwardModal: () => {
      setForwardModalOpen(false);
      setForwardingMessage(null);
    },
    onExecuteForward: handleExecuteForward,
    onLoadMore: messageHistory.loadMore,
    onRefreshNotifications: refreshNotifications,
    onPatchDashboardUser: (payload: DashboardUserPatch) => {
      setData((prev) => {
        const displayName = payload.displayName ?? prev.user.displayName;
        const nameParts = displayName.trim().split(/\s+/).filter(Boolean);
        const initials = nameParts.length === 0
          ? prev.user.initials
          : nameParts.length === 1
            ? nameParts[0].slice(0, 2).toUpperCase()
            : `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase();

        return {
          ...prev,
          greeting: `Xin chào, ${displayName}`,
          user: {
            ...prev.user,
            displayName,
            initials,
            avatarUrl: payload.avatarUrl ?? prev.user.avatarUrl,
          },
        };
      });
    },
  };
}
