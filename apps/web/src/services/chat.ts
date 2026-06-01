import { apiClient } from './api';
import type { Message } from '@zync/shared-types';

// ==================== TYPES ====================

export interface GetMessagesResponse {
  messages: Message[];
  nextCursor?: string;
}

export interface UploadSignatureResponse {
  signature: string;
  timestamp: number;
  cloudName: string;
  apiKey: string;
  folder: string;
  publicIdPrefix: string;
}

export interface VerifyUploadResponse {
  url: string;
  secureUrl: string;
  size: number;
}

export interface ReactionSummaryResponse {
  success: boolean;
  messageId: string;
  conversationId: string;
  summary: {
    totalCount: number;
    emojiCounts: Record<string, number>;
  };
}

export interface ReactionDetailsResponse {
  success: boolean;
  messageId: string;
  conversationId: string;
  tabs: Array<{ emoji: string; count: number }>;
  rows: Array<{
    userId: string;
    displayName: string;
    avatarUrl?: string;
    lastEmoji: string | null;
    totalCount: number;
    emojiCounts: Record<string, number>;
  }>;
}

// ==================== MESSAGE ENDPOINTS ====================

/**
 * Fetch messages for a conversation with cursor-based pagination
 */
export async function getMessages(
  conversationId: string,
  cursor?: string,
  limit: number = 20,
): Promise<GetMessagesResponse> {
  const params = new URLSearchParams();
  if (cursor) params.append('cursor', cursor);
  params.append('limit', limit.toString());

  const { data } = await apiClient.get<GetMessagesResponse>(
    `/api/messages/${conversationId}?${params.toString()}`,
  );
  return data;
}

/**
 * Mark messages as read
 */
export async function markMessagesAsRead(
  messageIds: string[],
): Promise<{ success: boolean }> {
  const { data } = await apiClient.post<{ success: boolean }>(
    `/api/messages/batch/read`,
    { messageIds },
  );
  return data;
}

/**
 * Mark messages as delivered
 */
export async function markMessagesAsDelivered(
  _conversationId: string,
  messageIds: string[],
): Promise<{ success: boolean }> {
  await Promise.all(
    messageIds.map((messageId) =>
      apiClient.put(`/api/messages/${messageId}/status`, {
        status: 'delivered',
      }),
    ),
  );

  return { success: true };
}

export async function getMessageReactionSummary(messageRef: string): Promise<ReactionSummaryResponse> {
  const { data } = await apiClient.get<ReactionSummaryResponse>(
    `/api/messages/${messageRef}/reactions/summary`,
  );
  return data;
}

export async function getMessageReactionDetails(messageRef: string): Promise<ReactionDetailsResponse> {
  const { data } = await apiClient.get<ReactionDetailsResponse>(
    `/api/messages/${messageRef}/reactions/details`,
  );
  return data;
}

/**
 * React to a message
 */
export async function reactMessage(messageId: string, reactionType: string): Promise<{ success: boolean; action: string }> {
  const { data } = await apiClient.post(`/api/messages/${messageId}/react`, { reactionType });
  return data;
}

// ==================== UPLOAD ENDPOINTS ====================

/**
 * Generate pre-signed Cloudinary upload signature
 */
export async function generateUploadSignature(
  type: 'image' | 'video' | 'document',
): Promise<UploadSignatureResponse> {
  const { data } = await apiClient.post<UploadSignatureResponse>(
    '/api/upload/generate-signature',
    { type },
  );
  return data;
}

/**
 * Verify upload completion and get URL
 */
export async function verifyUpload(publicId: string, type: 'image' | 'video' | 'document'): Promise<VerifyUploadResponse> {
  const { data } = await apiClient.post<VerifyUploadResponse>('/api/upload/verify', {
    publicId,
    type,
  });
  return data;
}
