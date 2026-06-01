import { socketService } from './socket';
import api from './api';

export async function fetchActiveCall() {
  const response = await api.get('/calls/active');
  return response.data?.data ?? null;
}

export const callService = {
  fetchActiveCall,
  startCall: (targetUserId: string, conversationId?: string, callType: 'audio' | 'video' = 'video') => {
    socketService.emitCallInvite(targetUserId, conversationId, callType);
  },

  startGroupCall: (conversationId: string, callType: 'audio' | 'video' = 'video') => {
    socketService.emitCallGroupInvite(conversationId, callType);
  },

  acceptCall: (sessionId: string, callToken: string) => {
    socketService.emitCallAccept(sessionId, callToken);
  },

  rejectCall: (sessionId: string, callToken: string, reason: 'rejected' | 'busy' = 'rejected') => {
    socketService.emitCallReject(sessionId, callToken, reason);
  },

  endCall: (sessionId: string, callToken: string, reason: string = 'ended') => {
    socketService.emitCallEnd(sessionId, callToken, reason);
  },

  sendWebRtcOffer: (sessionId: string, toUserId: string, callToken: string, sdp: unknown) => {
    socketService.emitWebRtcOffer(sessionId, toUserId, callToken, sdp);
  },

  sendWebRtcAnswer: (sessionId: string, toUserId: string, callToken: string, sdp: unknown) => {
    socketService.emitWebRtcAnswer(sessionId, toUserId, callToken, sdp);
  },

  sendIceCandidate: (sessionId: string, toUserId: string, callToken: string, candidate: unknown) => {
    socketService.emitWebRtcIceCandidate(sessionId, toUserId, callToken, candidate);
  },
};
