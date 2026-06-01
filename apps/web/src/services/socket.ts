import { type AiCatchupDigestUpdatedPayload, type AiAssistantItemPayload, type AiReminderUpdatedPayload, type CallHistory, MessageType, SenderInMessage } from '@zync/shared-types';
import { io, type Socket } from 'socket.io-client';
import Cookies from 'js-cookie';
import { callStore } from '@/stores/call-store';

let socket: Socket | null = null;
let currentToken: string | null = null;
const listenerRegistry = new Map<string, unknown>();
let heartbeatTimer: NodeJS.Timeout | null = null;

const ACCESS_TOKEN_COOKIE_KEY = 'accessToken';
const HEARTBEAT_INTERVAL_MS = 50_000;

function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function startHeartbeat(targetSocket: Socket): void {
  stopHeartbeat();

  // Emit immediately so server refreshes presence right after connect/reconnect.
  targetSocket.emit('heartbeat');
  heartbeatTimer = setInterval(() => {
    targetSocket.emit('heartbeat');
  }, HEARTBEAT_INTERVAL_MS);
}

function getTokenFromCookie(): string | null {
  if (typeof window === 'undefined') return null;
  return Cookies.get(ACCESS_TOKEN_COOKIE_KEY) ?? null;
}

function resolveWebSocketUrl(): string {
  const explicitUrl = process.env['NEXT_PUBLIC_WS_URL'];
  if (explicitUrl && typeof window === 'undefined') {
    return explicitUrl;
  }

  if (typeof window !== 'undefined') {
    if (explicitUrl) {
      try {
        const explicit = new URL(explicitUrl);
        const currentHost = window.location.hostname;
        const isExplicitLocal = explicit.hostname === 'localhost' || explicit.hostname === '127.0.0.1';
        const isCurrentLocal = currentHost === 'localhost' || currentHost === '127.0.0.1';

        if (!isExplicitLocal || isCurrentLocal) {
          return explicitUrl;
        }

        const protocol = explicit.protocol === 'wss:' ? 'wss:' : 'ws:';
        const port = explicit.port || '3000';
        return `${protocol}//${currentHost}:${port}`;
      } catch {
        return explicitUrl;
      }
    }

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProtocol}//${window.location.hostname}:3000`;
  }

  return 'ws://localhost:3000';
}

/**
 * Task 10.1: Initialize Socket.IO client with JWT auth
 * Auto-reconnect with exponential backoff
 *
 * IMPORTANT: Returns existing socket if one already exists (even if still
 * connecting). Only creates a new socket when there is no instance at all
 * or when the token has changed (re-login).
 */
export function getSocket(token?: string): Socket {
  const resolvedToken = token ?? getTokenFromCookie();
  if (!resolvedToken) {
    throw new Error('No access token available. Please log in.');
  }

  // Return existing socket if it exists and token hasn't changed
  if (socket && currentToken === resolvedToken) {
    // If disconnected but instance exists, reconnect instead of creating new
    if (socket.disconnected && !socket.active) {
      socket.connect();
    } else if (socket.connected) {
      startHeartbeat(socket);
    }
    return socket;
  }

  // Token changed (re-login) – disconnect old socket first
  if (socket && currentToken !== resolvedToken) {
    stopHeartbeat();
    listenerRegistry.clear();
    callStore.setActiveCall(null);
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  currentToken = resolvedToken;

  socket = io(resolveWebSocketUrl(), {
    auth: { token: resolvedToken },
    transports: ['websocket', 'polling'],
    autoConnect: true,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: Infinity,
  });

  socket.on('connect', () => {
    startHeartbeat(socket as Socket);
    console.info('[Socket] Connected to server');
  });

  // Auto-reconnect on disconnect
  socket.on('disconnect', (reason) => {
    stopHeartbeat();
    console.warn('[Socket] Disconnected from server:', reason);
  });

  socket.on('connect_error', (error) => {
    console.error('[Socket] Connection error:', error);
  });

  return socket;
}

/**
 * Get the raw socket instance if it exists (for listener registration).
 * Does NOT throw — returns null when socket hasn't been initialised yet.
 */
export function getRawSocket(): Socket | null {
  return socket;
}

export function isConnected(): boolean {
  return socket?.connected ?? false;
}

export function disconnectSocket(): void {
  if (socket) {
    stopHeartbeat();
    callStore.setActiveCall(null);
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
    currentToken = null;
    listenerRegistry.clear();
  }
}

/**
 * Update the socket's auth token after a token refresh.
 * This ensures that socket reconnections use the new access token
 * instead of the expired old one stored in memory.
 */
export function updateSocketToken(newToken: string): void {
  if (!socket || !newToken) return;

  currentToken = newToken;
  (socket.auth as Record<string, string>).token = newToken;

  // If socket is disconnected, reconnect with the new token
  if (socket.disconnected && !socket.active) {
    socket.connect();
  }
}

export function joinConversation(conversationId: string): void {
  if (!socket) return;

  socket.emit('join_conversation', { conversationId });
}

export function leaveConversation(conversationId: string): void {
  if (!socket) return;

  socket.emit('leave_conversation', { conversationId });
}

// ─── Message Events ───

/**
 * Send message via Socket.IO
 * @param conversationId Conversation ID
 * @param content Message content
 * @param type Message type (text, image, video, emoji)
 * @param idempotencyKey UUID for idempotency
 * @param mediaUrl Optional media URL (for image/video)
 */
export function sendMessage(
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
): void {
  if (!socket) {
    throw new Error('Socket not initialized');
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
}

/**
 * Listen to incoming messages from other users
 * @param callback Handler for new messages
 */
export function listenToMessages(
  callback: (data: {
    messageId: string;
    conversationId?: string;
    senderId: string;
    sender: SenderInMessage;
    content: string;
    type: string;
    mediaUrl?: string;
    callHistory?: CallHistory;
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
  if (!socket) {
    console.warn('[Socket] listenToMessages called before socket init – skipping');
    return;
  }

  const event = 'receive_message';
  listenerRegistry.delete(event);
  listenerRegistry.set(event, callback as (...args: unknown[]) => void);
  socket.off(event);
  socket.on(event, callback);
}

/**
 * Stop listening to messages
 * @param cb Optional specific callback to remove. If not provided, removes the last registered callback.
 */
export function unlistenToMessages(cb?: unknown): void {
  if (!socket) return;

  const event = 'receive_message';
  const registeredCb = listenerRegistry.get(event) as ((...args: unknown[]) => void) | undefined;
  const toRemove = cb ?? registeredCb;
  if (toRemove) {
    socket.off(event, toRemove as any);
  } else {
    socket.off(event);
  }
  listenerRegistry.delete(event);
}

// ─── Message Status Events ───

/**
 * Mark multiple messages as read
 * @param conversationId Conversation ID
 * @param messageIds Array of message IDs to mark as read
 */
export function markAsRead(conversationId: string, messageIds: string[]): void {
  if (!socket) {
    throw new Error('Socket not initialized');
  }

  socket.emit('message_read', {
    conversationId,
    messageIds,
  });
}

/**
 * Mark messages as delivered
 * @param conversationId Conversation ID
 * @param messageIds Array of message IDs to mark as delivered
 */
export function markAsDelivered(conversationId: string, messageIds: string[]): void {
  if (!socket) {
    throw new Error('Socket not initialized');
  }

  socket.emit('message_delivered', {
    conversationId,
    messageIds,
  });
}

/**
 * Listen to message status updates (sent, delivered, read)
 * @param callback Handler for status updates
 */
export function listenToStatusUpdates(
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
  if (!socket) {
    console.warn('[Socket] listenToStatusUpdates called before socket init – skipping');
    return;
  }

  const event = 'status_update';
  listenerRegistry.delete(event);
  listenerRegistry.set(event, callback as (...args: unknown[]) => void);
  socket.off(event);
  socket.on(event, (data) => callback(data));
}

/**
 * Stop listening to status updates
 * @param cb Optional specific callback to remove. If not provided, removes the last registered callback.
 */
export function unlistenToStatusUpdates(cb?: unknown): void {
  if (!socket) return;

  const event = 'status_update';
  const registeredCb = listenerRegistry.get(event) as ((...args: unknown[]) => void) | undefined;
  const toRemove = cb ?? registeredCb;
  if (toRemove) {
    socket.off(event, toRemove as any);
  } else {
    socket.off(event);
  }
  listenerRegistry.delete(event);
}

// ─── Typing Indicator Events ───

let typingTimeout: NodeJS.Timeout | null = null;

/**
 * Emit typing start event (with 3s debounce)
 * @param conversationId Conversation ID
 */
export function startTyping(conversationId: string): void {
  if (!socket) return;

  socket.emit('typing_start', { conversationId });

  // Debounce: clear pending stop event
  if (typingTimeout) {
    clearTimeout(typingTimeout);
  }
}

/**
 * Emit typing stop event (with 3s debounce)
 * @param conversationId Conversation ID
 */
export function stopTyping(conversationId: string): void {
  if (!socket) return;

  // Debounce: wait 3s before sending stop
  typingTimeout = setTimeout(() => {
    socket?.emit('typing_stop', { conversationId });
    typingTimeout = null;
  }, 3000);
}

/**
 * Clear pending typing indicator immediately (e.g., when message is sent)
 * Don't wait for 3s debounce - emit typing_stop right away
 * @param conversationId Conversation ID
 */
export function clearPendingTyping(conversationId: string): void {
  if (!socket) return;

  // Clear timeout if pending
  if (typingTimeout) {
    clearTimeout(typingTimeout);
    typingTimeout = null;
  }

  // Emit typing_stop immediately (don't wait 3s)
  socket.emit('typing_stop', { conversationId });
}

/**
 * Listen to typing indicators from other users
 * @param callback Handler for typing indicator updates
 */
export function listenToTypingIndicators(
  callback: (data: {
    userId: string;
    conversationId: string;
    isTyping: boolean;
  }) => void,
): void {
  if (!socket) {
    console.warn('[Socket] listenToTypingIndicators called before socket init – skipping');
    return;
  }

  const event = 'typing_indicator';
  listenerRegistry.delete(event);
  listenerRegistry.set(event, callback as (...args: unknown[]) => void);
  socket.off(event);
  socket.on(event, callback);
}

/**
 * Stop listening to typing indicators
 * @param cb Optional specific callback to remove. If not provided, removes the last registered callback.
 */
export function unlistenToTypingIndicators(cb?: unknown): void {
  if (!socket) return;

  const event = 'typing_indicator';
  const registeredCb = listenerRegistry.get(event) as ((...args: unknown[]) => void) | undefined;
  const toRemove = cb ?? registeredCb;
  if (toRemove) {
    socket.off(event, toRemove as any);
  } else {
    socket.off(event);
  }
  listenerRegistry.delete(event);
}

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
  candidate: RTCIceCandidateInit;
}

export interface CallMediaStatePayload {
  sessionId: string;
  userId: string;
  isScreenSharing: boolean;
}

export function emitCallInvite(targetUserId: string, conversationId?: string, callType: 'audio' | 'video' = 'video'): void {
  if (!socket?.connected) {
    throw new Error('Socket not connected');
  }

  socket.emit('call_invite', {
    targetUserId,
    conversationId,
    callType,
  });
}

export function emitCallGroupInvite(conversationId: string, callType: 'audio' | 'video' = 'video'): void {
  if (!socket?.connected) {
    throw new Error('Socket not connected');
  }

  socket.emit('call_group_invite', {
    conversationId,
    callType,
  });
}

export function emitCallAccept(sessionId: string, callToken: string): void {
  if (!socket?.connected) {
    throw new Error('Socket not connected');
  }

  socket.emit('call_accept', { sessionId, callToken });
}

export function emitCallReject(
  sessionId: string,
  callToken: string,
  reason: 'rejected' | 'busy' = 'rejected',
): void {
  if (!socket) throw new Error('Socket not initialized');

  socket.emit('call_reject', { sessionId, callToken, reason });
}

export function emitCallEnd(sessionId: string, callToken: string, reason: string = 'ended'): void {
  if (!socket?.connected) {
    throw new Error('Socket not connected');
  }

  socket.emit('call_end', { sessionId, callToken, reason });
}

export function emitWebRtcOffer(
  sessionId: string,
  toUserId: string,
  callToken: string,
  sdp: unknown,
): void {
  if (!socket?.connected) {
    throw new Error('Socket not connected');
  }

  socket.emit('webrtc_offer', {
    sessionId,
    toUserId,
    callToken,
    sdp,
  });
}

export function emitWebRtcAnswer(
  sessionId: string,
  toUserId: string,
  callToken: string,
  sdp: unknown,
): void {
  if (!socket?.connected) {
    throw new Error('Socket not connected');
  }

  socket.emit('webrtc_answer', {
    sessionId,
    toUserId,
    callToken,
    sdp,
  });
}

export function emitWebRtcIceCandidate(
  sessionId: string,
  toUserId: string,
  callToken: string,
  candidate: RTCIceCandidateInit,
): void {
  if (!socket?.connected) {
    throw new Error('Socket not connected');
  }

  socket.emit('webrtc_ice_candidate', {
    sessionId,
    toUserId,
    callToken,
    candidate,
  });
}

export function emitCallMediaState(
  sessionId: string,
  callToken: string,
  state: { isScreenSharing?: boolean },
): void {
  if (!socket?.connected) {
    throw new Error('Socket not connected');
  }

  socket.emit('call_media_state', {
    sessionId,
    callToken,
    ...state,
  });
}

export function listenToCallInvited(callback: (data: CallInvitedPayload) => void): void {
  if (!socket) {
    return;
  }

  const event = 'call_invited';
  socket.on(event, callback);
}

export function unlistenToCallInvited(cb?: unknown): void {
  if (!socket) return;

  const event = 'call_invited';
  if (cb) socket.off(event, cb as any);
}

export function listenToCallIncoming(callback: (data: CallIncomingPayload) => void): void {
  if (!socket) {
    return;
  }

  const event = 'call_incoming';
  socket.on(event, callback);
}

export function unlistenToCallIncoming(cb?: unknown): void {
  if (!socket) return;

  const event = 'call_incoming';
  if (cb) socket.off(event, cb as any);
}

export function listenToCallStatus(callback: (data: CallStatusPayload) => void): void {
  if (!socket) {
    return;
  }

  const event = 'call_status';
  socket.on(event, callback);
}

export function unlistenToCallStatus(cb?: unknown): void {
  if (!socket) return;

  const event = 'call_status';
  if (cb) socket.off(event, cb as any);
}

export function listenToCallParticipantJoined(callback: (data: CallParticipantPayload) => void): void {
  if (!socket) {
    return;
  }

  const event = 'call_participant_joined';
  socket.on(event, callback);
}

export function unlistenToCallParticipantJoined(cb?: unknown): void {
  if (!socket) return;

  const event = 'call_participant_joined';
  if (cb) socket.off(event, cb as any);
}

export function listenToCallParticipantLeft(callback: (data: CallParticipantPayload) => void): void {
  if (!socket) {
    return;
  }

  const event = 'call_participant_left';
  socket.on(event, callback);
}

export function unlistenToCallParticipantLeft(cb?: unknown): void {
  if (!socket) return;

  const event = 'call_participant_left';
  if (cb) socket.off(event, cb as any);
}

export function listenToWebRtcOffer(callback: (data: WebRtcOfferPayload) => void): void {
  if (!socket) {
    return;
  }

  const event = 'webrtc_offer';
  socket.on(event, callback);
}

export function unlistenToWebRtcOffer(cb?: unknown): void {
  if (!socket) return;

  const event = 'webrtc_offer';
  if (cb) socket.off(event, cb as any);
}

export function listenToWebRtcAnswer(callback: (data: WebRtcAnswerPayload) => void): void {
  if (!socket) {
    return;
  }

  const event = 'webrtc_answer';
  socket.on(event, callback);
}

export function unlistenToWebRtcAnswer(cb?: unknown): void {
  if (!socket) return;

  const event = 'webrtc_answer';
  if (cb) socket.off(event, cb as any);
}

export function listenToWebRtcIceCandidate(callback: (data: WebRtcIceCandidatePayload) => void): void {
  if (!socket) {
    return;
  }

  const event = 'webrtc_ice_candidate';
  socket.on(event, callback);
}

export function unlistenToWebRtcIceCandidate(cb?: unknown): void {
  if (!socket) return;

  const event = 'webrtc_ice_candidate';
  if (cb) socket.off(event, cb as any);
}

export function listenToCallMediaState(callback: (data: CallMediaStatePayload) => void): void {
  if (!socket) {
    return;
  }

  const event = 'call_media_state';
  socket.on(event, callback);
}

export function unlistenToCallMediaState(cb?: unknown): void {
  if (!socket) return;

  const event = 'call_media_state';
  if (cb) socket.off(event, cb as any);
}

// ─── Delete & Recall Events ───

/**
 * Delete message for sender only
 * @param conversationId Conversation ID
 * @param messageId Message ID to delete
 */
export function deleteMessageForMe(
  conversationId: string,
  messageId: string,
  idempotencyKey: string,
): void {
  if (!socket?.connected) {
    throw new Error('Socket not connected');
  }

  socket.emit('delete_message_for_me', {
    conversationId,
    messageId,
    idempotencyKey,
  });
}

/**
 * Recall message (delete everywhere)
 * @param conversationId Conversation ID
 * @param messageId Message ID to recall
 */
export function recallMessage(
  conversationId: string,
  messageId: string,
  idempotencyKey: string,
): void {
  if (!socket?.connected) {
    throw new Error('Socket not connected');
  }

  socket.emit('recall_message', {
    conversationId,
    messageId,
    idempotencyKey,
  });
}

/**
 * Listen to message deletion events (for me only)
 * @param callback Handler for deletion
 */
export function listenToMessageDeletion(
  callback: (data: {
    messageId: string;
    conversationId: string;
    deletedAt: string;
    effectiveLastMessage?: {
      content: string;
      senderId: string;
      sentAt: string;
    } | null;
    unreadCount?: number;
    lastVisibleMessage?: {
      content: string;
      senderId: string;
      senderDisplayName?: string;
      sentAt: string;
    } | null;
  }) => void,
): void {
  if (!socket) {
    console.warn('[Socket] listenToMessageDeletion called before socket init – skipping');
    return;
  }

  const event = 'message_deleted_for_me';
  listenerRegistry.delete(event);
  listenerRegistry.set(event, callback as (...args: unknown[]) => void);
  socket.off(event);
  socket.on(event, callback);
}

/**
 * Stop listening to message deletion events
 * @param cb Optional specific callback to remove. If not provided, removes the last registered callback.
 */
export function unlistenToMessageDeletion(cb?: unknown): void {
  if (!socket) return;

  const event = 'message_deleted_for_me';
  const registeredCb = listenerRegistry.get(event) as ((...args: unknown[]) => void) | undefined;
  const toRemove = cb ?? registeredCb;
  if (toRemove) {
    socket.off(event, toRemove as any);
  } else {
    socket.off(event);
  }
  listenerRegistry.delete(event);
}

/**
 * Listen to message recall events (for everyone)
 * @param callback Handler for recall
 */
export function listenToMessageRecall(
  callback: (data: {
    messageId: string;
    idempotencyKey: string;
    conversationId: string;
    recalledBy: string;
    recalledAt: string;
    conversationLastMessage?: {
      content: string;
      senderId: string;
      sentAt: string;
    } | null;
  }) => void,
): void {
  if (!socket) {
    console.warn('[Socket] listenToMessageRecall called before socket init – skipping');
    return;
  }

  const event = 'message_recalled';
  listenerRegistry.delete(event);
  listenerRegistry.set(event, callback as (...args: unknown[]) => void);
  socket.off(event);
  socket.on(event, callback);
}

/**
 * Stop listening to message recall events
 * @param cb Optional specific callback to remove. If not provided, removes the last registered callback.
 */
export function unlistenToMessageRecall(cb?: unknown): void {
  if (!socket) return;

  const event = 'message_recalled';
  const registeredCb = listenerRegistry.get(event) as ((...args: unknown[]) => void) | undefined;
  const toRemove = cb ?? registeredCb;
  if (toRemove) {
    socket.off(event, toRemove as any);
  } else {
    socket.off(event);
  }
  listenerRegistry.delete(event);
}

// ─── Reactions ───

export function listenToMessageReacted(callback: (data: any) => void): void {
  if (!socket) return;

  const event = 'message_reacted';
  listenerRegistry.delete(event);
  listenerRegistry.set(event, callback as (...args: unknown[]) => void);
  socket.off(event);
  socket.on(event, callback);
}

export function unlistenToMessageReacted(cb?: unknown): void {
  if (!socket) return;

  const event = 'message_reacted';
  const registeredCb = listenerRegistry.get(event) as ((...args: unknown[]) => void) | undefined;
  const toRemove = cb ?? registeredCb;
  if (toRemove) {
    socket.off(event, toRemove as any);
  } else {
    socket.off(event);
  }
  listenerRegistry.delete(event);
}

// ─── Forward Message ───

/**
 * Emit forward message event
 * @param originalMessageId Message ID to forward
 * @param toConversationId Target conversation
 * @param idempotencyKey Unique key for idempotency
 */
export function listenToAiCatchupDigestUpdated(
  callback: (data: AiCatchupDigestUpdatedPayload) => void,
): void {
  if (!socket) return;

  const event = 'ai_catchup_digest_updated';
  listenerRegistry.delete(event);
  listenerRegistry.set(event, callback as (...args: unknown[]) => void);
  socket.off(event);
  socket.on(event, callback);
}

export function unlistenToAiCatchupDigestUpdated(cb?: unknown): void {
  if (!socket) return;

  const event = 'ai_catchup_digest_updated';
  const registeredCb = listenerRegistry.get(event) as ((...args: unknown[]) => void) | undefined;
  const toRemove = cb ?? registeredCb;
  if (toRemove) {
    socket.off(event, toRemove as any);
  } else {
    socket.off(event);
  }
  listenerRegistry.delete(event);
}

export function listenToAiAssistantItemUpdated(
  callback: (data: AiAssistantItemPayload) => void,
): void {
  if (!socket) return;

  const event = 'ai_assistant_item_updated';
  listenerRegistry.delete(event);
  listenerRegistry.set(event, callback as (...args: unknown[]) => void);
  socket.off(event);
  socket.on(event, callback);
}

export function unlistenToAiAssistantItemUpdated(cb?: unknown): void {
  if (!socket) return;

  const event = 'ai_assistant_item_updated';
  const registeredCb = listenerRegistry.get(event) as ((...args: unknown[]) => void) | undefined;
  const toRemove = cb ?? registeredCb;
  if (toRemove) {
    socket.off(event, toRemove as any);
  } else {
    socket.off(event);
  }
  listenerRegistry.delete(event);
}

export function listenToAiReminderUpdated(
  callback: (data: AiReminderUpdatedPayload) => void,
): void {
  if (!socket) return;

  const event = 'ai_reminder_updated';
  listenerRegistry.delete(event);
  listenerRegistry.set(event, callback as (...args: unknown[]) => void);
  socket.off(event);
  socket.on(event, callback);
}

export function unlistenToAiReminderUpdated(cb?: unknown): void {
  if (!socket) return;

  const event = 'ai_reminder_updated';
  const registeredCb = listenerRegistry.get(event) as ((...args: unknown[]) => void) | undefined;
  const toRemove = cb ?? registeredCb;
  if (toRemove) {
    socket.off(event, toRemove as any);
  } else {
    socket.off(event);
  }
  listenerRegistry.delete(event);
}

export function emitForwardMessage(
  originalMessageId: string,
  toConversationId: string,
  idempotencyKey: string,
): void {
  if (!socket?.connected) {
    console.error('[Socket] Not connected to emit forward_message');
    return;
  }

  socket.emit('forward_message', {
    originalMessageId,
    toConversationId,
    idempotencyKey,
  });
}

/**
 * Listen to message forwarded confirmation
 * Server emits this after successfully forwarding
 */
export function listenToMessageForwarded(
  callback: (data: {
    messageId: string;
    idempotencyKey: string;
    toConversationId: string;
  }) => void,
): void {
  if (!socket) {
    return;
  }

  const event = 'message_forwarded';
  listenerRegistry.delete(event);
  listenerRegistry.set(event, callback as (...args: unknown[]) => void);
  socket.off(event);
  socket.on(event, callback);
}

/**
 * Stop listening to message forwarded events
 * @param cb Optional specific callback to remove. If not provided, removes the last registered callback.
 */
export function unlistenToMessageForwarded(cb?: unknown): void {
  if (!socket) return;

  const event = 'message_forwarded';
  const registeredCb = listenerRegistry.get(event) as ((...args: unknown[]) => void) | undefined;
  const toRemove = cb ?? registeredCb;
  if (toRemove) {
    socket.off(event, toRemove as any);
  } else {
    socket.off(event);
  }
  listenerRegistry.delete(event);
}

// ─── Message Reactions ───

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

export function emitReactionUpsert(
  conversationId: string,
  messageRef: string,
  emoji: string,
  delta: 1 | 2 | 3,
  idempotencyKey: string,
  actionSource: string,
  requestId?: string,
): void {
  if (!socket?.connected) {
    throw new Error('Socket not connected');
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
}

export function emitReactionRemoveAllMine(
  conversationId: string,
  messageRef: string,
  idempotencyKey: string,
  requestId?: string,
): void {
  if (!socket?.connected) {
    throw new Error('Socket not connected');
  }

  socket.emit('reaction_remove_all_mine', {
    requestId: requestId ?? idempotencyKey,
    conversationId,
    messageRef,
    idempotencyKey,
  });
}

export function listenToReactionUpdated(
  callback: (data: ReactionUpdatedPayload) => void,
): void {
  if (!socket) {
    return;
  }

  const event = 'reaction_updated';
  listenerRegistry.delete(event);
  listenerRegistry.set(event, callback as (...args: unknown[]) => void);
  socket.off(event);
  socket.on(event, callback);
}

export function unlistenToReactionUpdated(cb?: unknown): void {
  if (!socket) return;

  const event = 'reaction_updated';
  const registeredCb = listenerRegistry.get(event) as ((...args: unknown[]) => void) | undefined;
  const toRemove = cb ?? registeredCb;
  if (toRemove) {
    socket.off(event, toRemove as any);
  } else {
    socket.off(event);
  }
  listenerRegistry.delete(event);
}

export function listenToReactionAck(
  callback: (data: ReactionAckPayload) => void,
): void {
  if (!socket) {
    return;
  }

  const event = 'reaction_ack';
  listenerRegistry.delete(event);
  listenerRegistry.set(event, callback as (...args: unknown[]) => void);
  socket.off(event);
  socket.on(event, callback);
}

export function unlistenToReactionAck(cb?: unknown): void {
  if (!socket) return;

  const event = 'reaction_ack';
  const registeredCb = listenerRegistry.get(event) as ((...args: unknown[]) => void) | undefined;
  const toRemove = cb ?? registeredCb;
  if (toRemove) {
    socket.off(event, toRemove as any);
  } else {
    socket.off(event);
  }
  listenerRegistry.delete(event);
}

export function listenToReactionError(
  callback: (data: {
    requestId?: string;
    conversationId?: string;
    messageRef?: string;
    code: string;
    message: string;
    contractVersion?: string;
  }) => void,
): void {
  if (!socket) {
    return;
  }

  const event = 'reaction_error';
  listenerRegistry.delete(event);
  listenerRegistry.set(event, callback as (...args: unknown[]) => void);
  socket.off(event);
  socket.on(event, callback);
}

export function unlistenToReactionError(cb?: unknown): void {
  if (!socket) return;

  const event = 'reaction_error';
  const registeredCb = listenerRegistry.get(event) as ((...args: unknown[]) => void) | undefined;
  const toRemove = cb ?? registeredCb;
  if (toRemove) {
    socket.off(event, toRemove as any);
  } else {
    socket.off(event);
  }
  listenerRegistry.delete(event);
}

// ─── Quick Reply (cross-conversation send without joining room) ───

export function sendQuickReply(
  conversationId: string,
  content: string,
  idempotencyKey: string,
): void {
  if (!socket?.connected) {
    throw new Error('Socket not connected');
  }

  socket.emit('send_message', {
    conversationId,
    content,
    type: 'text',
    idempotencyKey,
  });
}

// ─── Error Events ───

/**
 * Listen to socket errors
 * @param callback Handler for errors
 */
export function listenToErrors(callback: (error: { message: string; code?: string }) => void): void {
  if (!socket) {
    console.warn('[Socket] listenToErrors called before socket init – skipping');
    return;
  }

  const event = 'error';
  listenerRegistry.delete(event);
  listenerRegistry.set(event, callback as (...args: unknown[]) => void);
  socket.off(event);
  socket.on(event, callback);
}

/**
 * Stop listening to errors
 * @param cb Optional specific callback to remove. If not provided, removes the last registered callback.
 */
export function unlistenToErrors(cb?: unknown): void {
  if (!socket) return;

  const event = 'error';
  const registeredCb = listenerRegistry.get(event) as ((...args: unknown[]) => void) | undefined;
  const toRemove = cb ?? registeredCb;
  if (toRemove) {
    socket.off(event, toRemove as any);
  } else {
    socket.off(event);
  }
  listenerRegistry.delete(event);
}

// ─── Socket Service Object (for bundled injection) ───

/**
 * Bundled socket service for dependency injection
 * Usage: socketService.sendMessage(...), socketService.listenToMessages(...)
 */
export const socketService = {
  getSocket,
  getRawSocket,
  isConnected,
  disconnectSocket,
  joinConversation,
  leaveConversation,
  sendMessage,
  listenToMessages,
  unlistenToMessages,
  markAsRead,
  markAsDelivered,
  listenToStatusUpdates,
  unlistenToStatusUpdates,
  startTyping,
  stopTyping,
  clearPendingTyping,
  listenToTypingIndicators,
  unlistenToTypingIndicators,
  emitCallInvite,
  emitCallGroupInvite,
  emitCallAccept,
  emitCallReject,
  emitCallEnd,
  emitWebRtcOffer,
  emitWebRtcAnswer,
  emitWebRtcIceCandidate,
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
  deleteMessageForMe,
  recallMessage,
  listenToMessageDeletion,
  unlistenToMessageDeletion,
  listenToMessageRecall,
  unlistenToMessageRecall,
  emitReactionUpsert,
  emitReactionRemoveAllMine,
  listenToReactionUpdated,
  unlistenToReactionUpdated,
  listenToReactionAck,
  unlistenToReactionAck,
  listenToReactionError,
  unlistenToReactionError,
  sendQuickReply,
  listenToErrors,
  unlistenToErrors,
  listenToMessageReacted,
  unlistenToMessageReacted,
  listenToAiCatchupDigestUpdated,
  unlistenToAiCatchupDigestUpdated,
  listenToAiAssistantItemUpdated,
  unlistenToAiAssistantItemUpdated,
};

export default socketService;
