'use client';

// Define the shape based on useHomeDashboard's activeCall
export interface CallSessionState {
  sessionId: string;
  conversationId: string | null;
  conversationName?: string | null;
  participants?: Array<{
    userId: string;
    displayName?: string;
    status?: string;
    joinedAt?: string | Date | null;
    leftAt?: string | Date | null;
  }>;
  isGroupCall: boolean;
  initiatedBy: string;
  participantIds: string[];
  joinedParticipantIds: string[];
  participantDisplayNames: Record<string, string>;
  direction: 'incoming' | 'outgoing';
  status: 'ringing' | 'connecting' | 'connected' | 'ended' | 'missed' | 'rejected' | 'outgoing' | 'incoming';
  reason?: string;
  callToken: string;
  callType?: 'audio' | 'video';
  startedAt?: string | null;
  timeoutAt?: string | null;
}

export interface ActiveCallConflictState {
  visible: boolean;
  message?: string;
}

type CallStore = {
  activeCall: CallSessionState | null;
  conflict: ActiveCallConflictState;
  setActiveCall: (updater: CallSessionState | null | ((prev: CallSessionState | null) => CallSessionState | null)) => void;
  showActiveCallConflict: (message?: string) => void;
  hideActiveCallConflict: () => void;
};

let _activeCall: CallSessionState | null = null;
let _conflict: ActiveCallConflictState = { visible: false };
let _listeners: Array<(activeCall: CallSessionState | null) => void> = [];
let _conflictListeners: Array<(conflict: ActiveCallConflictState) => void> = [];

function notify() {
  for (const listener of _listeners) {
    listener(_activeCall);
  }
}

function notifyConflict() {
  for (const listener of _conflictListeners) {
    listener(_conflict);
  }
}

export const callStore: CallStore = {
  get activeCall() {
    return _activeCall;
  },
  get conflict() {
    return _conflict;
  },
  setActiveCall(updater) {
    if (typeof updater === 'function') {
      _activeCall = updater(_activeCall);
    } else {
      _activeCall = updater;
    }
    if (!_activeCall) {
      _conflict = { visible: false };
      notifyConflict();
    }
    notify();
  },
  showActiveCallConflict(message) {
    _conflict = { visible: true, message };
    notifyConflict();
  },
  hideActiveCallConflict() {
    _conflict = { visible: false };
    notifyConflict();
  },
};

export function subscribeToCallStore(
  listener: (activeCall: CallSessionState | null) => void,
): () => void {
  _listeners.push(listener);
  listener(_activeCall);
  return () => {
    _listeners = _listeners.filter((l) => l !== listener);
  };
}

export function subscribeToCallConflictStore(
  listener: (conflict: ActiveCallConflictState) => void,
): () => void {
  _conflictListeners.push(listener);
  listener(_conflict);
  return () => {
    _conflictListeners = _conflictListeners.filter((l) => l !== listener);
  };
}
