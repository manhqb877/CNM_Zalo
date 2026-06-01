import { MessageType, SenderInMessage } from '@zync/shared-types';
import { io, Socket } from 'socket.io-client';
import Constants from 'expo-constants';
import { getToken } from './auth';
import { refreshAccessToken } from './api';

let SOCKET_URL = 'http://10.0.2.2:3000';
if (process.env.EXPO_PUBLIC_SOCKET_URL) {
  SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL;
} else if (__DEV__ && Constants.expoConfig?.hostUri) {
  const host = Constants.expoConfig.hostUri.split(':')[0];
  SOCKET_URL = `http://${host}:3000`;
}

export { SOCKET_URL };

let socket: Socket | null = null;
let currentToken: string | null = null;
let typingTimeout: NodeJS.Timeout | null = null;
let refreshingSocketToken = false;

type SocketListener = (...args: unknown[]) => void;
const listenerRegistry = new Map<string, Set<SocketListener>>();

function getListenerSet(event: string): Set<SocketListener> {
  let listeners = listenerRegistry.get(event);
  if (!listeners) {
    listeners = new Set<SocketListener>();
    listenerRegistry.set(event, listeners);
  }
  return listeners;
}

function registerListener<T>(event: string, callback: (payload: T) => void): void {
  if (!socket) return;

  const cb = callback as SocketListener;
  const listeners = getListenerSet(event);

  // Ensure no duplicate listener for the same callback reference.
  if (listeners.has(cb)) {
    socket.off(event, cb as never);
  }

  listeners.add(cb);
  socket.on(event, cb as never);
}

function unregisterListener(event: string, callback?: unknown): void {
  if (!socket) {
    listenerRegistry.delete(event);
    return;
  }

  const listeners = listenerRegistry.get(event);
  if (!listeners || listeners.size === 0) {
    if (!callback) {
      socket.off(event);
    }
    return;
  }

  if (callback) {
    const cb = callback as SocketListener;
    socket.off(event, cb as never);
    listeners.delete(cb);
    if (listeners.size === 0) {
      listenerRegistry.delete(event);
    }
    return;
  }

  listeners.forEach((cb) => {
    socket?.off(event, cb as never);
  });
  listenerRegistry.delete(event);
}

function clearAllRegisteredListeners(): void {
  if (!socket) {
    listenerRegistry.clear();
    return;
  }

  listenerRegistry.forEach((listeners, event) => {
    listeners.forEach((cb) => socket?.off(event, cb as never));
  });
  listenerRegistry.clear();
}

async function connect(): Promise<Socket | null> {
  const token = await getToken();
  if (!token) {
    disconnectSocket();
    return null;
  }

  if (socket && currentToken === token) {
    if (socket.disconnected && !socket.active) {
      socket.connect();
    }
    return socket;
  }

  if (socket && currentToken !== token) {
    clearAllRegisteredListeners();
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  currentToken = token;

  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    autoConnect: true,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: Infinity,
  });

  socket.on('connect', () => {
    console.info('[Socket] Connected to server');
    refreshingSocketToken = false;
  });

  socket.on('disconnect', (reason) => {
    console.warn('[Socket] Disconnected from server:', reason);
  });

  socket.on('connect_error', async (error) => {
    const isAuthError = error.message === 'Invalid auth token' || error.message === 'Missing auth token';
    if (!isAuthError || refreshingSocketToken) {
      console.error('[Socket] Connection error:', error);
      return;
    }

    console.warn('[Socket] Auth token expired, refreshing socket session...');
    refreshingSocketToken = true;
    socket?.disconnect();

    const nextToken = await refreshAccessToken();
    if (!nextToken || !socket) {
      disconnectSocket();
      refreshingSocketToken = false;
      return;
    }

    currentToken = nextToken;
    socket.auth = { token: nextToken };
    socket.connect();
  });

  return socket;
}

function disconnectSocket(): void {
  if (!socket) {
    currentToken = null;
    listenerRegistry.clear();
    return;
  }

  clearAllRegisteredListeners();
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
  currentToken = null;
  refreshingSocketToken = false;

  if (typingTimeout) {
    clearTimeout(typingTimeout);
    typingTimeout = null;
  }
}

function getSocket(): Socket | null {
  return socket;
}

function getRawSocket(): Socket | null {
  return socket;
}

function isConnected(): boolean {
  return socket?.connected ?? false;
}

function joinConversation(conversationId: string): void {
  if (!socket?.connected) return;
  socket.emit('join_conversation', { conversationId });
}

function leaveConversation(conversationId: string): void {
  if (!socket?.connected) return;
  socket.emit('leave_conversation', { conversationId });
}

function sendMessage(
  conversationId: string,
  content: string,
  type: MessageType,
  idempotencyKey: string,
  mediaUrl?: string,
  replyTo?: {
    messageRef: string;
    messageId?: string;
    senderId?: string;
    senderDisplayName?: string;
    contentPreview?: string;
    type?: string;
  },
): boolean {
  if (!socket?.connected) {
    return false;
  }

  socket.emit('send_message', {
    conversationId,
    content,
    type,
    mediaUrl,
    idempotencyKey,
    replyToMessageRef: replyTo?.messageRef,
    replyToMessageId: replyTo?.messageId,
    replyToSenderId: replyTo?.senderId,
    replyToSenderDisplayName: replyTo?.senderDisplayName,
    replyToPreview: replyTo?.contentPreview,
    replyToType: replyTo?.type,
  });

  return true;
}

function sendQuickReply(conversationId: string, content: string, idempotencyKey: string): boolean {
  return sendMessage(conversationId, content, 'text', idempotencyKey);
}

function markAsRead(conversationId: string, messageIds: string[]): boolean {
  if (!socket?.connected) {
    return false;
  }

  socket.emit('message_read', { conversationId, messageIds });
  return true;
}

function markAsDelivered(conversationId: string, messageIds: string[]): boolean {
  if (!socket?.connected) {
    return false;
  }

  socket.emit('message_delivered', { conversationId, messageIds });
  return true;
}

function startTyping(conversationId: string): void {
  if (!socket?.connected) return;

  socket.emit('typing_start', { conversationId });

  if (typingTimeout) {
    clearTimeout(typingTimeout);
    typingTimeout = null;
  }
}

function stopTyping(conversationId: string): void {
  if (!socket?.connected) return;

  if (typingTimeout) {
    clearTimeout(typingTimeout);
  }

  typingTimeout = setTimeout(() => {
    socket?.emit('typing_stop', { conversationId });
    typingTimeout = null;
  }, 3000);
}

function clearPendingTyping(conversationId: string): void {
  if (!socket?.connected) return;

  if (typingTimeout) {
    clearTimeout(typingTimeout);
    typingTimeout = null;
  }

  socket.emit('typing_stop', { conversationId });
}

function deleteMessageForMe(conversationId: string, messageId: string, idempotencyKey: string): boolean {
  if (!socket?.connected) {
    return false;
  }

  socket.emit('delete_message_for_me', {
    conversationId,
    messageId,
    idempotencyKey,
  });
  return true;
}

function recallMessage(conversationId: string, messageId: string, idempotencyKey: string): boolean {
  if (!socket?.connected) {
    return false;
  }

  socket.emit('recall_message', {
    conversationId,
    messageId,
    idempotencyKey,
  });
  return true;
}

function emitForwardMessage(originalMessageId: string, toConversationId: string, idempotencyKey: string): boolean {
  if (!socket?.connected) {
    return false;
  }

  socket.emit('forward_message', {
    originalMessageId,
    toConversationId,
    idempotencyKey,
  });

  return true;
}

export interface ReactionUpdatedPayload {
  requestId?: string;
  messageId: string;
  messageRef: string;
  conversationId: string;
  actor: {
    userId: string;
    action: 'upsert' | 'remove_all_mine';
    emoji?: string;
    delta?: 1 | 2 | 3;
  };
  summary: {
    totalCount: number;
    emojiCounts: Record<string, number>;
  };
  userState?: {
    userId: string;
    totalCount: number;
    emojiCounts: Record<string, number>;
    lastEmoji: string | null;
  };
  updatedAt: string;
}

export interface ReactionAckPayload {
  requestId: string;
  accepted: boolean;
  conversationId: string;
  messageRef: string;
  messageId: string | null;
  userId: string;
  action: 'upsert' | 'remove_all_mine';
  optimistic: boolean;
  serverTs: string;
  contractVersion: string;
}

function emitReactionUpsert(
  conversationId: string,
  messageRef: string,
  emoji: string,
  delta: 1 | 2 | 3,
  idempotencyKey: string,
  actionSource: string,
  requestId?: string,
): boolean {
  if (!socket?.connected) {
    return false;
  }

  socket.emit('reaction_upsert', {
    requestId: requestId ?? idempotencyKey,
    conversationId,
    messageRef,
    emoji,
    delta,
    idempotencyKey,
    actionSource,
  });

  return true;
}

function emitReactionRemoveAllMine(
  conversationId: string,
  messageRef: string,
  idempotencyKey: string,
  requestId?: string,
): boolean {
  if (!socket?.connected) {
    return false;
  }

  socket.emit('reaction_remove_all_mine', {
    requestId: requestId ?? idempotencyKey,
    conversationId,
    messageRef,
    idempotencyKey,
  });

  return true;
}

function emitHeartbeat(): void {
  if (!socket?.connected) return;
  socket.emit('heartbeat', { timestamp: Date.now() });
}

// Message events
function listenToMessages(
  callback: (data: {
    messageId: string;
    conversationId?: string;
    senderId: string;
    sender: SenderInMessage;
    content: string;
    type: string;
    mediaUrl?: string;
    moderationWarning?: boolean;
    replyTo?: {
      messageRef: string;
      messageId?: string;
      senderId?: string;
      contentPreview?: string;
      type?: string;
      isDeleted?: boolean;
    };
    idempotencyKey: string;
    createdAt: string;
  }) => void,
): void {
  registerListener('receive_message', callback);
}

function unlistenToMessages(callback?: unknown): void {
  unregisterListener('receive_message', callback);
}

function listenToMessageSent(callback: (data: { messageId?: string; idempotencyKey?: string; createdAt?: string }) => void): void {
  registerListener('message_sent', callback);
}

function unlistenToMessageSent(callback?: unknown): void {
  unregisterListener('message_sent', callback);
}

function listenToStatusUpdates(
  callback: (data: {
    messageIds?: string[];
    messageId?: string;
    idempotencyKeys?: string[];
    conversationId?: string;
    status: 'sent' | 'delivered' | 'read';
    userId: string;
    updatedAt: string;
    reader?: {
      userId: string;
      displayName: string;
      avatarUrl?: string;
      readAt: string;
    };
  }) => void,
): void {
  registerListener('status_update', callback);
}

function unlistenToStatusUpdates(callback?: unknown): void {
  unregisterListener('status_update', callback);
}

function listenToTypingIndicators(
  callback: (data: { userId: string; conversationId: string; isTyping: boolean }) => void,
): void {
  registerListener('typing_indicator', callback);
}

function unlistenToTypingIndicators(callback?: unknown): void {
  unregisterListener('typing_indicator', callback);
}

function listenToMessageDeletion(
  callback: (data: {
    messageId: string;
    conversationId: string;
    deletedAt: string;
  }) => void,
): void {
  registerListener('message_deleted_for_me', callback);
}

function unlistenToMessageDeletion(callback?: unknown): void {
  unregisterListener('message_deleted_for_me', callback);
}

function listenToMessageRecall(
  callback: (data: {
    messageId: string;
    idempotencyKey: string;
    conversationId: string;
    recalledBy: string;
    recalledAt: string;
  }) => void,
): void {
  registerListener('message_recalled', callback);
}

function unlistenToMessageRecall(callback?: unknown): void {
  unregisterListener('message_recalled', callback);
}

function listenToMessageForwarded(
  callback: (data: {
    messageId: string;
    idempotencyKey: string;
    toConversationId: string;
  }) => void,
): void {
  registerListener('message_forwarded', callback);
}

function unlistenToMessageForwarded(callback?: unknown): void {
  unregisterListener('message_forwarded', callback);
}

function listenToGroupUpdated(callback: (data: unknown) => void): void {
  registerListener('group_updated', callback);
}

function unlistenToGroupUpdated(callback?: unknown): void {
  unregisterListener('group_updated', callback);
}

function listenToReactionUpdated(callback: (data: ReactionUpdatedPayload) => void): void {
  registerListener('reaction_updated', callback);
}

function unlistenToReactionUpdated(callback?: unknown): void {
  unregisterListener('reaction_updated', callback);
}

function listenToReactionAck(callback: (data: ReactionAckPayload) => void): void {
  registerListener('reaction_ack', callback);
}

function unlistenToReactionAck(callback?: unknown): void {
  unregisterListener('reaction_ack', callback);
}

function listenToReactionError(
  callback: (data: {
    requestId?: string;
    conversationId?: string;
    messageRef?: string;
    code: string;
    message: string;
    contractVersion?: string;
  }) => void,
): void {
  registerListener('reaction_error', callback);
}

function unlistenToReactionError(callback?: unknown): void {
  unregisterListener('reaction_error', callback);
}

function listenToContentBlocked(callback: (data: any) => void): void {
  registerListener('content_blocked', callback);
}

function unlistenToContentBlocked(callback?: unknown): void {
  unregisterListener('content_blocked', callback);
}

function listenToContentWarning(callback: (data: any) => void): void {
  registerListener('content_warning', callback);
}

function unlistenToContentWarning(callback?: unknown): void {
  unregisterListener('content_warning', callback);
}

function listenToUserPenaltyUpdated(callback: (data: any) => void): void {
  registerListener('user_penalty_updated', callback);
}

function unlistenToUserPenaltyUpdated(callback?: unknown): void {
  unregisterListener('user_penalty_updated', callback);
}

function listenToMessageReacted(callback: (data: any) => void): void {
  registerListener('message_reacted', callback);
}

function unlistenToMessageReacted(callback?: unknown): void {
  unregisterListener('message_reacted', callback);
}

function listenToErrors(callback: (error: { message: string; code?: string }) => void): void {
  registerListener('error', callback);
}

function unlistenToErrors(callback?: unknown): void {
  unregisterListener('error', callback);
}

// Call events
export interface CallInvitedPayload {
  sessionId: string;
  conversationId?: string;
  targetUserId?: string;
  isGroupCall?: boolean;
  participantIds?: string[];
  callType: 'audio' | 'video';
  timeoutAt?: string;
  callToken: string;
  callTokenExpiresInSeconds: number;
}

export interface CallIncomingPayload {
  sessionId: string;
  conversationId?: string;
  fromUserId: string;
  callerName?: string;
  callerAvatarUrl?: string;
  conversationName?: string;
  isGroupCall?: boolean;
  participantIds?: string[];
  callType: 'audio' | 'video';
  timeoutAt?: string;
  callToken: string;
  callTokenExpiresInSeconds: number;
}

export interface CallStatusPayload {
  sessionId: string;
  status: 'ringing' | 'connecting' | 'connected' | 'ended' | 'missed' | 'rejected';
  reason?: string;
}

export interface CallParticipantPayload {
  sessionId: string;
  userId: string;
  reason?: string;
  joinedParticipantIds?: string[];
}

export interface WebRtcOfferPayload {
  sessionId: string;
  fromUserId: string;
  sdp: unknown;
}

export interface WebRtcAnswerPayload {
  sessionId: string;
  fromUserId: string;
  sdp: unknown;
}

export interface WebRtcIceCandidatePayload {
  sessionId: string;
  fromUserId: string;
  candidate: unknown;
}

export interface CallMediaStatePayload {
  sessionId: string;
  userId: string;
  isScreenSharing?: boolean;
  isMicMuted?: boolean;
  isCameraOff?: boolean;
}

function emitCallInvite(targetUserId: string, conversationId?: string, callType: 'audio' | 'video' = 'video'): boolean {
  if (!socket?.connected) {
    return false;
  }

  socket.emit('call_invite', {
    targetUserId,
    conversationId,
    callType,
  });
  return true;
}

function emitCallGroupInvite(conversationId: string, callType: 'audio' | 'video' = 'video'): boolean {
  if (!socket?.connected) {
    return false;
  }

  socket.emit('call_group_invite', {
    conversationId,
    callType,
  });
  return true;
}

function emitCallAccept(sessionId: string, callToken: string): boolean {
  if (!socket?.connected) {
    return false;
  }

  socket.emit('call_accept', { sessionId, callToken });
  return true;
}

function emitCallReject(
  sessionId: string,
  callToken: string,
  reason: 'rejected' | 'busy' = 'rejected',
): boolean {
  if (!socket?.connected) {
    return false;
  }

  socket.emit('call_reject', { sessionId, callToken, reason });
  return true;
}

function emitCallEnd(sessionId: string, callToken: string, reason: string = 'ended'): boolean {
  if (!socket?.connected) {
    return false;
  }

  socket.emit('call_end', { sessionId, callToken, reason });
  return true;
}

function emitWebRtcOffer(
  sessionId: string,
  toUserId: string,
  callToken: string,
  sdp: unknown,
): boolean {
  if (!socket?.connected) {
    return false;
  }

  socket.emit('webrtc_offer', {
    sessionId,
    toUserId,
    callToken,
    sdp,
  });
  return true;
}

function emitWebRtcAnswer(
  sessionId: string,
  toUserId: string,
  callToken: string,
  sdp: unknown,
): boolean {
  if (!socket?.connected) {
    return false;
  }

  socket.emit('webrtc_answer', {
    sessionId,
    toUserId,
    callToken,
    sdp,
  });
  return true;
}

function emitWebRtcIceCandidate(
  sessionId: string,
  toUserId: string,
  callToken: string,
  candidate: unknown,
): boolean {
  if (!socket?.connected) {
    return false;
  }

  socket.emit('webrtc_ice_candidate', {
    sessionId,
    toUserId,
    callToken,
    candidate,
  });
  return true;
}

function emitCallMediaState(
  sessionId: string,
  callToken: string,
  state: { isScreenSharing?: boolean; isMicMuted?: boolean; isCameraOff?: boolean }
): boolean {
  if (!socket?.connected) {
    return false;
  }

  socket.emit('call_media_state', {
    sessionId,
    callToken,
    ...state
  });
  return true;
}

function listenToCallInvited(callback: (data: CallInvitedPayload) => void): void {
  registerListener('call_invited', callback);
}

function unlistenToCallInvited(callback?: unknown): void {
  unregisterListener('call_invited', callback);
}

function listenToCallIncoming(callback: (data: CallIncomingPayload) => void): void {
  registerListener('call_incoming', callback);
}

function unlistenToCallIncoming(callback?: unknown): void {
  unregisterListener('call_incoming', callback);
}

function listenToCallStatus(callback: (data: CallStatusPayload) => void): void {
  registerListener('call_status', callback);
}

function unlistenToCallStatus(callback?: unknown): void {
  unregisterListener('call_status', callback);
}

function listenToCallParticipantJoined(callback: (data: CallParticipantPayload) => void): void {
  registerListener('call_participant_joined', callback);
}

function unlistenToCallParticipantJoined(callback?: unknown): void {
  unregisterListener('call_participant_joined', callback);
}

function listenToCallParticipantLeft(callback: (data: CallParticipantPayload) => void): void {
  registerListener('call_participant_left', callback);
}

function unlistenToCallParticipantLeft(callback?: unknown): void {
  unregisterListener('call_participant_left', callback);
}

function listenToWebRtcOffer(callback: (data: WebRtcOfferPayload) => void): void {
  registerListener('webrtc_offer', callback);
}

function unlistenToWebRtcOffer(callback?: unknown): void {
  unregisterListener('webrtc_offer', callback);
}

function listenToWebRtcAnswer(callback: (data: WebRtcAnswerPayload) => void): void {
  registerListener('webrtc_answer', callback);
}

function unlistenToWebRtcAnswer(callback?: unknown): void {
  unregisterListener('webrtc_answer', callback);
}

function listenToWebRtcIceCandidate(callback: (data: WebRtcIceCandidatePayload) => void): void {
  registerListener('webrtc_ice_candidate', callback);
}

function unlistenToWebRtcIceCandidate(callback?: unknown): void {
  unregisterListener('webrtc_ice_candidate', callback);
}

function listenToCallMediaState(callback: (data: CallMediaStatePayload) => void): void {
  registerListener('call_media_state', callback);
}

function unlistenToCallMediaState(callback?: unknown): void {
  unregisterListener('call_media_state', callback);
}


export const socketService = {
  connect,
  disconnect: disconnectSocket,
  disconnectSocket,
  getSocket,
  getRawSocket,
  isConnected,
  joinConversation,
  leaveConversation,
  sendMessage,
  sendQuickReply,
  markAsRead,
  markAsDelivered,
  startTyping,
  stopTyping,
  clearPendingTyping,
  deleteMessageForMe,
  recallMessage,
  emitForwardMessage,
  emitReactionUpsert,
  emitReactionRemoveAllMine,
  emitHeartbeat,
  listenToMessages,
  unlistenToMessages,
  listenToMessageSent,
  unlistenToMessageSent,
  listenToStatusUpdates,
  unlistenToStatusUpdates,
  listenToTypingIndicators,
  unlistenToTypingIndicators,
  listenToMessageDeletion,
  unlistenToMessageDeletion,
  listenToMessageRecall,
  unlistenToMessageRecall,
  listenToMessageForwarded,
  unlistenToMessageForwarded,
  listenToGroupUpdated,
  unlistenToGroupUpdated,
  listenToReactionUpdated,
  unlistenToReactionUpdated,
  listenToReactionAck,
  unlistenToReactionAck,
  listenToReactionError,
  unlistenToReactionError,
  listenToContentBlocked,
  unlistenToContentBlocked,
  listenToContentWarning,
  unlistenToContentWarning,
  listenToUserPenaltyUpdated,
  unlistenToUserPenaltyUpdated,
  listenToMessageReacted,
  unlistenToMessageReacted,
  listenToErrors,
  unlistenToErrors,
  emitCallInvite,
  emitCallGroupInvite,
  emitCallAccept,
  emitCallReject,
  emitCallEnd,
  emitWebRtcOffer,
  emitWebRtcAnswer,
  emitWebRtcIceCandidate,
  emitCallMediaState,
  listenToCallInvited,
  unlistenToCallInvited,
  listenToCallIncoming,
  unlistenToCallIncoming,
  listenToCallStatus,
  unlistenToCallStatus,
  listenToCallParticipantJoined,
  unlistenToCallParticipantJoined,
  listenToCallParticipantLeft,
  unlistenToCallParticipantLeft,
  listenToWebRtcOffer,
  unlistenToWebRtcOffer,
  listenToWebRtcAnswer,
  unlistenToWebRtcAnswer,
  listenToWebRtcIceCandidate,
  unlistenToWebRtcIceCandidate,
  listenToCallMediaState,
  unlistenToCallMediaState,
};

export default socketService;
