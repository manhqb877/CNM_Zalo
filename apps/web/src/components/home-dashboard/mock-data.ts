import type { DashboardHomeMockData } from './home-dashboard.types';

export const DASHBOARD_HOME_MOCK_DATA: DashboardHomeMockData = {
  brand: 'ZYNC',
  greeting: 'Xin chào! 👋',
  searchPlaceholder: 'Tìm kiếm cuộc hội thoại',
  user: {
    displayName: 'Người dùng',
    roleLabel: 'Đang hoạt động',
    initials: 'ZY',
    avatarUrl: undefined,
  },
  primaryAction: 'Tin nhắn mới',
  navItems: [
    { id: 'home', label: 'Tổng quan', icon: 'home', active: true },
    { id: 'chat', label: 'Trò chuyện', icon: 'chat' },
    { id: 'friends', label: 'Bạn bè', icon: 'friends' },
    { id: 'community', label: 'Cộng đồng', icon: 'group' },
    { id: 'explore', label: 'Khám phá', icon: 'compass' },
  ],
  sideFooterItems: [
    { id: 'settings', label: 'Cài đặt', icon: 'settings' },
    { id: 'logout', label: 'Đăng xuất', icon: 'logout' },
  ],
  stats: [
    { id: 'stat-1', value: '00', label: 'Tin nhắn mới', badge: '', icon: 'message' },
    { id: 'stat-2', value: '00', label: 'Lời mời kết bạn', badge: '', icon: 'friends' },
    { id: 'stat-3', value: '00', label: 'Nhóm đang hoạt động', badge: '', icon: 'group' },
  ],
  activityTitle: 'Hoạt động gần đây',
  activityCtaLabel: 'Xem tất cả',
  activities: [],
  // Thông báo
  notificationsTitle: 'Thông báo',
  notifications: [],
  unreadNotificationCount: 0,
  // Hoạt động bạn bè
  friendActivityTitle: 'Hoạt động bạn bè',
  friendActivities: [],
};
