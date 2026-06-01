import { apiClient } from "./api";

export interface FriendRequestItem {
  requestId: string;
  userId: string;
  displayName: string;
  username?: string;
  avatarUrl?: string;
  createdAt: string;
}

export interface FriendUser {
  id: string;
  username?: string;
  displayName: string;
  email?: string;
  avatarUrl?: string;
  bio?: string;
  status?: "online" | "offline" | "away";
}

export async function fetchFriends(
  cursor?: string,
): Promise<{ friends: FriendUser[]; nextCursor: string | null }> {
  const { data } = await apiClient.get<{
    success: boolean;
    friends: FriendUser[];
    nextCursor: string | null;
  }>("/api/friends", {
    params: { limit: 20, cursor },
  });
  return { friends: data.friends, nextCursor: data.nextCursor };
}

export async function fetchFriendRequests(): Promise<{
  incoming: FriendRequestItem[];
  outgoing: FriendRequestItem[];
}> {
  const { data } = await apiClient.get<{
    success: boolean;
    incoming: FriendRequestItem[];
    outgoing: FriendRequestItem[];
  }>("/api/friends/requests");
  return { incoming: data.incoming, outgoing: data.outgoing };
}

export async function searchFriendCandidates(
  query: string,
): Promise<FriendUser[]> {
  const { data } = await apiClient.get<{
    success: boolean;
    users?: FriendUser[];
  }>("/api/users/search", {
    params: { query, limit: 10 },
  });
  return Array.isArray(data.users) ? data.users : [];
}

export async function sendFriendRequest(toUserId: string): Promise<void> {
  await apiClient.post("/api/friends/request", { toUserId });
}

export async function acceptFriendRequest(requestId: string): Promise<void> {
  await apiClient.put(`/api/friends/request/${requestId}/accept`);
}

export async function rejectFriendRequest(requestId: string): Promise<void> {
  await apiClient.put(`/api/friends/request/${requestId}/reject`);
}

export async function unfriend(friendId: string): Promise<void> {
  await apiClient.delete(`/api/friends/${friendId}`);
}

export async function blockUser(userId: string): Promise<void> {
  await apiClient.post(`/api/friends/${userId}/block`);
}

export async function unblockUser(userId: string): Promise<void> {
  await apiClient.delete(`/api/friends/${userId}/block`);
}
