import type { AiReminder } from '@zync/shared-types';
import { apiClient } from './api';

interface ApiDataResponse<T> {
  success: boolean;
  data: T;
}

export interface CreateReminderInput {
  conversationId: string;
  digestId?: string;
  sourceMessageRefs?: string[];
  title: string;
  description?: string;
  dueAt?: string;
  createdBy?: 'ai_suggestion' | 'user';
  status?: 'suggested' | 'accepted' | 'done' | 'dismissed';
}

export async function createReminder(input: CreateReminderInput): Promise<AiReminder> {
  const { data } = await apiClient.post<ApiDataResponse<AiReminder>>('/api/ai/reminders', input);
  return data.data;
}

export async function getReminders(filters?: {
  conversationId?: string;
  status?: string;
}): Promise<AiReminder[]> {
  const params = new URLSearchParams();
  if (filters?.conversationId) params.set('conversationId', filters.conversationId);
  if (filters?.status) params.set('status', filters.status);

  const query = params.toString();
  const url = `/api/ai/reminders${query ? `?${query}` : ''}`;
  const { data } = await apiClient.get<ApiDataResponse<AiReminder[]>>(url);
  return data.data;
}

export async function getReminder(reminderId: string): Promise<AiReminder> {
  const { data } = await apiClient.get<ApiDataResponse<AiReminder>>(`/api/ai/reminders/${reminderId}`);
  return data.data;
}

export async function updateReminder(
  reminderId: string,
  input: {
    status?: 'suggested' | 'accepted' | 'done' | 'dismissed';
    title?: string;
    description?: string;
    dueAt?: string | null;
  },
): Promise<AiReminder> {
  const { data } = await apiClient.patch<ApiDataResponse<AiReminder>>(
    `/api/ai/reminders/${reminderId}`,
    input,
  );
  return data.data;
}

export async function deleteReminder(reminderId: string): Promise<void> {
  await apiClient.delete(`/api/ai/reminders/${reminderId}`);
}

export async function createReminderFromActionItem(
  conversationId: string,
  actionItem: { text: string; sourceMessageRefs: string[] },
  digestId?: string,
): Promise<AiReminder> {
  return createReminder({
    conversationId,
    digestId,
    sourceMessageRefs: actionItem.sourceMessageRefs,
    title: actionItem.text,
    createdBy: 'ai_suggestion',
    status: 'accepted',
  });
}
