import { apiClient } from './api';

export interface Notification {
  _id: string;
  userId: string;
  type: 'new_message' | 'friend_request' | 'friend_accepted' | 'group_invite' | 'group_update' | 'post_like' | 'post_comment' | 'post_bookmark' | 'community_post';
  title: string;
  body: string;
  data?: Record<string, string>;
  conversationId?: string;
  fromUserId?: string;
  read: boolean;
  createdAt: string;
}

export interface NotificationPreferences {
  userId: string;
  mutedConversations: string[];
  mutedUntil?: Record<string, string>;
  pinnedConversations: string[];
  enablePush: boolean;
  enableSound: boolean;
  enableBadge: boolean;
}

// H1.1 – Fetch notifications with cursor pagination
export async function fetchNotifications(
  cursor?: string,
  limit: number = 20,
): Promise<{ notifications: Notification[]; nextCursor: string | null }> {
  const { data } = await apiClient.get<{
    success: boolean;
    notifications: Notification[];
    nextCursor: string | null;
  }>('/api/notifications', {
    params: { cursor, limit },
  });
  return { notifications: data.notifications, nextCursor: data.nextCursor };
}

// H1.2 – Fetch unread count (badge number)
export async function fetchUnreadCount(): Promise<number> {
  const { data } = await apiClient.get<{ success: boolean; count: number }>('/api/notifications/unread-count');
  return data.count;
}

// H1.3 – Mark specific notifications as read
export async function markAsRead(notificationIds: string[]): Promise<number> {
  const { data } = await apiClient.patch<{ success: boolean; modified: number }>('/api/notifications/read', {
    notificationIds,
  });
  return data.modified;
}

// H1.4 – Mark all notifications as read
export async function markAllAsRead(): Promise<number> {
  const { data } = await apiClient.patch<{ success: boolean; modified: number }>('/api/notifications/read-all');
  return data.modified;
}

// H1.5 – Fetch notification preferences
export async function fetchPreferences(): Promise<NotificationPreferences> {
  const { data } = await apiClient.get<{ success: boolean; data: NotificationPreferences }>('/api/notifications/preferences');
  return data.data;
}

// H1.6 – Update notification preferences
export async function updatePreferences(
  prefs: { enablePush?: boolean; enableSound?: boolean; enableBadge?: boolean },
): Promise<NotificationPreferences> {
  const { data } = await apiClient.patch<{ success: boolean; data: NotificationPreferences }>('/api/notifications/preferences', prefs);
  return data.data;
}

// H1.7 – Mute a conversation
export async function muteConversation(conversationId: string, until?: string): Promise<void> {
  await apiClient.post(`/api/notifications/mute/${conversationId}`, { until });
}

// H1.8 – Unmute a conversation
export async function unmuteConversation(conversationId: string): Promise<void> {
  await apiClient.delete(`/api/notifications/mute/${conversationId}`);
}

export async function pinConversation(conversationId: string): Promise<void> {
  await apiClient.post(`/api/notifications/pin/${conversationId}`, { pin: true });
}

export async function unpinConversation(conversationId: string): Promise<void> {
  await apiClient.delete(`/api/notifications/pin/${conversationId}`);
}
