import api from './api';

/** Tọa độ nút chuông (measureInWindow) để căn panel dropdown */
export type NotificationAnchorRect = {
  pageX: number;
  pageY: number;
  width: number;
  height: number;
};

export interface AppNotification {
  _id: string;
  userId: string;
  type:
    | 'new_message'
    | 'friend_request'
    | 'friend_accepted'
    | 'group_invite'
    | 'group_update';
  title: string;
  body: string;
  data?: Record<string, string>;
  conversationId?: string;
  fromUserId?: string;
  read: boolean;
  createdAt: string;
}

export async function fetchNotifications(
  cursor?: string,
  limit: number = 20,
): Promise<{ notifications: AppNotification[]; nextCursor: string | null }> {
  const { data } = await api.get<{
    success: boolean;
    notifications: AppNotification[];
    nextCursor: string | null;
  }>('/notifications', {
    params: { cursor, limit },
  });
  return { notifications: data.notifications, nextCursor: data.nextCursor };
}

export async function fetchUnreadCount(): Promise<number> {
  const { data } = await api.get<{ success: boolean; count: number }>('/notifications/unread-count');
  return data.count;
}

export async function markAsRead(notificationIds: string[]): Promise<number> {
  const { data } = await api.patch<{ success: boolean; modified: number }>('/notifications/read', {
    notificationIds,
  });
  return data.modified;
}

export async function markAllAsRead(): Promise<number> {
  const { data } = await api.patch<{ success: boolean; modified: number }>('/notifications/read-all');
  return data.modified;
}
