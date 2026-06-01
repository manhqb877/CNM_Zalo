export type DashboardIconName =
  | 'home'
  | 'chat'
  | 'profile'
  | 'message'
  | 'friends'
  | 'group'
  | 'settings'
  | 'logout'
  | 'moon'
  | 'sun'
  | 'plus'
  | 'edit'
  | 'search'
  | 'bell'
  | 'gear'
  | 'bag'
  | 'compass';

export interface DashboardUserSummary {
  displayName: string;
  roleLabel: string;
  initials: string;
  avatarUrl?: string;
}

export interface DashboardNavItem {
  id: string;
  label: string;
  icon: DashboardIconName;
  active?: boolean;
}

export interface DashboardStatItem {
  id: string;
  value: string;
  label: string;
  badge: string;
  icon: DashboardIconName;
}

export interface DashboardActivityItem {
  id: string;
  title: string;
  message: string;
  timeLabel: string;
  initials: string;
  toneClass: string;
  isUnread?: boolean;
  icon?: DashboardIconName;
  conversationId?: string;
  avatarUrl?: string;
}

/**
 * Loại thông báo hiển thị trên dashboard
 */
export type NotificationType =
  | 'new_message'
  | 'friend_request'
  | 'friend_accepted'
  | 'group_invite'
  | 'group_update'
  | 'community_post'
  | 'post_like'
  | 'post_comment'
  | 'post_bookmark'
  | 'system';

/**
 * Item thông báo hiển thị trên trang chủ
 */
export interface DashboardNotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  timeLabel: string;
  initials: string;
  toneClass: string;
  isRead: boolean;
  avatarUrl?: string;
  conversationId?: string;
  fromUserId?: string;
  action?: string;
  /** Bài cộng đồng (notification community_post / post_*) */
  postId?: string;
}

/**
 * Item hoạt động của bạn bè
 */
export interface DashboardFriendActivityItem {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  initials: string;
  toneClass: string;
  action: 'online' | 'offline' | 'posted' | 'reacted' | 'commented' | 'shared';
  target?: string;
  timeLabel: string;
}

export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'sticker' | string;

export interface DashboardHomeMockData {
  brand: string;
  greeting: string;
  searchPlaceholder: string;
  user: DashboardUserSummary;
  primaryAction: string;
  navItems: DashboardNavItem[];
  sideFooterItems: DashboardNavItem[];
  stats: DashboardStatItem[];
  activityTitle: string;
  activityCtaLabel: string;
  activities: DashboardActivityItem[];
  /** Tiêu đề phần thông báo */
  notificationsTitle: string;
  /** Danh sách thông báo */
  notifications: DashboardNotificationItem[];
  /** Số thông báo chưa đọc */
  unreadNotificationCount: number;
  /** Tiêu đề phần hoạt động bạn bè */
  friendActivityTitle: string;
  /** Danh sách hoạt động bạn bè */
  friendActivities: DashboardFriendActivityItem[];
}

