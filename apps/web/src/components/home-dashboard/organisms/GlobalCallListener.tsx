'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  emitCallReject,
  getSocket,
  listenToCallIncoming,
  listenToCallStatus,
  unlistenToCallIncoming,
  unlistenToCallStatus,
  type CallIncomingPayload,
  type CallStatusPayload,
} from '@/services/socket';
import { getAccessToken } from '@/utils/auth-token';
import { callStore } from '@/stores/call-store';
import { profileStore } from '@/stores/profile-store';
import { WEB_IN_APP_TOAST_EVENT, type WebInAppToastDetail } from '@/components/notifications/InAppNotificationToasts';

function decodeUserIdFromToken(token: string | null): string | null {
  if (!token) return null;

  try {
    const payload = token.split('.')[1];
    if (!payload) return null;

    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const decoded = JSON.parse(window.atob(padded)) as { sub?: string; userId?: string; id?: string };
    return decoded.sub || decoded.userId || decoded.id || null;
  } catch {
    return null;
  }
}

function resolveCurrentUserId(): string | null {
  return profileStore.profile?._id || decodeUserIdFromToken(getAccessToken());
}

function setIncomingCall(payload: CallIncomingPayload) {
  callStore.setActiveCall((prev) => {
    if (prev && prev.sessionId !== payload.sessionId && !['ended', 'missed', 'rejected'].includes(prev.status)) {
      emitCallReject(payload.sessionId, payload.callToken, 'busy');
      callStore.showActiveCallConflict('Bạn đang trong cuộc gọi hiện tại.');
      return prev;
    }

    const currentUserId = resolveCurrentUserId();
    const participantIds = Array.from(new Set([
      ...(payload.participantIds || []),
      payload.fromUserId,
      ...(currentUserId ? [currentUserId] : []),
    ]));
    if (prev?.sessionId === payload.sessionId) {
      return {
        ...prev,
        conversationId: payload.conversationId || prev.conversationId,
        conversationName: payload.conversationName ?? prev.conversationName ?? null,
        isGroupCall: Boolean(payload.isGroupCall),
        initiatedBy: payload.fromUserId,
        participantIds,
        participants: participantIds.map((userId) => ({ userId })),
        joinedParticipantIds: Array.from(new Set([...prev.joinedParticipantIds, payload.fromUserId])),
        direction: 'incoming',
        status: prev.status === 'connected' || prev.status === 'connecting' ? prev.status : 'incoming',
        callToken: payload.callToken,
        callType: payload.callType || prev.callType || 'video',
        timeoutAt: payload.timeoutAt ?? prev.timeoutAt ?? null,
      };
    }

    return {
      sessionId: payload.sessionId,
      conversationId: payload.conversationId || null,
      conversationName: payload.conversationName ?? null,
      isGroupCall: Boolean(payload.isGroupCall),
      initiatedBy: payload.fromUserId,
      participantIds,
      participants: participantIds.map((userId) => ({ userId })),
      joinedParticipantIds: [payload.fromUserId],
      participantDisplayNames: {},
      direction: 'incoming',
      status: 'incoming',
      callToken: payload.callToken,
      callType: payload.callType || 'video',
      startedAt: null,
      timeoutAt: payload.timeoutAt ?? null,
    };
  });
}

export function GlobalCallListener() {
  const router = useRouter();

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;

    const socket = getSocket(token);

    const handleCallIncoming = (payload: CallIncomingPayload) => {
      const current = callStore.activeCall;
      if (current && current.sessionId !== payload.sessionId && !['ended', 'missed', 'rejected'].includes(current.status)) {
        emitCallReject(payload.sessionId, payload.callToken, 'busy');
        callStore.showActiveCallConflict('Bạn đang trong cuộc gọi hiện tại.');
        return;
      }

      setIncomingCall(payload);

      const toastId = `call-${payload.sessionId}`;
      const isAudioCall = payload.callType === 'audio';
      const callerName = payload.callerName || 'Người gọi';
      const targetName = payload.isGroupCall
        ? (payload.conversationName || 'Nhóm')
        : callerName;

      const detail: WebInAppToastDetail = {
        id: toastId,
        type: 'community_post',
        title: payload.isGroupCall ? `Cuộc gọi nhóm: ${targetName}` : `Cuộc gọi từ ${callerName}`,
        body: payload.isGroupCall
          ? `${callerName} đang gọi ${isAudioCall ? 'thoại' : 'video'} trong nhóm`
          : `Bạn đang có cuộc gọi ${isAudioCall ? 'thoại' : 'video'}`,
        durationMs: 30000,
        actions: [
          {
            label: 'Trả lời',
            variant: 'primary',
            onClick: () => {
              setIncomingCall(payload);
              window.sessionStorage.setItem('zync.autoAcceptCallSessionId', payload.sessionId);
              router.push(payload.conversationId ? `/chat?conversationId=${payload.conversationId}` : '/chat');
            },
          },
          {
            label: 'Từ chối',
            variant: 'danger',
            onClick: () => {
              socket.emit('call_reject', {
                sessionId: payload.sessionId,
                reason: 'rejected',
                callToken: payload.callToken,
              });
              callStore.setActiveCall((prev) => (prev?.sessionId === payload.sessionId ? null : prev));
            },
          },
        ],
      };

      window.dispatchEvent(new CustomEvent(WEB_IN_APP_TOAST_EVENT, { detail }));
    };

    const handleCallStatus = (payload: CallStatusPayload) => {
      callStore.setActiveCall((prev) => {
        if (!prev || prev.sessionId !== payload.sessionId) return prev;
        if (['ended', 'missed', 'rejected'].includes(payload.status)) return null;
        return {
          ...prev,
          status: payload.status === 'ringing' ? prev.status : payload.status,
          reason: payload.reason,
          startedAt: payload.status === 'connected' ? (prev.startedAt ?? new Date().toISOString()) : prev.startedAt,
        };
      });

      const currentUserId = resolveCurrentUserId();
      const activeCall = callStore.activeCall;
      const hasJoined = Boolean(
        currentUserId
        && activeCall
        && activeCall.sessionId === payload.sessionId
        && activeCall.joinedParticipantIds.includes(currentUserId),
      );
      const isCaller = Boolean(
        activeCall
        && activeCall.sessionId === payload.sessionId
        && activeCall.direction === 'outgoing',
      );
      const shouldDismissForConnect = payload.status === 'connecting' || payload.status === 'connected';

      if (
        ['ended', 'missed', 'rejected'].includes(payload.status)
        || (shouldDismissForConnect && (hasJoined || isCaller))
      ) {
        window.dispatchEvent(new CustomEvent(WEB_IN_APP_TOAST_EVENT, {
          detail: {
            id: `call-${payload.sessionId}`,
            title: '',
            body: '',
            dismiss: true,
          } satisfies WebInAppToastDetail,
        }));
      }
    };

    listenToCallIncoming(handleCallIncoming);
    listenToCallStatus(handleCallStatus);

    return () => {
      unlistenToCallIncoming(handleCallIncoming);
      unlistenToCallStatus(handleCallStatus);
    };
  }, [router]);

  return null;
}
