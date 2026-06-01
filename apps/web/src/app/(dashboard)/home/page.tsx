'use client';

import React, { Suspense } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import type { ComponentType } from 'react';
import {
  Bell,
  FolderOpen,
  MessageSquare,
  Plus,
  Search,
  Send,
  Sparkles,
  UserPlus,
  Users,
} from 'lucide-react';

import { useHomeDashboard } from '@/hooks/use-home-dashboard';
import { DownloadAppButton } from '@/components/shared/download-app-button';
import { PageLoading } from '@/components/shared/page-loading';
import { ZyncPageTransition } from '@/components/shared/ZyncPageTransition';
import {
  DashboardCard,
  EmptyState,
  FriendActivityPill,
  NotificationItem,
  QuickActionCard,
  RecentActivityItem,
  StatCard,
} from '@/components/home-dashboard/molecules/home-dashboard-widgets';
import type {
  DashboardActivityItem,
  DashboardFriendActivityItem,
  DashboardNotificationItem,
  DashboardStatItem,
} from '@/components/home-dashboard/home-dashboard.types';

type HomeIcon = ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
const BellIcon = Bell as HomeIcon;
const FolderOpenIcon = FolderOpen as HomeIcon;
const MessageSquareIcon = MessageSquare as HomeIcon;
const PlusIcon = Plus as HomeIcon;
const SendIcon = Send as HomeIcon;
const UserPlusIcon = UserPlus as HomeIcon;
const UsersIcon = Users as HomeIcon;

function HomePageContent(): React.JSX.Element {
  const router = useRouter();
  const { data, loading, error, conversations } = useHomeDashboard();

  const stats = normalizeStats(data.stats, data.unreadNotificationCount);
  const activeGroups = conversations.filter((item) => item.isGroup).slice(0, 3);
  const onlineFriends = data.friendActivities.filter((item) => item.action === 'online').slice(0, 4);

  const navigate = (href: string) => router.push(href);

  const handleActivityClick = (item: DashboardActivityItem) => {
    if (item.conversationId) {
      navigate(`/chat?conversationId=${encodeURIComponent(item.conversationId)}`);
      return;
    }
    navigate('/chat');
  };

  const handleNotificationClick = (item: DashboardNotificationItem) => {
    switch (item.type) {
      case 'new_message':
        navigate(item.conversationId ? `/chat?conversationId=${encodeURIComponent(item.conversationId)}&highlight=new` : '/chat');
        return;
      case 'friend_request':
      case 'friend_accepted':
        navigate('/friends?tab=requests');
        return;
      case 'group_invite':
      case 'group_update':
        navigate(item.conversationId ? `/chat?conversationId=${encodeURIComponent(item.conversationId)}` : '/community');
        return;
      case 'community_post':
      case 'post_like':
      case 'post_comment':
      case 'post_bookmark':
        navigate(item.postId ? `/community?post=${encodeURIComponent(item.postId)}` : '/community');
        return;
      default:
        navigate('/notifications');
    }
  };

  const handleFriendActivityClick = (item: DashboardFriendActivityItem) => {
    navigate(`/friends?user=${encodeURIComponent(item.userId)}`);
  };

  const handleStatClick = (statId: string) => {
    const routes: Record<string, string> = {
      'stat-1': '/chat',
      'stat-2': '/friends?tab=requests',
      'stat-3': '/community',
      'stat-4': '/notifications',
    };
    navigate(routes[statId] ?? '/home');
  };

  if (loading) {
    return <PageLoading variant="home" mode="panel" />;
  }

  if (error) {
    return (
      <ZyncPageTransition className="zync-app-surface flex h-full w-full items-center justify-center p-6">
        <div className="zync-dashboard-card w-full max-w-md p-6">
          <EmptyState
            title="Không thể tải trang chủ"
            description={error}
            actionLabel="Thử lại"
            onAction={() => window.location.reload()}
          />
        </div>
      </ZyncPageTransition>
    );
  }

  return (
    <ZyncPageTransition className="zync-app-surface flex h-full w-full flex-col overflow-hidden">
      <div className="zync-dashboard-scroll flex-1 overflow-y-auto pb-20">
        <div className="zync-page-content flex flex-col gap-4 sm:gap-5">
          <section className="zync-hero-card">
            <div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="relative p-5 sm:p-7">
                <div className="zync-hero-accent-line absolute inset-x-0 top-0 h-1" />
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex min-w-0 gap-4">
                    <UserAvatar
                      name={data.user.displayName}
                      initials={data.user.initials}
                      avatarUrl={data.user.avatarUrl}
                    />
                    <div className="min-w-0">
                      <p className="font-ui-meta text-[0.72rem] uppercase tracking-[0.18em] text-accent-strong">Trung tâm</p>
                      <h1 className="font-ui-title mt-1 text-2xl leading-tight text-text-primary sm:text-3xl">
                        Xin chào, {data.user.displayName}
                      </h1>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="zync-status-badge gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold">
                          <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
                          Trực tuyến
                        </span>
                        <span className="zync-soft-badge gap-1.5 px-3 py-1.5 text-xs font-bold">
                          <Sparkles className="h-3.5 w-3.5" aria-hidden />
                          Developer hub
                        </span>
                      </div>
                    </div>
                  </div>

                  <AvatarGroup items={onlineFriends.length > 0 ? onlineFriends : data.friendActivities.slice(0, 4)} />
                </div>

                <div className="mt-6 flex flex-wrap gap-2.5">
                  <button type="button" onClick={() => navigate('/chat')} className="zync-soft-button inline-flex items-center gap-2 px-5 py-2.5 text-sm">
                    <MessageSquare className="h-4 w-4" aria-hidden />
                    Mở chat
                  </button>
                  <button type="button" onClick={() => navigate('/chat?createGroup=1')} className="zync-soft-button-secondary inline-flex items-center gap-2 px-5 py-2.5 text-sm">
                    <FolderOpen className="h-4 w-4" aria-hidden />
                    Tạo nhóm
                  </button>
                  <button type="button" onClick={() => navigate('/friends')} className="zync-soft-button-ghost inline-flex items-center gap-2 px-5 py-2.5 text-sm">
                    <Search className="h-4 w-4" aria-hidden />
                    Tìm bạn
                  </button>
                  <DownloadAppButton variant="secondary" />
                </div>
              </div>

              <div className="zync-dashboard-card-muted grid grid-cols-2 gap-3 border-t p-4 sm:p-5 lg:border-l lg:border-t-0">
                {stats.map((item) => (
                  <StatCard key={item.id} item={item} compactLabel={statLabel(item.id)} onClick={() => handleStatClick(item.id)} />
                ))}
              </div>
            </div>
          </section>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
            <div className="space-y-4 sm:space-y-5">
              <DashboardCard
                title="Cuộc trò chuyện gần đây"
                icon={MessageSquareIcon}
                actionLabel="Chat"
                onAction={() => navigate('/chat')}
              >
                {data.activities.length === 0 ? (
                  <EmptyState
                    icon={MessageSquareIcon}
                    title="Chưa có cuộc trò chuyện"
                    description="Bắt đầu nhắn tin để danh sách gần đây xuất hiện ở đây."
                    actionLabel="Tin nhắn mới"
                    onAction={() => navigate('/chat?compose=1')}
                  />
                ) : (
                  <div className="space-y-1">
                    {data.activities.map((item) => (
                      <RecentActivityItem key={item.id} item={item} onClick={() => handleActivityClick(item)} />
                    ))}
                  </div>
                )}
              </DashboardCard>

              <div className="grid gap-4 lg:grid-cols-2">
                <DashboardCard
                  title="Thông báo"
                  icon={BellIcon}
                  badge={data.unreadNotificationCount}
                  actionLabel="Xem tất cả"
                  onAction={() => navigate('/notifications')}
                >
                  {data.notifications.length === 0 ? (
                    <EmptyState
                      icon={BellIcon}
                      title="Không có thông báo mới"
                      description="Tin nhắn, lời mời và hoạt động cộng đồng sẽ nằm ở đây."
                      actionLabel="Mở thông báo"
                      onAction={() => navigate('/notifications')}
                    />
                  ) : (
                    <div className="space-y-1">
                      {data.notifications.slice(0, 5).map((item) => (
                        <NotificationItem key={item.id} item={item} onClick={() => handleNotificationClick(item)} />
                      ))}
                    </div>
                  )}
                </DashboardCard>

                <DashboardCard
                  title="Hoạt động bạn bè"
                  icon={UserPlusIcon}
                  actionLabel="Bạn bè"
                  onAction={() => navigate('/friends')}
                >
                  {data.friendActivities.length === 0 ? (
                    <EmptyState
                      icon={UsersIcon}
                      title="Chưa có bạn bè"
                      description="Kết nối với developer khác để xem trạng thái của họ."
                      actionLabel="Tìm bạn"
                      onAction={() => navigate('/friends')}
                    />
                  ) : (
                    <div className="space-y-1">
                      {data.friendActivities.slice(0, 6).map((item) => (
                        <FriendActivityPill key={item.id} item={item} onClick={() => handleFriendActivityClick(item)} />
                      ))}
                    </div>
                  )}
                </DashboardCard>
              </div>
            </div>

            <aside className="space-y-4 sm:space-y-5">
              <DashboardCard
                title="Cộng đồng"
                icon={UsersIcon}
                actionLabel="Mở"
                onAction={() => navigate('/community')}
              >
                <div className="zync-community-highlight rounded-[1.35rem] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-ui-meta text-[0.7rem] uppercase tracking-[0.16em] text-status-text">Nhóm hoạt động</p>
                      <p className="font-ui-title mt-1 text-3xl text-text-primary">{stats.find((item) => item.id === 'stat-3')?.value ?? '00'}</p>
                    </div>
                    <span className="zync-icon-block zync-icon-block-primary h-12 w-12 rounded-2xl">
                      <Users className="h-5 w-5" aria-hidden />
                    </span>
                  </div>

                  <div className="mt-4 space-y-2">
                    {activeGroups.length === 0 ? (
                      <p className="zync-community-item rounded-2xl px-3 py-3 text-sm text-text-secondary">Chưa có nhóm hoạt động.</p>
                    ) : (
                      activeGroups.map((group) => (
                        <button
                          key={group.id}
                          type="button"
                          onClick={() => navigate(`/chat?conversationId=${encodeURIComponent(group.id)}`)}
                          className="zync-community-item flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-3 text-left"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-bold">{group.name}</span>
                            <span className="block text-xs text-text-tertiary">{group.memberCount ?? 0} thành viên</span>
                          </span>
                          <span className="zync-status-badge rounded-full px-2 py-1 text-[11px] font-bold">
                            {group.unreadCount > 0 ? `${group.unreadCount} mới` : 'Active'}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </DashboardCard>

              <DashboardCard title="Thao tác nhanh" icon={PlusIcon}>
                <div className="grid grid-cols-2 gap-3">
                  <QuickActionCard title="Tin nhắn" label="Mở chat" icon={SendIcon} onClick={() => navigate('/chat?compose=1')} />
                  <QuickActionCard title="Thêm bạn" label="Kết nối" icon={UserPlusIcon} onClick={() => navigate('/friends')} />
                  <QuickActionCard title="Nhóm mới" label="Tạo group" icon={FolderOpenIcon} onClick={() => navigate('/chat?createGroup=1')} />
                  <QuickActionCard title="Cộng đồng" label="Bài viết" icon={UsersIcon} onClick={() => navigate('/community')} />
                </div>
              </DashboardCard>
            </aside>
          </div>
        </div>
      </div>
    </ZyncPageTransition>
  );
}

function normalizeStats(stats: DashboardStatItem[], unreadNotificationCount: number): DashboardStatItem[] {
  const statById = new Map(stats.map((item) => [item.id, item]));
  const fallback: DashboardStatItem[] = [
    { id: 'stat-1', value: '00', label: 'Tin nhắn mới', badge: '', icon: 'message' },
    { id: 'stat-2', value: '00', label: 'Lời mời kết bạn', badge: '', icon: 'friends' },
    { id: 'stat-3', value: '00', label: 'Nhóm hoạt động', badge: '', icon: 'group' },
    {
      id: 'stat-4',
      value: unreadNotificationCount.toString().padStart(2, '0'),
      label: 'Thông báo chưa đọc',
      badge: unreadNotificationCount > 0 ? unreadNotificationCount.toString() : '',
      icon: 'bell',
    },
  ];

  return fallback.map((item) => ({ ...item, ...statById.get(item.id), label: statLabel(item.id) }));
}

function statLabel(statId: string): string {
  const labels: Record<string, string> = {
    'stat-1': 'Tin nhắn mới',
    'stat-2': 'Lời mời kết bạn',
    'stat-3': 'Nhóm hoạt động',
    'stat-4': 'Thông báo chưa đọc',
  };
  return labels[statId] ?? 'Chỉ số';
}

function UserAvatar({ name, initials, avatarUrl }: { name: string; initials: string; avatarUrl?: string }) {
  return (
    <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[1.45rem] bg-accent-light text-lg font-bold text-accent-strong ring-1 ring-accent/20">
      {avatarUrl ? <Image src={avatarUrl} alt={name} width={64} height={64} className="h-full w-full object-cover" /> : initials}
    </span>
  );
}

function AvatarGroup({ items }: { items: DashboardFriendActivityItem[] }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="zync-soft-badge flex items-center px-3 py-2">
      <div className="flex -space-x-2">
        {items.slice(0, 4).map((item) => (
          <span key={item.id} className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border-2 border-bg-card bg-accent-light text-[10px] font-bold text-accent-strong">
            {item.userAvatar ? <Image src={item.userAvatar} alt={item.userName} width={32} height={32} className="h-full w-full object-cover" /> : item.initials}
          </span>
        ))}
      </div>
      <span className="ml-3 text-xs font-bold text-text-secondary">
        {items.filter((item) => item.action === 'online').length || items.length} online
      </span>
    </div>
  );
}

export default function HomePage(): React.JSX.Element {
  return (
    <Suspense fallback={<PageLoading variant="home" mode="panel" />}>
      <HomePageContent />
    </Suspense>
  );
}
