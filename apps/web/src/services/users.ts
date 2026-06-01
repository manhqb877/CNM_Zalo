import { apiClient } from './api';

export interface MeUser {
  _id: string;
  username?: string;
  displayName: string;
  email?: string;
  avatarUrl?: string;
  bio?: string;
  devRole?: string;
  skills?: string[];
  interests?: string[];
  githubUrl?: string;
  linkedinUrl?: string;
  portfolioUrl?: string;
  onboardingCompleted?: boolean;
  createdAt?: string;
  globalViolationCount?: number;
  trustScore?: number;
  toastNotifications?: boolean;
  allowSearchProfile?: boolean;
  allowFriendRequest?: boolean;
  showOnlineStatus?: boolean;
  isOnline?: boolean;
  lastSeenAt?: string | null;
}

export interface PublicUserProfile {
  _id: string;
  username?: string;
  displayName: string;
  avatarUrl?: string;
  bio?: string;
  devRole?: string;
  skills?: string[];
  interests?: string[];
  githubUrl?: string;
  linkedinUrl?: string;
  portfolioUrl?: string;
  emailMasked?: string;
  friendCount: number;
  mutualFriends: number;
  createdAt?: string;
}

export interface UpdateMyProfilePayload {
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  bio?: string;
  devRole?: string;
  skills?: string[];
  interests?: string[];
  githubUrl?: string;
  linkedinUrl?: string;
  portfolioUrl?: string;
  onboardingCompleted?: boolean;
}

export async function fetchMyProfile(): Promise<MeUser> {
  const { data } = await apiClient.get<{ success: boolean; user: MeUser }>('/api/users/me');
  return data.user;
}

export async function updateMyProfile(payload: UpdateMyProfilePayload): Promise<MeUser> {
  const { data } = await apiClient.patch<{ success: boolean; user: MeUser }>('/api/users/me', payload);
  return data.user;
}

/** Lấy profile công khai của user khác (masked PII + friend count + mutual friends) */
export async function fetchUserProfile(userId: string): Promise<PublicUserProfile> {
  const { data } = await apiClient.get<{ success: boolean; user: PublicUserProfile }>(`/api/users/${userId}`);
  return data.user;
}

/** Đếm tổng số bạn bè (của user hiện tại) */
export async function fetchFriendsCount(): Promise<number> {
  const { data } = await apiClient.get<{ success: boolean; count: number }>('/api/friends/count');
  return data.count;
}