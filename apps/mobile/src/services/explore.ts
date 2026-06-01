import api from './api';

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

export interface ExploreChannel {
  _id: string;
  name: string;
  description: string;
  memberCount: number;
  isPrivate: boolean;
  avatarUrl?: string;
  createdAt: string;
}

export interface GroupConversation {
  _id: string;
  name: string;
  description?: string;
  memberCount: number;
  isPrivate: boolean;
  avatarUrl?: string;
  createdAt: string;
}

export async function fetchExploreChannels(): Promise<GroupConversation[]> {
  const { data } = await api.get<{
    success: boolean;
    data: GroupConversation[];
  }>('/groups/discover');
  return data.data;
}

export async function fetchPublicChannels(): Promise<GroupConversation[]> {
  const { data } = await api.get<{
    success: boolean;
    data: GroupConversation[];
  }>('/groups/public');
  return data.data;
}

export async function joinPublicChannel(
  channelId: string
): Promise<GroupConversation> {
  const { data } = await api.post<{
    success: boolean;
    data: GroupConversation;
  }>(`/groups/${channelId}/join`);
  return data.data;
}

export async function fetchDiscoverUsers(): Promise<DiscoverUser[]> {
  const { data } = await api.get<{
    success: boolean;
    data: DiscoverUser[];
  }>('/users/discover');
  return data.data;
}

export async function searchExplore(
  query: string
): Promise<{
  channels: GroupConversation[];
  users: DiscoverUser[];
}> {
  const { data } = await api.get<{
    success: boolean;
    data: { channels: GroupConversation[]; users: DiscoverUser[] };
  }>('/groups/explore', { params: { q: query } });
  return data.data;
}
