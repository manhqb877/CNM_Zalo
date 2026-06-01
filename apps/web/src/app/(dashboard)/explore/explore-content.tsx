'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Users,
  UserCheck,
  UserPlus,
  MessageCircle,
  Check,
  Search,
  TrendingUp,
  Tag,
  Heart,
  MessageSquare,
  Eye,
  Link2,
  Sparkles,
  Plus,
  X,
  RefreshCw,
} from 'lucide-react';
import {
  fetchDiscoverUsers,
  type DiscoverUser,
} from '@/services/explore';
import { fetchTrendingPosts, type Post } from '@/services/posts';
import { useNavigationFlow } from '@/hooks/use-navigation-flow';
import { UserProfileModal } from '@/components/shared/UserProfileModal';
import { fetchFriends, fetchFriendRequests } from '@/services/friends';
import { ButtonSpinner } from '@/components/shared/loading-system';

const DEV_ROLE_LABELS: Record<string, string> = {
  developer: 'Developer',
  mentor: 'Mentor',
  student: 'Sinh viên',
  recruiter: 'Recruiter',
  other: 'Khác',
};

const SECTION_TABS = [
  { id: 'developers' as const, label: 'Nhà phát triển', Icon: Users },
  { id: 'posts' as const, label: 'Thịnh hành', Icon: TrendingUp },
];

const POPULAR_TAGS = ['react', 'nodejs', 'typescript', 'python', 'devops', 'ai-ml', 'docker', 'nextjs', 'rust', 'golang'];

const VALID_TABS = ['developers', 'posts'] as const;
type TabId = typeof VALID_TABS[number];

function UserCard({
  user,
  onSendFriendRequest,
  friendRequestLoading,
  sentRequestIds,
  friendIds,
  currentUserId,
  onOpenProfile,
}: {
  user: DiscoverUser;
  onSendFriendRequest: (userId: string) => void;
  friendRequestLoading: boolean;
  sentRequestIds: Set<string>;
  friendIds: Set<string>;
  currentUserId?: string;
  onOpenProfile?: (userId: string) => void;
}) {
  const initials = user.displayName.slice(0, 2).toUpperCase();
  const isMe = user.id === currentUserId;
  const isFriend = friendIds.has(user.id);
  const isSent = sentRequestIds.has(user.id);
  const isLoading = friendRequestLoading && isSent;

  return (
    <div className="zync-soft-card rounded-[var(--radius-card)] p-3.5 transition hover:border-border-strong hover:shadow-soft-hover">
      <div className="flex items-start gap-3">
        <div
          className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-accent-light text-sm font-bold text-accent-strong transition hover:opacity-80"
          onClick={() => onOpenProfile?.(user.id)}
        >
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt={user.displayName} className="h-full w-full rounded-full object-cover" />
          ) : initials}
        </div>

        <div className="min-w-0 flex-1 cursor-pointer hover:opacity-80 transition" onClick={() => onOpenProfile?.(user.id)}>
          <p className="font-ui-title text-sm text-text-primary">{user.displayName}</p>
          {user.username && <p className="font-ui-content text-xs text-text-tertiary">@{user.username}</p>}
          {user.devRole && (
            <span className="mt-0.5 inline-block rounded-full bg-bg-hover px-2 py-0.5 text-xs text-text-tertiary">
              {DEV_ROLE_LABELS[user.devRole] ?? user.devRole}
            </span>
          )}
        </div>

        {user.githubUrl && (
          <a href={user.githubUrl} target="_blank" rel="noopener noreferrer"
            className="zync-soft-button-ghost flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs">
            <Link2 className="h-3.5 w-3.5" />
            GitHub
          </a>
        )}
      </div>

      {user.bio && (
        <p className="font-ui-content mt-2 line-clamp-2 text-sm leading-relaxed text-text-secondary">{user.bio}</p>
      )}

      {(user.skills ?? []).length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {(user.skills ?? []).slice(0, 4).map((skill) => (
            <span key={skill} className="rounded-full border border-border bg-bg-hover px-2.5 py-0.5 text-xs text-text-secondary">{skill}</span>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between">
        <p className="flex items-center gap-1 text-xs text-text-tertiary">
          <Users className="h-3 w-3" />
          {user.friendCount} kết nối
        </p>

        {!isMe && (
          <div className="flex items-center gap-2">
            {isFriend ? (
              <button
                type="button"
                onClick={() => onSendFriendRequest(user.id)}
                className="zync-soft-button flex items-center gap-1.5 px-3 py-1.5 text-xs"
              >
                <MessageCircle className="h-3 w-3" />
                Nhắn tin
              </button>
            ) : isSent ? (
              <button
                type="button"
                disabled
                className="flex items-center gap-1.5 rounded-full border border-border bg-bg-hover px-3 py-1.5 text-xs text-text-tertiary"
              >
                <Check className="h-3 w-3" />
                Đã gửi
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onSendFriendRequest(user.id)}
                disabled={isLoading}
                className="zync-soft-button-secondary flex items-center gap-1.5 px-3 py-1.5 text-xs"
              >
                {isLoading ? (
                  <ButtonSpinner size="xs" tone="muted" />
                ) : (
                  <UserPlus className="h-3 w-3" />
                )}
                Kết bạn
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TrendingPostRow({ post, rank, onClick }: { post: Post; rank: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-3 rounded-[1.2rem] border border-border-light p-3 text-left transition hover:border-accent/40 hover:bg-accent/5"
    >
      <span className="font-ui-title min-w-[1.5rem] text-xl leading-none text-accent-strong">{rank}</span>
      <div className="min-w-0 flex-1">
        <p className="font-ui-title line-clamp-2 text-sm leading-snug text-text-primary">{post.title}</p>
        {(post.tags ?? []).length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {post.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="rounded-full border border-border px-1.5 py-0.5 text-xs text-text-tertiary">#{tag}</span>
            ))}
          </div>
        )}
        <div className="mt-1.5 flex items-center gap-3 text-xs text-text-tertiary">
          <span className="flex items-center gap-1"><Heart className="h-3 w-3" />{post.likesCount}</span>
          <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{post.commentsCount}</span>
          <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{post.viewsCount}</span>
        </div>
      </div>
    </button>
  );
}

function DeveloperSkeleton() {
  return (
    <div className="zync-soft-card rounded-[1.6rem] p-4">
      <div className="flex gap-3">
        <div className="h-12 w-12 animate-pulse rounded-full bg-bg-hover shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-2/3 animate-pulse rounded bg-bg-hover" />
          <div className="h-3 w-1/3 animate-pulse rounded bg-bg-hover" />
          <div className="flex gap-1">
            <div className="h-5 w-16 animate-pulse rounded-full bg-bg-hover" />
            <div className="h-5 w-12 animate-pulse rounded-full bg-bg-hover" />
          </div>
        </div>
      </div>
    </div>
  );
}

function PostSkeleton() {
  return (
    <div className="flex items-start gap-3 rounded-[1.2rem] border border-border-light p-3">
      <div className="h-6 w-6 animate-pulse rounded bg-bg-hover" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-4 w-full animate-pulse rounded bg-bg-hover" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-bg-hover" />
        <div className="flex gap-3">
          <div className="h-3 w-10 animate-pulse rounded bg-bg-hover" />
          <div className="h-3 w-10 animate-pulse rounded bg-bg-hover" />
          <div className="h-3 w-10 animate-pulse rounded bg-bg-hover" />
        </div>
      </div>
    </div>
  );
}

export default function ExploreContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [users, setUsers] = useState<DiscoverUser[]>([]);
  const [trendingPosts, setTrendingPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeSection, setActiveSection] = useState<TabId>(() => {
    const tab = searchParams.get('tab');
    return (VALID_TABS.includes(tab as TabId) ? tab : 'developers') as TabId;
  });
  const [sentRequestIds, setSentRequestIds] = useState<Set<string>>(new Set());
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());
  const [friendRequestLoading, setFriendRequestLoading] = useState(false);
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const skillsFromUrl = searchParams.get('skills');
  const suggestedSkills = skillsFromUrl ? skillsFromUrl.split(',').filter(Boolean) : [];

  const {
    navigateToChat,
    sendFriendRequest,
    profileModalOpen,
    profileModalUserId,
    profileModalUser,
    profileModalLoading,
    openProfileModal,
    closeProfileModal,
  } = useNavigationFlow();

  const currentUserId = (() => {
    if (typeof window === 'undefined') return undefined;
    try {
      const stored = localStorage.getItem('zync_user');
      if (stored) {
        const user = JSON.parse(stored);
        return user._id || user.id;
      }
    } catch { /* ignore */ }
    return undefined;
  })();

  const handleTabChange = useCallback((tab: TabId) => {
    setActiveSection(tab);
    setSearch('');
    setActiveTag(null);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    params.delete('skills');
    router.replace(`/explore?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [userData, postData, friendsData, requestsData] = await Promise.allSettled([
        fetchDiscoverUsers(),
        fetchTrendingPosts(20),
        fetchFriends(),
        fetchFriendRequests(),
      ]);
      if (userData.status === 'fulfilled') setUsers(userData.value);
      if (postData.status === 'fulfilled') setTrendingPosts(postData.value);
      if (friendsData.status === 'fulfilled') setFriendIds(new Set(friendsData.value.friends.map((f) => f.id)));
      if (requestsData.status === 'fulfilled') setSentRequestIds(new Set(requestsData.value.outgoing.map((r) => r.userId)));

      if (userData.status === 'rejected' || postData.status === 'rejected') {
        setLoadError('Không thể tải dữ liệu. Vui lòng thử lại.');
      }
    } catch {
      setLoadError('Không thể tải dữ liệu. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSendFriendRequest = async (userId: string) => {
    const user = users.find((u) => u.id === userId);
    if (!user) return;

    if (friendIds.has(userId)) {
      await navigateToChat(userId);
      return;
    }

    setFriendRequestLoading(true);
    try {
      await sendFriendRequest(userId);
      setSentRequestIds((prev) => new Set([...prev, userId]));
    } catch { /* ignore */ } finally {
      setFriendRequestLoading(false);
    }
  };

  const handleTagClick = (tag: string) => {
    if (activeTag === tag) {
      setActiveTag(null);
      setSearch('');
    } else {
      setActiveTag(tag);
      setSearch(tag);
    }
  };

  const handlePostClick = (postId: string) => {
    router.push(`/community?post=${postId}`);
  };

  const filteredUsers = users.filter((u) => {
    const matchesSearch = !search || u.displayName.toLowerCase().includes(search.toLowerCase()) ||
      (u.skills ?? []).some((s) => s.toLowerCase().includes(search.toLowerCase()));
    if (suggestedSkills.length > 0) {
      const userSkillsLower = (u.skills ?? []).map((s) => s.toLowerCase());
      return matchesSearch && suggestedSkills.some((skill) => userSkillsLower.includes(skill.toLowerCase()));
    }
    return matchesSearch;
  });

  const filteredPosts = trendingPosts.filter((p) => {
    const titleMatch = !search || p.title.toLowerCase().includes(search.toLowerCase());
    const tagMatch = activeTag ? (p.tags ?? []).includes(activeTag) : true;
    return titleMatch && tagMatch;
  });

  const searchPlaceholder = (() => {
    if (search) return search;
    switch (activeSection) {
      case 'developers': return 'Tìm nhà phát triển...';
      case 'posts': return 'Tìm bài viết...';
    }
  })();

  const isSearching = search.length > 0 || activeTag !== null;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* Header + Search */}
      <div className="zync-page-header">
        {/* Banner gợi ý skills từ onboarding */}
        {suggestedSkills.length > 0 && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-[1.2rem] border border-accent/30 bg-accent/5 p-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-accent" />
              <p className="font-ui-meta text-xs text-text-secondary">
                Đề xuất developer cùng tech stack với bạn:
              </p>
            </div>
            <div className="flex flex-wrap gap-1">
              {suggestedSkills.slice(0, 3).map((skill) => (
                <span key={skill} className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-xs text-accent-strong">
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-ui-meta text-[0.7rem] uppercase tracking-[0.18em] text-text-tertiary">Khám phá</p>
            <h2 className="font-ui-title mt-1 flex items-center gap-2 text-xl text-text-primary">
              <Search className="h-5 w-5 text-accent" />
              Khám phá
            </h2>
            <p className="font-ui-content mt-0.5 text-xs text-text-secondary">Tìm nhà phát triển và bài viết nổi bật</p>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`  ${searchPlaceholder}`}
            className="zync-soft-input w-full pl-9"
          />
        </div>

        <div className="zync-page-tabs mt-3">
          {SECTION_TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => handleTabChange(id)}
              className={`zync-tab-pill ${
                activeSection === id ? 'zync-tab-pill-active' : ''
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="zync-dashboard-scroll flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        {/* Error state */}
        {loadError && (
          <div className="mb-4 flex flex-col items-center justify-center gap-3 rounded-[1.2rem] border border-red-500/20 bg-red-500/5 p-6 text-center">
            <p className="font-ui-content text-sm text-red-400">{loadError}</p>
            <button
              onClick={loadData}
              className="zync-soft-button flex items-center gap-2 px-4 py-2 text-sm"
            >
              <RefreshCw className="h-4 w-4" />
              Thử lại
            </button>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i}>
                {activeSection === 'developers' && <DeveloperSkeleton key={i} />}
                {activeSection === 'posts' && <PostSkeleton key={i} />}
              </div>
            ))}
          </div>
        ) : activeSection === 'developers' ? (
          filteredUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-bg-hover">
                <Users className="h-7 w-7 text-text-tertiary" />
              </div>
              <div>
                <p className="font-ui-title text-base text-text-primary">
                  {isSearching ? 'Không tìm thấy developer phù hợp' : 'Chưa có nhà phát triển nổi bật'}
                </p>
                <p className="font-ui-content mt-1 text-sm text-text-secondary">
                  {isSearching ? 'Thử từ khóa hoặc tag khác' : 'Hãy hoàn thiện hồ sơ để xuất hiện ở đây!'}
                </p>
              </div>
              {isSearching && (
                <button
                  onClick={() => { setSearch(''); setActiveTag(null); }}
                  className="zync-soft-button text-sm"
                >
                  Xóa bộ lọc
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:gap-4">
              {filteredUsers.map((user) => (
                <UserCard
                  key={user.id}
                  user={user}
                  onSendFriendRequest={handleSendFriendRequest}
                  friendRequestLoading={friendRequestLoading}
                  sentRequestIds={sentRequestIds}
                  friendIds={friendIds}
                  currentUserId={currentUserId}
                  onOpenProfile={openProfileModal}
                />
              ))}
            </div>
          )
        ) : (
          filteredPosts.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-bg-hover">
                <TrendingUp className="h-7 w-7 text-text-tertiary" />
              </div>
              <div>
                <p className="font-ui-title text-base text-text-primary">
                  {isSearching ? 'Không tìm thấy bài viết phù hợp' : 'Chưa có bài viết thịnh hành'}
                </p>
                <p className="font-ui-content mt-1 text-sm text-text-secondary">
                  {isSearching
                    ? 'Thử từ khóa hoặc tag khác'
                    : 'Hãy chia sẻ bài viết đầu tiên trong cộng đồng!'}
                </p>
              </div>
              {!isSearching && (
                <button
                  onClick={() => router.push('/community?create=true')}
                  className="zync-soft-button flex items-center gap-2 px-4 py-2 text-sm"
                >
                  <Plus className="h-4 w-4" />
                  Viết bài viết
                </button>
              )}
              {isSearching && (
                <button
                  onClick={() => { setSearch(''); setActiveTag(null); }}
                  className="zync-soft-button text-sm"
                >
                  Xóa bộ lọc
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredPosts.map((post, i) => (
                <TrendingPostRow
                  key={post._id}
                  post={post}
                  rank={i + 1}
                  onClick={() => handlePostClick(post._id)}
                />
              ))}
            </div>
          )
        )}
      </div>

      {/* Tags cloud */}
      {!loading && (
        <div className="border-t border-border-soft bg-[var(--surface-muted)]/35 px-4 py-3 sm:px-6">
          <p className="font-ui-meta mb-2.5 flex items-center gap-1.5 text-[0.7rem] uppercase tracking-[0.18em] text-text-tertiary">
            <Tag className="h-3 w-3" />
            Thẻ phổ biến
          </p>
          <div className="flex flex-wrap gap-2">
            {POPULAR_TAGS.map((tag) => (
              <button
                key={tag}
                onClick={() => handleTagClick(tag)}
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  activeTag === tag
                    ? 'border-accent bg-accent text-[var(--bg-primary)]'
                    : 'border-border bg-bg-hover text-text-secondary hover:border-accent hover:text-accent'
                }`}
              >
                #{tag}
              </button>
            ))}
          </div>
          {activeTag && (
            <button
              onClick={() => { setActiveTag(null); setSearch(''); }}
              className="mt-2 flex items-center gap-1 text-xs text-text-tertiary hover:text-accent transition"
            >
              <X className="h-3 w-3" />
              Xóa lọc tag
            </button>
          )}
        </div>
      )}

      <UserProfileModal
        visible={profileModalOpen}
        userId={profileModalUserId}
        user={profileModalUser || undefined}
        loading={profileModalLoading}
        currentUserId={currentUserId}
        onClose={closeProfileModal}
        onSendMessage={async (id) => {
          await navigateToChat(id);
          closeProfileModal();
        }}
        onSendFriendRequest={async (id) => {
          await handleSendFriendRequest(id);
        }}
      />
    </div>
  );
}
