import type { AiCatchupDigest, AiCatchupDigestTrigger } from '@zync/shared-types';
import { apiClient } from './api';

interface ApiDataResponse<T> {
  success: boolean;
  data: T;
}

export interface CreateAiCatchupDigestInput {
  trigger?: AiCatchupDigestTrigger;
  unreadCountHint?: number;
  toMessageRef?: string;
}

export async function createAiCatchupDigest(
  conversationId: string,
  input: CreateAiCatchupDigestInput = {},
): Promise<AiCatchupDigest> {
  const { data } = await apiClient.post<ApiDataResponse<AiCatchupDigest>>(
    `/api/ai/catchup/conversations/${conversationId}/digests`,
    input,
  );
  return data.data;
}

export async function getLatestAiCatchupDigest(
  conversationId: string,
): Promise<AiCatchupDigest | null> {
  const { data } = await apiClient.get<ApiDataResponse<AiCatchupDigest | null>>(
    `/api/ai/catchup/conversations/${conversationId}/digests/latest`,
  );
  return data.data;
}

export async function regenerateAiCatchupDigest(digestId: string): Promise<AiCatchupDigest> {
  const { data } = await apiClient.post<ApiDataResponse<AiCatchupDigest>>(
    `/api/ai/catchup/digests/${digestId}/regenerate`,
  );
  return data.data;
}

export async function updateAiCatchupSettings(
  conversationId: string,
  catchupEnabled: boolean,
): Promise<{ catchupEnabled: boolean }> {
  const { data } = await apiClient.patch<ApiDataResponse<{ catchupEnabled: boolean }>>(
    `/api/ai/catchup/conversations/${conversationId}/settings`,
    { catchupEnabled },
  );
  return data.data;
}
