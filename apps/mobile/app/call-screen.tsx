import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Alert, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { RTCView } from 'react-native-webrtc';
import { useVideoCall } from '../src/hooks/useVideoCall';
import { useAuthStore } from '../src/store/useAuthStore';
import { fonts } from '../src/theme/fonts';
import { lightTheme } from '../src/theme/colors';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');

export default function CallScreen() {
  const router = useRouter();
  const { targetUserId, conversationId, type, isGroup, incomingCallSession, callToken, fromUserId } = useLocalSearchParams<{
    targetUserId?: string;
    conversationId?: string;
    type?: 'audio' | 'video';
    isGroup?: string;
    incomingCallSession?: string;
    callToken?: string;
    fromUserId?: string;
  }>();
  const name = useLocalSearchParams().name as string | undefined;
  const avatarUrl = useLocalSearchParams().avatarUrl as string | undefined;

  const userInfo = useAuthStore((s) => s.userInfo);
  const userId = String(userInfo?._id || userInfo?.id || '');

  const {
    activeCall,
    localStream,
    remoteStream,
    remoteStreams,
    isMicMuted,
    isCameraEnabled,
    participantMediaStates,
    startCall,
    startGroupCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleCamera,
    switchCamera,
  } = useVideoCall(userId);

  const [callDuration, setCallDuration] = useState(0);
  const [hasStartedCall, setHasStartedCall] = useState(false);
  const wasCallActiveRef = useRef(false);
  const remoteStreamList = Array.from(remoteStreams.entries()).filter(([_, stream]) => Boolean((stream as any)?.toURL?.()));

  useEffect(() => {
    // Initiate outgoing call if not already active and not an incoming call pickup
    if (!activeCall && !hasStartedCall) {
      setHasStartedCall(true);
      if (incomingCallSession && callToken && fromUserId) {
        acceptCall(incomingCallSession, callToken, fromUserId, type || 'video');
      } else if (isGroup === 'true' && conversationId) {
        startGroupCall(conversationId, type || 'video');
      } else if (targetUserId) {
        startCall(targetUserId, type || 'video', conversationId);
      } else {
        Alert.alert('Lỗi', 'Thiếu thông tin người nhận cuộc gọi.');
        router.back();
      }
    }
  }, [activeCall, hasStartedCall, incomingCallSession, callToken, fromUserId, isGroup, conversationId, targetUserId, type, acceptCall, startCall, startGroupCall, router]);

  useEffect(() => {
    if (activeCall?.status === 'connected') {
      const interval = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [activeCall?.status]);

  useEffect(() => {
    // Auto close if ended
    if (activeCall?.status === 'ended' || activeCall?.status === 'rejected' || activeCall?.status === 'missed') {
      const timer = setTimeout(() => {
        if (router.canGoBack()) {
           router.back();
        } else {
           router.replace('/(tabs)/home');
        }
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [activeCall?.status, router]);

  useEffect(() => {
    if (activeCall) {
      wasCallActiveRef.current = true;
    }
  }, [activeCall]);

  useEffect(() => {
    // Fallback: If call was active but activeCall is suddenly reset to null, close immediately
    if (wasCallActiveRef.current && !activeCall) {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(tabs)/home');
      }
    }
  }, [activeCall, router]);

  const handleEndCall = () => {
    if (activeCall?.sessionId && activeCall?.callToken) {
      if (activeCall.direction === 'incoming' && activeCall.status === 'incoming') {
        rejectCall(activeCall.sessionId, activeCall.callToken);
      } else {
        endCall(activeCall.sessionId, activeCall.callToken);
      }
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/home');
    }
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const getStatusText = () => {
    if (!activeCall) return 'Đang khởi tạo...';
    switch (activeCall.status) {
      case 'idle': return 'Đang chờ...';
      case 'outgoing': return 'Đang gọi...';
      case 'incoming': return 'Cuộc gọi đến...';
      case 'connecting': return 'Đang kết nối...';
      case 'connected': return formatDuration(callDuration);
      case 'missed': return 'Bỏ lỡ';
      case 'ended': return 'Kết thúc';
      default: return '';
    }
  };

  const renderTile = (stream: MediaStream | null, peerId: string, isMe: boolean) => {
    const mediaState = isMe 
      ? { isMicMuted, isCameraOff: !isCameraEnabled, isScreenSharing: false } 
      : (participantMediaStates?.[peerId] || {});
      
    let displayName = isMe ? 'Bạn' : 'Người dùng';
    let avatar = isMe ? userInfo?.avatarUrl : undefined;
    
    if (!isMe && activeCall?.participants) {
      const p = activeCall.participants.find(p => p.userId === peerId);
      if (p) {
        if (p.displayName) displayName = p.displayName;
        if ((p as any).avatarUrl) avatar = (p as any).avatarUrl;
      }
    }

    if (!isMe && !activeCall?.isGroupCall && name) displayName = name;
    if (!isMe && !activeCall?.isGroupCall && avatarUrl) avatar = avatarUrl;
    
    const isVideoOff = mediaState.isCameraOff || !stream || !(stream as any).toURL?.();
    const isScreenShare = !isMe && mediaState.isScreenSharing;

    return (
      <View style={StyleSheet.absoluteFill}>
         {!isVideoOff && stream && (stream as any).toURL?.() ? (
           <RTCView streamURL={(stream as any).toURL()} style={StyleSheet.absoluteFillObject} objectFit={isScreenShare ? "contain" : "cover"} zOrder={isMe ? 1 : 0} />
         ) : (
           <View style={styles.tileAvatarFallback}>
             {avatar ? (
               <Image source={{uri: avatar}} style={styles.tileAvatarImage} />
             ) : (
               <Text style={styles.tileAvatarText}>{displayName.charAt(0).toUpperCase()}</Text>
             )}
           </View>
         )}
         <View style={styles.tileOverlay}>
           <View style={styles.tileNameTag}>
             {mediaState.isMicMuted && <Ionicons name="mic-off" size={14} color="#ef4444" style={{marginRight: 4}} />}
             <Text style={styles.tileNameText} numberOfLines={1}>{displayName}</Text>
           </View>
         </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#1e293b', '#020617']}
        style={StyleSheet.absoluteFillObject}
      />
      
      {/* Top Bar for minimizing */}
      <SafeAreaView style={styles.topBarContainer} edges={['top']}>
        <TouchableOpacity style={styles.minimizeBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-down" size={28} color="#fff" />
        </TouchableOpacity>
      </SafeAreaView>

      {/* Call Area */}
      {activeCall?.status === 'connected' ? (
        <View style={styles.gridContainer}>
          {remoteStreamList.length === 0 ? (
            <View style={styles.singleParticipantWrapper}>
              {renderTile(localStream, userId, true)}
              <View style={styles.statusOverlay}>
                <Text style={styles.waitingText}>Đang chờ người khác tham gia...</Text>
              </View>
            </View>
          ) : remoteStreamList.length === 1 ? (
            <View style={styles.singleParticipantWrapper}>
              {renderTile(remoteStreamList[0][1], remoteStreamList[0][0], false)}
              {/* Local PiP */}
              <View style={styles.localVideoContainer}>
                {renderTile(localStream, userId, true)}
              </View>
            </View>
          ) : remoteStreamList.length === 2 ? (
            <View style={styles.splitGrid}>
              <View style={styles.splitGridItem}>
                {renderTile(remoteStreamList[0][1], remoteStreamList[0][0], false)}
              </View>
              <View style={styles.splitGridItem}>
                {renderTile(remoteStreamList[1][1], remoteStreamList[1][0], false)}
              </View>
              <View style={styles.localVideoContainer}>
                {renderTile(localStream, userId, true)}
              </View>
            </View>
          ) : (
            <View style={styles.remoteGrid}>
              {/* If 3-4 peers (including us), we show a 2x2 grid. We inject ourselves into the array for grid rendering */}
              {[...remoteStreamList.slice(0, 3)].map(([peerId, stream], index) => (
                <View
                  key={peerId || `remote-${index}`}
                  style={[styles.remoteGridItem]}
                >
                  {renderTile(stream, peerId, false)}
                </View>
              ))}
              <View style={styles.remoteGridItem}>
                 {renderTile(localStream, userId, true)}
              </View>
            </View>
          )}
        </View>
      ) : (
        <View style={styles.statusContainer}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImage} resizeMode="cover" />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>{(name || (isGroup === 'true' ? 'Nhóm' : 'Người dùng')).charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <Text style={styles.nameText}>
            {name || (isGroup === 'true' ? 'Gọi nhóm' : 'Người dùng')}
          </Text>
          <Text style={styles.statusText}>{getStatusText()}</Text>
        </View>
      )}

      {/* Controls */}
      <SafeAreaView style={styles.controlsSafeArea} edges={['bottom']}>
        <View style={styles.floatingControls}>
          <TouchableOpacity 
            style={[styles.controlButton, isMicMuted && styles.controlButtonActive]} 
            onPress={toggleMute}
          >
            <Ionicons name={isMicMuted ? 'mic-off' : 'mic'} size={26} color={isMicMuted ? '#000' : '#fff'} />
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.controlButton, !isCameraEnabled && styles.controlButtonActive]} 
            onPress={toggleCamera}
          >
            <Ionicons name={!isCameraEnabled ? 'videocam-off' : 'videocam'} size={26} color={!isCameraEnabled ? '#000' : '#fff'} />
          </TouchableOpacity>

          {isCameraEnabled && (
            <TouchableOpacity style={styles.controlButton} onPress={switchCamera}>
              <Ionicons name="camera-reverse" size={26} color="#fff" />
            </TouchableOpacity>
          )}

          <TouchableOpacity style={[styles.controlButton, styles.endCallButton]} onPress={handleEndCall}>
            <Ionicons name="call" size={26} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  statusContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 60,
  },
  avatarPlaceholder: {
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  avatarImage: {
    width: 130,
    height: 130,
    borderRadius: 65,
    marginBottom: 32,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  avatarText: {
    fontSize: 48,
    color: '#fff',
    fontFamily: fonts.bold,
  },
  nameText: {
    fontSize: 28,
    color: '#fff',
    fontFamily: fonts.bold,
    marginBottom: 12,
  },
  statusText: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.7)',
    fontFamily: fonts.medium,
  },
  localVideoContainer: {
    position: 'absolute',
    bottom: 120, // Moved up to not overlap controls
    right: 20,
    width: 110,
    height: 160,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#1e293b',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  localVideo: {
    flex: 1,
  },
  gridContainer: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  singleParticipantWrapper: {
    flex: 1,
  },
  splitGrid: {
    flex: 1,
    flexDirection: 'column',
  },
  splitGridItem: {
    flex: 1,
    width: '100%',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
  },
  remoteGrid: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#0b1220',
  },
  remoteGridItem: {
    width: '50%',
    height: '50%',
    borderWidth: 1,
    borderColor: '#0f172a',
    backgroundColor: '#0f172a',
    overflow: 'hidden',
  },
  statusOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  waitingText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: fonts.medium,
  },
  tileAvatarFallback: {
    flex: 1,
    backgroundColor: '#1e293b',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tileAvatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  tileAvatarText: {
    color: '#fff',
    fontSize: 32,
    fontFamily: fonts.bold,
  },
  tileOverlay: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tileNameTag: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '80%',
  },
  tileNameText: {
    color: '#fff',
    fontSize: 13,
    fontFamily: fonts.medium,
  },
  controlsSafeArea: {
    position: 'absolute',
    bottom: 30,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  floatingControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 40,
    gap: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  controlButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlButtonActive: {
    backgroundColor: '#fff',
  },
  endCallButton: {
    backgroundColor: '#ef4444',
  },
  topBarContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    zIndex: 10,
    flexDirection: 'row',
  },
  minimizeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

