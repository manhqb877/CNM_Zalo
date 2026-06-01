'use client';

export const ACTIVE_CONVERSATION_EVENT = 'zync:active-conversation-change';

let activeConversationId = '';

declare global {
  interface Window {
    __zyncActiveConversationId?: string;
  }
}

export function setActiveConversationId(conversationId: string | null | undefined): void {
  activeConversationId = conversationId ?? '';

  if (typeof window === 'undefined') {
    return;
  }

  window.__zyncActiveConversationId = activeConversationId;
  window.dispatchEvent(new CustomEvent(ACTIVE_CONVERSATION_EVENT, {
    detail: { conversationId: activeConversationId },
  }));
}

export function getActiveConversationId(): string {
  if (typeof window !== 'undefined') {
    return window.__zyncActiveConversationId ?? activeConversationId;
  }

  return activeConversationId;
}

export function isConversationVisible(conversationId?: string): boolean {
  if (!conversationId || typeof window === 'undefined') {
    return false;
  }

  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
    return false;
  }

  return window.location.pathname.startsWith('/chat') && getActiveConversationId() === conversationId;
}
