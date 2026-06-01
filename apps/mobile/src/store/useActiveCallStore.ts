import { create } from 'zustand';

export type MobileActiveCallStatus = 'outgoing' | 'incoming' | 'ringing' | 'connecting' | 'connected' | 'ended' | 'missed' | 'rejected';

export interface MobileActiveCall {
  sessionId: string;
  conversationId?: string | null;
  conversationName?: string | null;
  callType: 'audio' | 'video';
  isGroupCall: boolean;
  participants: Array<{ userId: string; displayName?: string; status?: string }>;
  participantIds: string[];
  startedAt?: string | null;
  status: MobileActiveCallStatus;
  callToken: string;
  initiatedBy?: string;
}

interface ActiveCallStore {
  activeCall: MobileActiveCall | null;
  conflictVisible: boolean;
  conflictMessage?: string;
  setActiveCall: (call: MobileActiveCall | null) => void;
  showConflict: (message?: string) => void;
  hideConflict: () => void;
}

export const useActiveCallStore = create<ActiveCallStore>((set) => ({
  activeCall: null,
  conflictVisible: false,
  setActiveCall: (call) => set(call ? { activeCall: call } : { activeCall: null, conflictVisible: false, conflictMessage: undefined }),
  showConflict: (message) => set({ conflictVisible: true, conflictMessage: message }),
  hideConflict: () => set({ conflictVisible: false, conflictMessage: undefined }),
}));
