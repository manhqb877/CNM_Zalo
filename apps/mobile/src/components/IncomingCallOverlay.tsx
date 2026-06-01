import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { socketService } from '../services/socket';
import { useAuthStore } from '../store/useAuthStore';
import { useActiveCallStore } from '../store/useActiveCallStore';

interface IncomingCallData {
  sessionId: string;
  conversationId?: string;
  isGroupCall: boolean;
  fromUserId: string;
  callerName?: string;
  callerAvatarUrl?: string;
  conversationName?: string;
  participantIds?: string[];
  callToken: string;
  type: 'audio' | 'video';
}

export function IncomingCallOverlay() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const activeCall = useActiveCallStore((s) => s.activeCall);
  const showConflict = useActiveCallStore((s) => s.showConflict);
  const [incomingCall, setIncomingCall] = useState<IncomingCallData | null>(null);
  const [socketReadyVersion, setSocketReadyVersion] = useState(0);
  const slideAnim = React.useRef(new Animated.Value(-150)).current;

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (!isAuthenticated) {
        return;
      }

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
  }, [isAuthenticated]);

  useEffect(() => {
    const socket = socketService.getSocket();
    if (!socket || !isAuthenticated) return;

    const onCallIncoming = (data: any) => {
      if (activeCall && activeCall.sessionId !== data.sessionId) {
        socketService.emitCallReject(data.sessionId, data.callToken, 'busy');
        showConflict('Bạn đang trong cuộc gọi hiện tại.');
        return;
      }

      setIncomingCall({
        sessionId: data.sessionId,
        conversationId: data.conversationId,
        isGroupCall: Boolean(data.isGroupCall),
        fromUserId: data.fromUserId,
        callerName: data.callerName,
        callerAvatarUrl: data.callerAvatarUrl,
        conversationName: data.conversationName,
        participantIds: Array.isArray(data.participantIds) ? data.participantIds : undefined,
        callToken: data.callToken,
        type: data.callType || data.type || 'video',
      });

      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 12,
      }).start();
    };

    const onCallStatus = (data: any) => {
      if (data.status === 'ended' || data.status === 'missed' || data.status === 'rejected') {
        setIncomingCall((prev) => {
          if (prev && prev.sessionId === data.sessionId) {
            closeOverlay();
            return null;
          }
          return prev;
        });
      }
    };

    socketService.listenToCallIncoming(onCallIncoming);
    socketService.listenToCallStatus(onCallStatus);

    return () => {
      socketService.unlistenToCallIncoming(onCallIncoming);
      socketService.unlistenToCallStatus(onCallStatus);
    };
  }, [activeCall, isAuthenticated, showConflict, slideAnim, socketReadyVersion]);

  const closeOverlay = () => {
    Animated.timing(slideAnim, {
      toValue: -150,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setIncomingCall(null);
    });
  };

  const handleAccept = () => {
    if (!incomingCall) return;

    router.push({
      pathname: '/call-screen',
      params: {
        incomingCallSession: incomingCall.sessionId,
        conversationId: incomingCall.conversationId,
        isGroup: incomingCall.isGroupCall ? 'true' : 'false',
        type: incomingCall.type,
        callToken: incomingCall.callToken,
        fromUserId: incomingCall.fromUserId,
      },
    });

    closeOverlay();
  };

  const handleReject = () => {
    if (!incomingCall) return;
    socketService.emitCallReject(incomingCall.sessionId, incomingCall.callToken, 'rejected');
    closeOverlay();
  };

  if (!incomingCall) return null;
  const callerName = incomingCall.callerName || 'Người gọi';
  const targetName = incomingCall.isGroupCall
    ? (incomingCall.conversationName || 'Nhóm')
    : callerName;

  return (
    <Animated.View style={[styles.container, { transform: [{ translateY: slideAnim }] }]}>
      <View style={styles.overlay}>
        <View style={styles.infoContainer}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={24} color="#94a3b8" />
          </View>
          <View>
            <Text style={styles.title} numberOfLines={1}>
              {incomingCall.isGroupCall ? `Cuộc gọi nhóm: ${targetName}` : `Cuộc gọi từ ${callerName}`}
            </Text>
            <Text style={styles.subtitle}>
              {incomingCall.isGroupCall
                ? `${callerName} đang gọi ${incomingCall.type === 'audio' ? 'thoại' : 'video'}`
                : incomingCall.type === 'audio' ? 'Cuộc gọi thoại' : 'Cuộc gọi video'}
            </Text>
          </View>
        </View>

        <View style={styles.actionsContainer}>
          <TouchableOpacity style={[styles.actionButton, styles.rejectButton]} onPress={handleReject}>
            <Ionicons name="call" size={24} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionButton, styles.acceptButton]} onPress={handleAccept}>
            <Ionicons name={incomingCall.type === 'video' ? 'videocam' : 'call'} size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    zIndex: 9999,
  },
  overlay: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#dbe7e4',
  },
  infoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#e6f4f1',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  title: {
    color: '#0f172a',
    fontSize: 16,
    fontFamily: 'BeVietnamPro_600SemiBold',
  },
  subtitle: {
    color: '#64748b',
    fontSize: 14,
    fontFamily: 'BeVietnamPro_400Regular',
  },
  actionsContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rejectButton: {
    backgroundColor: '#ef4444',
  },
  acceptButton: {
    backgroundColor: '#10b981',
  },
});
