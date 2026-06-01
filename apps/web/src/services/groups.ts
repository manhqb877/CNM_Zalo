import { apiClient } from './api';

export interface GroupMemberUser {
  _id: string;
  displayName: string;
  avatarUrl?: string;
}

export interface GroupConversation {
  _id: string;
  type: 'group';
  name?: string;
  avatarUrl?: string;
  createdBy: string;
  adminIds: string[];
  memberApprovalEnabled: boolean;
  users: GroupMemberUser[];
  updatedAt: string;
}

export interface CreateGroupPayload {
  name: string;
  memberIds: string[];
  avatarUrl?: string;
  category?: string;
  tags?: string[];
  description?: string;
  rules?: string;
  isPublic?: boolean;
}

export interface AddGroupMembersPayload {
  memberIds: string[];
}

export interface UpdateGroupMemberRolePayload {
  role: 'admin' | 'member';
}

export interface UpdateGroupPayload {
  name?: string;
  avatarUrl?: string | null;
}

export interface UpdateGroupMemberApprovalPayload {
  memberApprovalEnabled: boolean;
}

export async function createGroup(payload: CreateGroupPayload): Promise<GroupConversation> {
  const { data } = await apiClient.post<{ success: boolean; data: GroupConversation }>('/api/groups', payload);
  return data.data;
}

export async function addGroupMembers(groupId: string, payload: AddGroupMembersPayload): Promise<GroupConversation> {
  const { data } = await apiClient.post<{ success: boolean; data: GroupConversation }>(`/api/groups/${groupId}/members`, payload);
  return data.data;
}

export async function updateGroup(groupId: string, payload: UpdateGroupPayload): Promise<GroupConversation> {
  const { data } = await apiClient.patch<{ success: boolean; data: GroupConversation }>(`/api/groups/${groupId}`, payload);
  return data.data;
}

export async function updateGroupMemberRole(
  groupId: string,
  userId: string,
  payload: UpdateGroupMemberRolePayload,
): Promise<GroupConversation> {
  const { data } = await apiClient.patch<{ success: boolean; data: GroupConversation }>(
    `/api/groups/${groupId}/members/${userId}/role`,
    payload,
  );
  return data.data;
}

export async function removeGroupMember(groupId: string, userId: string): Promise<GroupConversation> {
  const { data } = await apiClient.delete<{ success: boolean; data: GroupConversation }>(
    `/api/groups/${groupId}/members/${userId}`,
  );
  return data.data;
}

export async function updateGroupMemberApproval(
  groupId: string,
  payload: UpdateGroupMemberApprovalPayload,
): Promise<GroupConversation> {
  const { data } = await apiClient.patch<{ success: boolean; data: GroupConversation }>(
    `/api/groups/${groupId}/member-approval`,
    payload,
  );
  return data.data;
}

export async function disbandGroup(groupId: string): Promise<void> {
  await apiClient.delete(`/api/groups/${groupId}`);
}

export async function leaveGroup(groupId: string): Promise<{ disbanded: boolean; groupId: string }> {
  const { data } = await apiClient.delete<{ success: boolean; disbanded: boolean; groupId: string }>(
    `/api/groups/${groupId}/members/me`,
  );
  return { disbanded: data.disbanded, groupId: data.groupId };
}
