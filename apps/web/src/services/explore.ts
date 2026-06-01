import { apiClient } from './api';
import type { GroupConversation } from './groups';

export interface DiscoverUser {
  id: string;
  username?: string;
  displayName: string;
  avatarUrl?: string;
  bio?: string;
  skills?: string[];
  interests?: string[];
  devRole?: string;
  githubUrl?: string;
  friendCount: number;
}

export async function fetchExploreChannels(): Promise<GroupConversation[]> {
  const { data } = await apiClient.get<{ success: boolean; data: GroupConversation[] }>('/api/groups/discover');
  return data.data;
}

export async function fetchPublicChannels(): Promise<GroupConversation[]> {
  const { data } = await apiClient.get<{ success: boolean; data: GroupConversation[] }>('/api/groups/public');
  return data.data;
}

export async function joinPublicChannel(channelId: string): Promise<GroupConversation> {
  const { data } = await apiClient.post<{ success: boolean; data: GroupConversation }>(`/api/groups/${channelId}/join`);
  return data.data;
}

export async function fetchDiscoverUsers(): Promise<DiscoverUser[]> {
  const { data } = await apiClient.get<{ success: boolean; data: DiscoverUser[] }>('/api/users/discover');
  return data.data;
}
