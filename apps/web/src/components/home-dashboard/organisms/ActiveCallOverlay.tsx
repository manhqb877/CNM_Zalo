'use client';

import { useEffect, useMemo, useState } from 'react';
import { Phone, X } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { apiClient } from '@/services/api';
import { getRawSocket } from '@/services/socket';
import {
  callStore,
  subscribeToCallConflictStore,
  subscribeToCallStore,
  type ActiveCallConflictState,
  type CallSessionState,
} from '@/stores/call-store';
import { emitCallEnd } from '@/services/socket';

const TERMINAL_STATUSES = new Set(['ended', 'missed', 'rejected']);

function formatElapsed(startedAt?: string | null): string {
  if (!startedAt) return 'Đang kết nối';
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
}

function getCallName(call: CallSessionState): string {
  if (call.conversationName?.trim()) return call.conversationName.trim();
  const names = Object.entries(call.participantDisplayNames ?? {})
    .filter(([userId]) => call.isGroupCall || userId !== call.initiatedBy)
    .map(([, name]) => name)
    .filter(Boolean);
  return names[0] ?? (call.isGroupCall ? 'Cuộc gọi nhóm' : 'Cuộc gọi');
}

export function ActiveCallOverlay() {
  const router = useRouter();
  const pathname = usePathname();
  const [activeCall, setActiveCall] = useState<CallSessionState | null>(callStore.activeCall);
  const [conflict, setConflict] = useState<ActiveCallConflictState>(callStore.conflict);
  const [, setTick] = useState(0);

  useEffect(() => subscribeToCallStore(setActiveCall), []);
  useEffect(() => subscribeToCallConflictStore(setConflict), []);

  useEffect(() => {
    let cancelled = false;
    const syncActiveCall = () => {
      void apiClient.get('/api/calls/active')
      .then((response) => {
        if (cancelled) return;
        const data = response.data?.data;
        if (!data?.sessionId) {
          callStore.setActiveCall(null);
          return;
        }
        const participantIds = Array.isArray(data.participantIds) ? data.participantIds : [];
        callStore.setActiveCall({
          sessionId: data.sessionId,
          conversationId: data.conversationId ?? null,
          conversationName: data.conversationName ?? null,
          isGroupCall: data.mode === 'sfu',
          initiatedBy: data.initiatedBy,
          participantIds,
          participants: Array.isArray(data.participants) ? data.participants : [],
          joinedParticipantIds: Array.isArray(data.participants)
            ? data.participants.filter((item: { status?: string }) => item.status === 'joined').map((item: { userId: string }) => item.userId)
            : [],
          participantDisplayNames: {},
          direction: data.initiatedBy ? 'outgoing' : 'incoming',
          status: data.status === 'ringing' ? 'outgoing' : data.status,
          callToken: data.callToken,
          callType: data.callType ?? 'video',
          startedAt: data.startedAt ?? data.createdAt ?? null,
          timeoutAt: data.timeoutAt ?? null,
        });
      })
      .catch(() => undefined);
    };

    syncActiveCall();
    const socket = getRawSocket();
    socket?.on('connect', syncActiveCall);
    return () => {
      cancelled = true;
      socket?.off('connect', syncActiveCall);
    };
  }, []);

  useEffect(() => {
    if (!activeCall || TERMINAL_STATUSES.has(activeCall.status)) return;
    const timer = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [activeCall]);

  const activeName = useMemo(() => (activeCall ? getCallName(activeCall) : 'Cuộc gọi hiện tại'), [activeCall]);
  const showMiniBar = Boolean(activeCall && !TERMINAL_STATUSES.has(activeCall.status) && !pathname.startsWith('/chat'));

  const returnToCall = () => {
    callStore.hideActiveCallConflict();
    const conversationId = activeCall?.conversationId;
    router.push(conversationId ? `/chat?conversationId=${encodeURIComponent(conversationId)}` : '/chat');
  };

  const endCall = () => {
    if (activeCall?.sessionId && activeCall.callToken) {
      emitCallEnd(activeCall.sessionId, activeCall.callToken, 'ended');
    }
    callStore.setActiveCall(null);
  };

  return (
    <>
      {showMiniBar && activeCall && (
        <div className="fixed bottom-24 left-1/2 z-50 w-[calc(100vw-24px)] max-w-md -translate-x-1/2 rounded-2xl border border-border bg-[var(--surface-card)] p-3 shadow-2xl md:bottom-6 md:left-auto md:right-6 md:w-96 md:translate-x-0">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-white">
              <Phone className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-text-primary">{activeName}</p>
              <p className="text-xs text-text-secondary">{activeCall.status === 'connected' ? formatElapsed(activeCall.startedAt) : 'Đang trong cuộc gọi'}</p>
            </div>
            <button type="button" onClick={returnToCall} className="rounded-full bg-accent px-3 py-2 text-xs font-semibold text-[var(--bg-primary)]">
              Quay lại
            </button>
            <button type="button" onClick={endCall} className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500 text-white" aria-label="Kết thúc cuộc gọi">
              <Phone className="h-4 w-4 rotate-[135deg]" />
            </button>
          </div>
        </div>
      )}

      {conflict.visible && activeCall && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 px-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-[var(--surface-card)] p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">Bạn đang trong cuộc gọi</h2>
                <p className="mt-1 text-sm text-text-secondary">{activeName}</p>
              </div>
              <button type="button" onClick={() => callStore.hideActiveCallConflict()} className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-text-secondary">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-5 text-sm text-text-secondary">{conflict.message ?? 'Vui lòng quay lại hoặc kết thúc cuộc gọi hiện tại trước khi bắt đầu cuộc gọi khác.'}</p>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => callStore.hideActiveCallConflict()} className="rounded-full border border-border px-4 py-2 text-sm text-text-secondary">
                Đóng
              </button>
              <button type="button" onClick={endCall} className="rounded-full bg-red-500 px-4 py-2 text-sm font-semibold text-white">
                Kết thúc cuộc gọi
              </button>
              <button type="button" onClick={returnToCall} className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-[var(--bg-primary)]">
                Quay lại cuộc gọi
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
