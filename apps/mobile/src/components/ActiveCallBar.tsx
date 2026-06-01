import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { callService } from '../services/calls';
import { socketService } from '../services/socket';
import { useAuthStore } from '../store/useAuthStore';
import { useActiveCallStore, MobileActiveCall } from '../store/useActiveCallStore';

const TERMINAL = new Set(['ended', 'missed', 'rejected']);

function getCallName(call: MobileActiveCall): string {
  if (call.conversationName?.trim()) return call.conversationName.trim();
  return call.isGroupCall ? 'Cuộc gọi nhóm' : 'Cuộc gọi';
}

function formatElapsed(startedAt?: string | null): string {
  if (!startedAt) return 'Đang kết nối';
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${rest < 10 ? '0' : ''}${rest}`;
}

export function ActiveCallBar() {
  const router = useRouter();
  const pathname = usePathname();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const activeCall = useActiveCallStore((s) => s.activeCall);
  const setActiveCall = useActiveCallStore((s) => s.setActiveCall);
  const conflictVisible = useActiveCallStore((s) => s.conflictVisible);
  const conflictMessage = useActiveCallStore((s) => s.conflictMessage);
  const hideConflict = useActiveCallStore((s) => s.hideConflict);
  const [elapsedTick, setElapsedTick] = useState(0);
  const pulseAnim = React.useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isAuthenticated) {
      setActiveCall(null);
      return;
    }

    let cancelled = false;
    const syncActiveCall = () => {
      void callService.fetchActiveCall()
      .then((data) => {
        if (cancelled) return;
        if (!data?.sessionId) {
          setActiveCall(null);
          return;
        }
        const participantIds = Array.isArray(data.participantIds) ? data.participantIds : [];
        setActiveCall({
          sessionId: data.sessionId,
          conversationId: data.conversationId ?? null,
          conversationName: data.conversationName ?? null,
          callType: data.callType ?? 'video',
          isGroupCall: data.mode === 'sfu',
          participants: Array.isArray(data.participants) ? data.participants : [],
          participantIds,
          startedAt: data.startedAt ?? data.createdAt ?? null,
          status: data.status === 'ringing' ? 'outgoing' : data.status,
          callToken: data.callToken,
          initiatedBy: data.initiatedBy,
        });
      })
      .catch(() => undefined);
    };

    syncActiveCall();
    const socket = socketService.getSocket();
    socket?.on('connect', syncActiveCall);

    return () => {
      cancelled = true;
      socket?.off('connect', syncActiveCall);
    };
  }, [isAuthenticated, setActiveCall]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const onCallStatus = (data: { sessionId: string; status: MobileActiveCall['status']; reason?: string }) => {
      setActiveCall((activeCall && activeCall.sessionId === data.sessionId)
        ? (TERMINAL.has(data.status)
          ? null
          : {
            ...activeCall,
            status: data.status === 'ringing' ? activeCall.status : data.status,
            startedAt: data.status === 'connected' ? (activeCall.startedAt ?? new Date().toISOString()) : activeCall.startedAt,
          })
        : activeCall);
    };

    const onSocketError = (data: { message: string; code?: string }) => {
      if (data.code === 'ACTIVE_CALL_EXISTS') {
        useActiveCallStore.getState().showConflict(data.message || 'Bạn đang trong cuộc gọi hiện tại.');
        return;
      }

      if (data.code === 'GROUP_CALL_REQUIRES_PARTICIPANTS') {
        useActiveCallStore.getState().showConflict('Nhóm cần ít nhất 2 thành viên để bắt đầu cuộc gọi.');
      }
    };

    socketService.listenToCallStatus(onCallStatus as any);
    socketService.listenToErrors(onSocketError);
    return () => {
      socketService.unlistenToCallStatus(onCallStatus);
      socketService.unlistenToErrors(onSocketError);
    };
  }, [activeCall, isAuthenticated, setActiveCall]);

  useEffect(() => {
    if (!activeCall || activeCall.status !== 'connected') {
      setElapsedTick(0);
      return;
    }
    const interval = setInterval(() => setElapsedTick((value) => value + 1), 1000);
    return () => clearInterval(interval);
  }, [activeCall]);

  useEffect(() => {
    if (!activeCall || TERMINAL.has(activeCall.status)) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [activeCall, pulseAnim]);

  const callName = useMemo(() => activeCall ? getCallName(activeCall) : 'Cuộc gọi hiện tại', [activeCall]);

  if ((!activeCall || TERMINAL.has(activeCall.status)) && !conflictVisible) return null;

  const statusText = activeCall?.status === 'connected'
    ? formatElapsed(activeCall.startedAt) + (elapsedTick >= 0 ? '' : '')
    : activeCall?.status === 'outgoing'
      ? 'Đang gọi...'
      : 'Đang kết nối...';

  const returnToCall = () => {
    if (!activeCall) {
      hideConflict();
      return;
    }

    hideConflict();
    router.push({
      pathname: '/call-screen',
      params: {
        conversationId: activeCall.conversationId ?? undefined,
        isGroup: activeCall.isGroupCall ? 'true' : 'false',
        type: activeCall.callType,
      },
    });
  };

  const endCall = () => {
    if (!activeCall) {
      hideConflict();
      return;
    }

    callService.endCall(activeCall.sessionId, activeCall.callToken);
    setActiveCall(null);
  };

  const showBar = Boolean(activeCall && !TERMINAL.has(activeCall.status) && pathname !== '/call-screen');

  return (
    <>
      {showBar && (
        <TouchableOpacity style={styles.container} onPress={returnToCall} activeOpacity={0.9}>
          <View style={styles.bar}>
            <Animated.View style={[styles.dot, { opacity: pulseAnim }]} />
            <Ionicons name={activeCall?.callType === 'video' ? 'videocam' : 'call'} size={16} color="#fff" />
            <View style={styles.textWrap}>
              <Text style={styles.title} numberOfLines={1}>{callName}</Text>
              <Text style={styles.subtitle}>{statusText}</Text>
            </View>
            <TouchableOpacity style={styles.returnButton} onPress={returnToCall}>
              <Text style={styles.returnText}>Quay lại</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.endButton} onPress={endCall}>
              <Ionicons name="call" size={18} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      )}

      <Modal transparent visible={conflictVisible} animationType="fade" onRequestClose={hideConflict}>
        <Pressable style={styles.modalBackdrop} onPress={hideConflict}>
          <Pressable style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Bạn đang trong cuộc gọi</Text>
              <TouchableOpacity onPress={hideConflict} style={styles.closeButton}>
                <Ionicons name="close" size={20} color="#64748b" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalDescription}>{callName}</Text>
            <Text style={styles.modalBody}>{conflictMessage || 'Vui lòng quay lại hoặc kết thúc cuộc gọi hiện tại trước khi bắt đầu cuộc gọi khác.'}</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalButton, styles.secondaryButton]} onPress={hideConflict}>
                <Text style={styles.secondaryText}>Đóng</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.dangerButton]} onPress={endCall}>
                <Text style={styles.primaryText}>Kết thúc cuộc gọi</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.primaryButton]} onPress={returnToCall}>
                <Text style={styles.primaryText}>Quay lại cuộc gọi</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 50,
    left: 12,
    right: 12,
    zIndex: 9998,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  textWrap: { flex: 1, minWidth: 0 },
  title: { color: '#fff', fontSize: 13, fontFamily: 'BeVietnamPro_600SemiBold' },
  subtitle: { color: 'rgba(255,255,255,0.82)', fontSize: 11, fontFamily: 'BeVietnamPro_400Regular' },
  returnButton: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.18)' },
  returnText: { color: '#fff', fontSize: 12, fontFamily: 'BeVietnamPro_600SemiBold' },
  endButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', padding: 20 },
  modalCard: { borderRadius: 18, backgroundColor: '#fff', padding: 18 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  modalTitle: { flex: 1, color: '#0f172a', fontSize: 18, fontFamily: 'BeVietnamPro_700Bold' },
  closeButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: '#f1f5f9' },
  modalDescription: { marginTop: 8, color: '#0f172a', fontSize: 14, fontFamily: 'BeVietnamPro_600SemiBold' },
  modalBody: { marginTop: 6, color: '#64748b', fontSize: 13, lineHeight: 20, fontFamily: 'BeVietnamPro_400Regular' },
  modalActions: { marginTop: 18, gap: 8 },
  modalButton: { minHeight: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  primaryButton: { backgroundColor: '#059669' },
  dangerButton: { backgroundColor: '#ef4444' },
  secondaryButton: { backgroundColor: '#f1f5f9' },
  primaryText: { color: '#fff', fontSize: 13, fontFamily: 'BeVietnamPro_600SemiBold' },
  secondaryText: { color: '#334155', fontSize: 13, fontFamily: 'BeVietnamPro_600SemiBold' },
});
