import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  mediaDevices,
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  MediaStream,
} from 'react-native-webrtc';
import { socketService } from '../services/socket';
import { callService } from '../services/calls';
import { useKeepAwake } from 'expo-keep-awake';
import { AppState, AppStateStatus } from 'react-native';
import { useActiveCallStore } from '../store/useActiveCallStore';

export type CallUiStatus =
  | 'idle'
  | 'outgoing'
  | 'incoming'
  | 'connecting'
  | 'connected'
  | 'ended'
  | 'missed'
  | 'rejected';

export interface ActiveCallState {
  sessionId: string;
  conversationId?: string;
  isGroupCall: boolean;
  initiatedBy: string;
  participantIds: string[];
  direction: 'incoming' | 'outgoing';
  status: CallUiStatus;
  callToken: string;
  conversationName?: string | null;
  callType?: 'audio' | 'video';
  participants?: Array<{ userId: string; displayName?: string; status?: string }>;
  startedAt?: string | null;
  reason?: string;
}

export function useVideoCall(userId: string) {
  const [activeCall, setActiveCall] = useState<ActiveCallState | null>(null);
  const globalActiveCall = useActiveCallStore((s) => s.activeCall);
  const setGlobalActiveCall = useActiveCallStore((s) => s.setActiveCall);
  const showActiveCallConflict = useActiveCallStore((s) => s.showConflict);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCameraEnabled, setIsCameraEnabled] = useState(true);
  const [participantMediaStates, setParticipantMediaStates] = useState<Record<string, { isMicMuted?: boolean, isCameraOff?: boolean, isScreenSharing?: boolean }>>({});
  const [socketReadyVersion, setSocketReadyVersion] = useState(0);

  const activeCallRef = useRef<ActiveCallState | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const sentOfferKeysRef = useRef<Set<string>>(new Set());
  const processingOfferKeysRef = useRef<Set<string>>(new Set());
  const answeredOfferKeysRef = useRef<Set<string>>(new Set());
  const negotiatedPeerKeysRef = useRef<Set<string>>(new Set());
  const pendingIceCandidatesRef = useRef<Map<string, unknown[]>>(new Map());

  useKeepAwake();

  useEffect(() => {
    activeCallRef.current = activeCall;
    if (!activeCall || activeCall.status === 'idle') {
      setGlobalActiveCall(null);
      return;
    }
    setGlobalActiveCall({
      sessionId: activeCall.sessionId,
      conversationId: activeCall.conversationId,
      conversationName: activeCall.conversationName,
      callType: activeCall.callType ?? 'video',
      isGroupCall: activeCall.isGroupCall,
      participants: activeCall.participants ?? activeCall.participantIds.map((participantId) => ({ userId: participantId })),
      participantIds: activeCall.participantIds,
      startedAt: activeCall.startedAt,
      status: activeCall.status,
      callToken: activeCall.callToken,
      initiatedBy: activeCall.initiatedBy,
    });
  }, [activeCall, setGlobalActiveCall]);

  useEffect(() => {
    if (!activeCall && globalActiveCall) {
      setActiveCall({
        sessionId: globalActiveCall.sessionId,
        conversationId: globalActiveCall.conversationId ?? undefined,
        conversationName: globalActiveCall.conversationName,
        isGroupCall: globalActiveCall.isGroupCall,
        initiatedBy: globalActiveCall.initiatedBy ?? userId,
        participantIds: globalActiveCall.participantIds,
        participants: globalActiveCall.participants,
        direction: globalActiveCall.initiatedBy === userId ? 'outgoing' : 'incoming',
        status: globalActiveCall.status === 'ringing' ? 'outgoing' : globalActiveCall.status,
        callToken: globalActiveCall.callToken,
        callType: globalActiveCall.callType,
        startedAt: globalActiveCall.startedAt,
      });
    }
  }, [activeCall, globalActiveCall, userId]);

  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        if (localStreamRef.current) {
          localStreamRef.current.getVideoTracks().forEach((track) => {
            track.enabled = false;
          });
        }
      } else if (nextAppState === 'active') {
        if (localStreamRef.current) {
          localStreamRef.current.getVideoTracks().forEach((track) => {
            track.enabled = isCameraEnabled;
          });
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [isCameraEnabled]);

  useEffect(() => {
    let cancelled = false;

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
  }, []);

  const remoteStream = useMemo(() => {
    const first = remoteStreams.values().next();
    return first.done ? null : first.value;
  }, [remoteStreams]);

  const getPeerKey = useCallback((sessionId: string, peerUserId: string) => (
    `${sessionId}:${peerUserId}`
  ), []);

  const getSdpFingerprint = useCallback((sdp: unknown) => {
    if (sdp && typeof sdp === 'object') {
      const rawSdp = (sdp as { sdp?: unknown }).sdp;
      if (typeof rawSdp === 'string') {
        return rawSdp.slice(0, 256);
      }
    }

    try {
      return JSON.stringify(sdp).slice(0, 256);
    } catch {
      return String(sdp);
    }
  }, []);

  const getSignalingState = useCallback((pc: RTCPeerConnection) => (
    ((pc as unknown as { signalingState?: string }).signalingState) ?? 'stable'
  ), []);

  const hasRemoteDescription = useCallback((pc: RTCPeerConnection) => Boolean(
    (pc as unknown as { remoteDescription?: unknown; currentRemoteDescription?: unknown; pendingRemoteDescription?: unknown }).remoteDescription
      ?? (pc as unknown as { currentRemoteDescription?: unknown }).currentRemoteDescription
      ?? (pc as unknown as { pendingRemoteDescription?: unknown }).pendingRemoteDescription,
  ), []);

  const hasLocalDescription = useCallback((pc: RTCPeerConnection) => Boolean(
    (pc as unknown as { localDescription?: unknown; currentLocalDescription?: unknown; pendingLocalDescription?: unknown }).localDescription
      ?? (pc as unknown as { currentLocalDescription?: unknown }).currentLocalDescription
      ?? (pc as unknown as { pendingLocalDescription?: unknown }).pendingLocalDescription,
  ), []);

  const getIceServers = useCallback(() => {
    const stunServers = {
      urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'],
    };

    const turnUrlsRaw = process.env.EXPO_PUBLIC_TURN_URLS ?? '';
    const turnUrls = turnUrlsRaw.split(',').map((u: string) => u.trim()).filter(Boolean);

    if (turnUrls.length > 0) {
      return [
        stunServers,
        {
          urls: turnUrls,
          username: process.env.EXPO_PUBLIC_TURN_USERNAME,
          credential: process.env.EXPO_PUBLIC_TURN_PASSWORD,
        },
      ];
    }

    return [stunServers];
  }, []);

  const closePeerConnection = useCallback((peerUserId: string) => {
    const pc = peerConnectionsRef.current.get(peerUserId);
    if (!pc) return;

    pc.close();
    peerConnectionsRef.current.delete(peerUserId);
    pendingIceCandidatesRef.current.delete(peerUserId);
    const sessionId = activeCallRef.current?.sessionId;
    if (sessionId) {
      const peerKey = getPeerKey(sessionId, peerUserId);
      sentOfferKeysRef.current.delete(peerKey);
      negotiatedPeerKeysRef.current.delete(peerKey);
    }
  }, [getPeerKey]);

  const closeAllPeerConnections = useCallback(() => {
    for (const [, pc] of peerConnectionsRef.current) {
      pc.close();
    }
    peerConnectionsRef.current.clear();
  }, []);

  const resetCall = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
      localStreamRef.current = null;
    }

    closeAllPeerConnections();
    sentOfferKeysRef.current.clear();
    processingOfferKeysRef.current.clear();
    answeredOfferKeysRef.current.clear();
    negotiatedPeerKeysRef.current.clear();
    pendingIceCandidatesRef.current.clear();

    setRemoteStreams((prev) => {
      prev.forEach((stream) => {
        stream.getTracks().forEach((track) => track.stop());
      });
      return new Map();
    });

    setActiveCall(null);
    setIsMicMuted(false);
    setIsCameraEnabled(true);
    setParticipantMediaStates({});
  }, [closeAllPeerConnections]);

  const initLocalStream = useCallback(async (videoEnabled = true) => {
    try {
      const stream = (await mediaDevices.getUserMedia({
        audio: true,
        video: videoEnabled,
      })) as MediaStream;
      setLocalStream(stream);
      localStreamRef.current = stream;
      setIsCameraEnabled(videoEnabled);
      return stream;
    } catch (error) {
      console.error('Failed to get local stream', error);
      return null;
    }
  }, []);

  const attachLocalTracks = useCallback((pc: RTCPeerConnection) => {
    const stream = localStreamRef.current;
    if (!stream) return;

    const existingTrackIds = new Set(
      pc
        .getSenders()
        .map((sender) => sender.track?.id)
        .filter((id): id is string => Boolean(id)),
    );

    stream.getTracks().forEach((track) => {
      if (!existingTrackIds.has(track.id)) {
        try {
          pc.addTrack(track, stream);
        } catch (err) {
          console.warn('[Call] Failed to add track to peer connection:', err);
        }
      }
    });
  }, []);

  const createPeerConnection = useCallback((peerUserId: string, callState: ActiveCallState) => {
    const existing = peerConnectionsRef.current.get(peerUserId);
    if (existing) {
      return existing;
    }

    const pc = new RTCPeerConnection({
      iceServers: getIceServers(),
    });

    peerConnectionsRef.current.set(peerUserId, pc);

    (pc as any).onicecandidate = (event: any) => {
      if (event.candidate && callState.sessionId && callState.callToken) {
        callService.sendIceCandidate(
          callState.sessionId,
          peerUserId,
          callState.callToken,
          event.candidate.toJSON(),
        );
      }
    };

    (pc as any).ontrack = (event: any) => {
      if (event.streams?.[0]) {
        const stream = event.streams[0] as MediaStream;
        setRemoteStreams((prev) => {
          const next = new Map(prev);
          next.set(peerUserId, stream);
          return next;
        });
      }
    };

    (pc as any).onconnectionstatechange = () => {
      console.log('[WebRTC] Connection state change:', pc.connectionState);
      if (pc.connectionState === 'connected') {
        setActiveCall((prev) => {
          if (prev && prev.status !== 'connected') {
            return { ...prev, status: 'connected', startedAt: prev.startedAt ?? new Date().toISOString() };
          }
          return prev;
        });
      }
    };

    (pc as any).oniceconnectionstatechange = () => {
      console.log('[WebRTC] ICE Connection state change:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        setActiveCall((prev) => {
          if (prev && prev.status !== 'connected') {
            return { ...prev, status: 'connected', startedAt: prev.startedAt ?? new Date().toISOString() };
          }
          return prev;
        });
      }
    };

    return pc;
  }, [getIceServers]);

  const queueIceCandidate = useCallback((peerUserId: string, candidate: unknown) => {
    const pending = pendingIceCandidatesRef.current.get(peerUserId) ?? [];
    pending.push(candidate);
    pendingIceCandidatesRef.current.set(peerUserId, pending);
  }, []);

  const flushPendingIceCandidates = useCallback(async (peerUserId: string, pc: RTCPeerConnection) => {
    if (!hasRemoteDescription(pc)) {
      return;
    }

    const pending = pendingIceCandidatesRef.current.get(peerUserId);
    if (!pending || pending.length === 0) {
      return;
    }

    pendingIceCandidatesRef.current.delete(peerUserId);

    for (const candidate of pending) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate as any));
      } catch (error) {
        console.warn('[Call] Dropped queued ICE candidate', error);
      }
    }
  }, [hasRemoteDescription]);

  // "Polite peer" pattern: the peer with the HIGHER id is the "impolite" offerer.
  // The peer with the LOWER id is "polite" and will rollback on glare.
  const isPolite = useCallback((peerUserId: string) => userId < peerUserId, [userId]);

  const createOfferForPeer = useCallback(async (peerUserId: string, callState: ActiveCallState) => {
    // Only the impolite peer (higher userId) should initiate offers.
    // The polite peer waits for the other side to send an offer.
    if (isPolite(peerUserId)) {
      console.log('[Call] Polite peer skipping offer creation, waiting for offer from', peerUserId);
      return;
    }

    const offerKey = getPeerKey(callState.sessionId, peerUserId);
    if (sentOfferKeysRef.current.has(offerKey)) {
      return;
    }

    const pc = createPeerConnection(peerUserId, callState);
    const signalingState = getSignalingState(pc);
    if (
      negotiatedPeerKeysRef.current.has(offerKey)
      || (signalingState === 'stable' && hasLocalDescription(pc) && hasRemoteDescription(pc))
    ) {
      negotiatedPeerKeysRef.current.add(offerKey);
      console.log('[Call] Skip creating offer because peer is already negotiated:', peerUserId);
      return;
    }

    if (signalingState !== 'stable') {
      console.warn('[Call] Skip creating offer because peer connection is not stable:', signalingState);
      return;
    }

    sentOfferKeysRef.current.add(offerKey);
    attachLocalTracks(pc);

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      callService.sendWebRtcOffer(callState.sessionId, peerUserId, callState.callToken, { sdp: offer.sdp, type: offer.type });
    } catch (error) {
      sentOfferKeysRef.current.delete(offerKey);
      console.error('[Call] Failed to create WebRTC offer', error);
    }
  }, [attachLocalTracks, createPeerConnection, getPeerKey, getSignalingState, hasLocalDescription, hasRemoteDescription, isPolite]);

  const startCall = useCallback(async (targetUserId: string, type: 'audio' | 'video' = 'video', conversationId?: string) => {
    if (activeCallRef.current) {
      showActiveCallConflict('Bạn đang trong cuộc gọi hiện tại.');
      return;
    }
    await initLocalStream(type === 'video');
    callService.startCall(targetUserId, conversationId, type);
  }, [initLocalStream, showActiveCallConflict]);

  const startGroupCall = useCallback(async (conversationId: string, type: 'audio' | 'video' = 'video') => {
    if (activeCallRef.current) {
      showActiveCallConflict('Bạn đang trong cuộc gọi hiện tại.');
      return;
    }
    await initLocalStream(type === 'video');
    callService.startGroupCall(conversationId, type);
  }, [initLocalStream, showActiveCallConflict]);

  const acceptCall = useCallback(async (sessionId: string, callToken: string, callerId: string, type: 'audio' | 'video' = 'video') => {
    const current = activeCallRef.current;
    if (current && current.sessionId !== sessionId) {
      showActiveCallConflict('Bạn đang trong cuộc gọi hiện tại.');
      return;
    }
    await initLocalStream(type === 'video');
    callService.acceptCall(sessionId, callToken);

    setActiveCall((prev) => {
      if (prev) {
        return { ...prev, status: 'connecting' };
      }

      return {
        sessionId,
        callToken,
        initiatedBy: callerId,
        participantIds: [callerId, userId],
        isGroupCall: false,
        direction: 'incoming',
        status: 'connecting',
        callType: type,
        startedAt: new Date().toISOString(),
      };
    });
  }, [initLocalStream, showActiveCallConflict, userId]);

  const rejectCall = useCallback((sessionId: string, callToken: string) => {
    callService.rejectCall(sessionId, callToken);
    resetCall();
  }, [resetCall]);

  const endCall = useCallback((sessionId: string, callToken: string) => {
    callService.endCall(sessionId, callToken);
    resetCall();
  }, [resetCall]);

  useEffect(() => {
    const socket = socketService.getSocket();
    if (!socket) return;

    const onCallIncoming = (data: {
      sessionId: string;
      conversationId?: string;
      conversationName?: string;
      isGroupCall?: boolean;
      fromUserId: string;
      participantIds?: string[];
      participants?: Array<{ userId: string; displayName?: string; status?: string }>;
      callType?: 'audio' | 'video';
      callToken: string;
    }) => {
      if (activeCallRef.current && activeCallRef.current.sessionId !== data.sessionId) {
        showActiveCallConflict('Bạn đang trong cuộc gọi hiện tại.');
        callService.rejectCall(data.sessionId, data.callToken, 'busy');
        return;
      }

      setActiveCall({
        sessionId: data.sessionId,
        conversationId: data.conversationId,
        conversationName: data.conversationName,
        isGroupCall: Boolean(data.isGroupCall),
        initiatedBy: data.fromUserId,
        participantIds: data.participantIds || [data.fromUserId, userId],
        participants: data.participants,
        direction: 'incoming',
        status: 'incoming',
        callToken: data.callToken,
        callType: data.callType ?? 'video',
      });
    };

    const onCallInvited = (data: {
      sessionId: string;
      conversationId?: string;
      conversationName?: string;
      isGroupCall?: boolean;
      targetUserId?: string;
      participantIds?: string[];
      participants?: Array<{ userId: string; displayName?: string; status?: string }>;
      callType?: 'audio' | 'video';
      callToken: string;
    }) => {
      setActiveCall({
        sessionId: data.sessionId,
        conversationId: data.conversationId,
        conversationName: data.conversationName,
        isGroupCall: Boolean(data.isGroupCall),
        initiatedBy: userId,
        participantIds: data.participantIds || [data.targetUserId || '', userId].filter(Boolean),
        participants: data.participants,
        direction: 'outgoing',
        status: 'outgoing',
        callToken: data.callToken,
        callType: data.callType ?? 'video',
        startedAt: new Date().toISOString(),
      });
    };

    const onCallStatus = async (data: {
      sessionId: string;
      status: CallUiStatus;
      reason?: string;
    }) => {
      const currentCall = activeCallRef.current;
      if (!currentCall || currentCall.sessionId !== data.sessionId) return;

      setActiveCall((prev) => (prev ? {
        ...prev,
        status: data.status,
        reason: data.reason,
        startedAt: data.status === 'connected' ? (prev.startedAt ?? new Date().toISOString()) : prev.startedAt,
      } : null));

      if (data.status === 'connecting' || data.status === 'connected') {
        // Both sides attempt to create offers. The polite peer guard inside
        // createOfferForPeer will skip if this peer should wait instead.
        const peers = currentCall.participantIds.filter((id) => id && id !== userId);
        for (const peerId of peers) {
          await createOfferForPeer(peerId, currentCall);
        }
      } else if (data.status === 'ended' || data.status === 'missed' || data.status === 'rejected') {
        setTimeout(() => resetCall(), 1500);
      }
    };

    const onCallParticipantJoined = async (data: {
      sessionId: string;
      userId: string;
      joinedParticipantIds?: string[];
    }) => {
      const currentCall = activeCallRef.current;
      if (!currentCall || currentCall.sessionId !== data.sessionId) return;

      setActiveCall((prev) => {
        if (!prev) return prev;

        const nextStatus = prev.status === 'outgoing' || prev.status === 'incoming' ? 'connecting' : prev.status;

        if (Array.isArray(data.joinedParticipantIds) && data.joinedParticipantIds.length > 0) {
          return { ...prev, participantIds: data.joinedParticipantIds, status: nextStatus };
        }

        if (!prev.participantIds.includes(data.userId)) {
          return { ...prev, participantIds: [...prev.participantIds, data.userId], status: nextStatus };
        }

        return { ...prev, status: nextStatus };
      });

      if (data.userId !== userId) {
        await createOfferForPeer(data.userId, currentCall);
      }
    };

    const onCallParticipantLeft = (data: {
      sessionId: string;
      userId: string;
    }) => {
      const currentCall = activeCallRef.current;
      if (!currentCall || currentCall.sessionId !== data.sessionId) return;

      closePeerConnection(data.userId);
      setRemoteStreams((prev) => {
        const next = new Map(prev);
        const stream = next.get(data.userId);
        if (stream) {
          stream.getTracks().forEach((track) => track.stop());
        }
        next.delete(data.userId);
        return next;
      });

      setActiveCall((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          participantIds: prev.participantIds.filter((id) => id !== data.userId),
        };
      });

      if (!currentCall.isGroupCall || currentCall.participantIds.length <= 2) {
        setTimeout(() => resetCall(), 1500);
      }
    };

    const onWebRtcOffer = async (data: {
      sessionId: string;
      fromUserId: string;
      sdp: unknown;
    }) => {
      const currentCall = activeCallRef.current;
      if (!currentCall || currentCall.sessionId !== data.sessionId) return;

      const offerKey = `${data.sessionId}:${data.fromUserId}:${getSdpFingerprint(data.sdp)}`;
      if (answeredOfferKeysRef.current.has(offerKey) || processingOfferKeysRef.current.has(offerKey)) {
        return;
      }

      const pc = createPeerConnection(data.fromUserId, currentCall);
      const signalingState = getSignalingState(pc);

      // Glare handling: both sides sent offers simultaneously.
      if (signalingState === 'have-local-offer') {
        if (isPolite(data.fromUserId)) {
          // We are polite → rollback our offer and accept theirs
          console.log('[Call] Polite peer rolling back local offer to accept incoming offer from', data.fromUserId);
          try {
            await pc.setLocalDescription({ type: 'rollback' } as any);
            // Clear our sent offer key so we can re-offer later if needed
            const ourOfferKey = getPeerKey(currentCall.sessionId, data.fromUserId);
            sentOfferKeysRef.current.delete(ourOfferKey);
          } catch (rollbackError) {
            console.error('[Call] Failed to rollback local offer, closing and recreating PC', rollbackError);
            // If rollback fails, close and recreate the peer connection
            closePeerConnection(data.fromUserId);
            const newPc = createPeerConnection(data.fromUserId, currentCall);
            attachLocalTracks(newPc);
            processingOfferKeysRef.current.add(offerKey);
            try {
              await newPc.setRemoteDescription(new RTCSessionDescription(data.sdp as any));
              await flushPendingIceCandidates(data.fromUserId, newPc);
              const answer = await newPc.createAnswer();
              await newPc.setLocalDescription(answer);
              answeredOfferKeysRef.current.add(offerKey);
              negotiatedPeerKeysRef.current.add(getPeerKey(currentCall.sessionId, data.fromUserId));
              callService.sendWebRtcAnswer(currentCall.sessionId, data.fromUserId, currentCall.callToken, { sdp: answer.sdp, type: answer.type });
            } catch (error) {
              console.error('[Call] Failed to handle WebRTC offer after PC recreation', error);
            } finally {
              processingOfferKeysRef.current.delete(offerKey);
            }
            return;
          }
        } else {
          // We are impolite → ignore their offer, our offer wins
          console.log('[Call] Impolite peer ignoring incoming offer during glare from', data.fromUserId);
          return;
        }
      } else if (signalingState !== 'stable') {
        console.warn('[Call] Skip WebRTC offer in unexpected state:', signalingState);
        return;
      }

      processingOfferKeysRef.current.add(offerKey);
      attachLocalTracks(pc);

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp as any));
        await flushPendingIceCandidates(data.fromUserId, pc);

        if (getSignalingState(pc) !== 'have-remote-offer') {
          console.warn('[Call] Skip WebRTC answer because signaling state is not have-remote-offer:', getSignalingState(pc));
          return;
        }

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        answeredOfferKeysRef.current.add(offerKey);
        negotiatedPeerKeysRef.current.add(getPeerKey(currentCall.sessionId, data.fromUserId));
        callService.sendWebRtcAnswer(currentCall.sessionId, data.fromUserId, currentCall.callToken, { sdp: answer.sdp, type: answer.type });
      } catch (error) {
        console.error('[Call] Failed to handle WebRTC offer', error);
      } finally {
        processingOfferKeysRef.current.delete(offerKey);
      }
    };

    const onWebRtcAnswer = async (data: {
      sessionId: string;
      fromUserId: string;
      sdp: unknown;
    }) => {
      const currentCall = activeCallRef.current;
      if (!currentCall || currentCall.sessionId !== data.sessionId) return;

      const pc = peerConnectionsRef.current.get(data.fromUserId);
      if (!pc) return;

      if (getSignalingState(pc) !== 'have-local-offer') {
        console.warn('[Call] Skip duplicated or out-of-order WebRTC answer:', getSignalingState(pc));
        return;
      }

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp as any));
        negotiatedPeerKeysRef.current.add(getPeerKey(currentCall.sessionId, data.fromUserId));
        await flushPendingIceCandidates(data.fromUserId, pc);
      } catch (error) {
        console.warn('[Call] Ignored stale WebRTC answer; will wait for a fresh offer if needed', error);
        sentOfferKeysRef.current.delete(getPeerKey(currentCall.sessionId, data.fromUserId));
      }
    };

    const onWebRtcIceCandidate = async (data: {
      sessionId: string;
      fromUserId: string;
      candidate: unknown;
    }) => {
      const currentCall = activeCallRef.current;
      if (!currentCall || currentCall.sessionId !== data.sessionId) return;

      const pc = peerConnectionsRef.current.get(data.fromUserId);
      if (!pc) return;

      if (!hasRemoteDescription(pc)) {
        queueIceCandidate(data.fromUserId, data.candidate);
        return;
      }

      try {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate as any));
      } catch (error) {
        console.warn('[Call] Dropped ICE candidate', error);
      }
    };

    const onSocketError = (data: { message: string; code?: string }) => {
      if (data.code === 'ACTIVE_CALL_EXISTS') {
        showActiveCallConflict(data.message || 'Bạn đang trong cuộc gọi hiện tại.');
        return;
      }

      if (data.code === 'GROUP_CALL_REQUIRES_PARTICIPANTS') {
        showActiveCallConflict('Nhóm cần ít nhất 2 thành viên để bắt đầu cuộc gọi.');
      }
    };
    
    const onCallMediaState = (data: { sessionId: string; userId: string; isMicMuted?: boolean; isCameraOff?: boolean; isScreenSharing?: boolean }) => {
      if (activeCallRef.current && activeCallRef.current.sessionId === data.sessionId) {
        setParticipantMediaStates((prev) => ({
          ...prev,
          [data.userId]: {
            ...prev[data.userId],
            isMicMuted: data.isMicMuted ?? prev[data.userId]?.isMicMuted,
            isCameraOff: data.isCameraOff ?? prev[data.userId]?.isCameraOff,
            isScreenSharing: data.isScreenSharing ?? prev[data.userId]?.isScreenSharing,
          }
        }));
      }
    };

    socketService.listenToCallIncoming(onCallIncoming as any);
    socketService.listenToCallInvited(onCallInvited as any);
    socketService.listenToCallStatus(onCallStatus as any);
    socketService.listenToCallParticipantJoined(onCallParticipantJoined as any);
    socketService.listenToCallParticipantLeft(onCallParticipantLeft as any);
    socketService.listenToWebRtcOffer(onWebRtcOffer as any);
    socketService.listenToWebRtcAnswer(onWebRtcAnswer as any);
    socketService.listenToWebRtcIceCandidate(onWebRtcIceCandidate as any);
    socketService.listenToCallMediaState(onCallMediaState as any);
    socketService.listenToErrors(onSocketError);

    return () => {
      socketService.unlistenToCallIncoming(onCallIncoming);
      socketService.unlistenToCallInvited(onCallInvited);
      socketService.unlistenToCallStatus(onCallStatus);
      socketService.unlistenToCallParticipantJoined(onCallParticipantJoined);
      socketService.unlistenToCallParticipantLeft(onCallParticipantLeft);
      socketService.unlistenToWebRtcOffer(onWebRtcOffer);
      socketService.unlistenToWebRtcAnswer(onWebRtcAnswer);
      socketService.unlistenToWebRtcIceCandidate(onWebRtcIceCandidate);
      socketService.unlistenToCallMediaState(onCallMediaState);
      socketService.unlistenToErrors(onSocketError);
    };
  }, [
    attachLocalTracks,
    closePeerConnection,
    createOfferForPeer,
    createPeerConnection,
    flushPendingIceCandidates,
    getPeerKey,
    getSdpFingerprint,
    getSignalingState,
    hasRemoteDescription,
    queueIceCandidate,
    resetCall,
    showActiveCallConflict,
    socketReadyVersion,
    userId,
  ]);

  return {
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
    toggleMute: useCallback(() => {
      if (localStreamRef.current) {
        const audioTrack = localStreamRef.current.getAudioTracks()[0];
        if (audioTrack) {
          const nextMuted = audioTrack.enabled; // If enabled is true, we are muting it
          audioTrack.enabled = !audioTrack.enabled;
          setIsMicMuted(nextMuted);
          
          if (activeCallRef.current?.sessionId && activeCallRef.current?.callToken) {
            socketService.emitCallMediaState(activeCallRef.current.sessionId, activeCallRef.current.callToken, {
              isMicMuted: nextMuted
            });
          }
        }
      }
    }, []),
    toggleCamera: useCallback(() => {
      if (localStreamRef.current) {
        const videoTrack = localStreamRef.current.getVideoTracks()[0];
        if (videoTrack) {
          const nextEnabled = !videoTrack.enabled;
          videoTrack.enabled = nextEnabled;
          setIsCameraEnabled(nextEnabled);
          
          if (activeCallRef.current?.sessionId && activeCallRef.current?.callToken) {
            socketService.emitCallMediaState(activeCallRef.current.sessionId, activeCallRef.current.callToken, {
              isCameraOff: !nextEnabled
            });
          }
        }
      }
    }, []),
    switchCamera: useCallback(() => {
      if (localStreamRef.current) {
        const videoTrack = localStreamRef.current.getVideoTracks()[0] as any;
        if (videoTrack && typeof videoTrack._switchCamera === 'function') {
          videoTrack._switchCamera();
        }
      }
    }, []),
  };
}
