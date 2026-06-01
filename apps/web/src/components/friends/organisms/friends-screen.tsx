"use client";

import { type ComponentType, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Bell,
  Sparkles,
  Tag,
  UserPlus,
  Users,
} from "lucide-react";
import { FriendsTabNavigation } from "../atoms/friends-tab-navigation";
import { FriendCard } from "../molecules/friend-card";
import { RequestList } from "../molecules/request-list";
import { SearchPanel } from "../molecules/search-panel";
import { UserProfileModal } from "@/components/shared/UserProfileModal";
import { useNavigationFlow } from "@/hooks/use-navigation-flow";
import type { FriendUser } from "@/services/friends";
import { FriendsAvatar } from "../atoms/friends-avatar";
import { showSystemToast } from "@/components/notifications/InAppNotificationToasts";
import { ButtonSpinner } from "@/components/shared/loading-system";

type FriendsIcon = ComponentType<{ className?: string }>;
const BellIcon = Bell as unknown as FriendsIcon;
const SparklesIcon = Sparkles as unknown as FriendsIcon;
const TagIcon = Tag as unknown as FriendsIcon;
const UserPlusIcon = UserPlus as unknown as FriendsIcon;
const UsersIcon = Users as unknown as FriendsIcon;

const FRIEND_TIPS = [
  { tag: "tin-nhắn", label: "Chào hỏi ngắn gọn khi kết nối mới" },
  { tag: "an-toan", label: "Chỉ chấp nhận lời mời từ người bạn tin tưởng" },
  { tag: "cong-dong", label: "Chia sẻ trên Cộng đồng để gặp thêm dev" },
];

function formatRelativeTimeShort(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return "Vừa xong";
  if (diffMinutes < 60) return `${diffMinutes} phút trước`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} giờ trước`;
  return `${Math.floor(diffHours / 24)} ngày trước`;
}

interface FriendsScreenProps {
  friends: FriendUser[];
  incomingRequests: Array<{
    requestId: string;
    userId: string;
    displayName: string;
    username?: string;
    avatarUrl?: string;
    createdAt: string;
  }>;
  outgoingRequests: Array<{
    requestId: string;
    userId: string;
    displayName: string;
    username?: string;
    avatarUrl?: string;
    createdAt: string;
  }>;
  searchKeyword: string;
  searchResults: FriendUser[];
  lastSubmittedSearchQuery: string | null;
  pendingTotal: number;
  nextCursor: string | null;
  isFriendsLoading: boolean;
  isSearchLoading: boolean;
  isMutating: boolean;
  isLoadingMore?: boolean;
  infoMessage: string | null;
  errorMessage: string | null;
  onSearchKeywordChange: (value: string) => void;
  onSearch: () => Promise<void>;
  onClearSearch: () => void;
  onLoadMoreFriends: () => Promise<void>;
  onSendRequest: (toUserId: string) => Promise<void>;
  onAcceptRequest: (requestId: string) => Promise<void>;
  onRejectRequest: (requestId: string) => Promise<void>;
  onCancelRequest: (requestId: string) => Promise<void>;
  onUnfriend: (friendId: string) => Promise<void>;
  onBlock: (userId: string) => Promise<void>;
  onUnblock: (userId: string) => Promise<void>;
}

type TabId = "all" | "requests" | "search";

export function FriendsScreen({
  friends,
  incomingRequests,
  outgoingRequests,
  searchKeyword,
  searchResults,
  lastSubmittedSearchQuery,
  pendingTotal,
  nextCursor,
  isFriendsLoading,
  isSearchLoading,
  isMutating,
  isLoadingMore = false,
  infoMessage,
  errorMessage,
  onSearchKeywordChange,
  onSearch,
  onClearSearch,
  onLoadMoreFriends,
  onSendRequest,
  onAcceptRequest,
  onRejectRequest,
  onCancelRequest,
  onUnfriend,
  onBlock,
  onUnblock: _onUnblock,
}: FriendsScreenProps) {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabId>("all");

  const {
    navigateToChat,
    profileModalUserId,
    profileModalOpen,
    profileModalUser,
    profileModalLoading,
    currentUserId,
    openProfileModal,
    closeProfileModal,
  } = useNavigationFlow();

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam === "requests") {
      setActiveTab("requests");
    } else if (tabParam === "search") {
      setActiveTab("search");
    }
  }, [searchParams]);

  useEffect(() => {
    if (infoMessage) {
      showSystemToast({
        id: "friends-info",
        type: "friend_accepted",
        title: "Bạn bè",
        body: infoMessage,
        variant: "success",
      });
    }
  }, [infoMessage]);

  useEffect(() => {
    if (errorMessage) {
      showSystemToast({
        id: "friends-error",
        type: "friend_request",
        title: "Không thể cập nhật bạn bè",
        body: errorMessage,
        variant: "error",
      });
    }
  }, [errorMessage]);

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    window.history.pushState({}, "", `/friends?${params.toString()}`);
  };

  const handleMessage = (friendId: string) => {
    void navigateToChat(friendId);
  };

  const handleSendRequestFromModal = async (userId: string) => {
    await onSendRequest(userId);
    void openProfileModal(userId);
  };

  const subtitleParts: string[] = [];
  subtitleParts.push(`${friends.length} kết nối`);
  if (pendingTotal > 0) {
    subtitleParts.push(`${pendingTotal} lời mời chờ xử lý`);
  }

  return (
    <div className="flex h-full w-full overflow-hidden">
      <div className="flex h-full w-full overflow-hidden">
        {/* Main column — mirrors /community feed */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="zync-page-header">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3 lg:block">
                  <div>
                    <p className="zync-page-eyebrow">
                      Kết nối
                    </p>
                    <h2 className="zync-page-title mt-1 flex items-center gap-2">
                      <UsersIcon className="h-5 w-5 shrink-0 text-accent" />
                      Bạn bè
                    </h2>
                    <p className="zync-page-subtitle mt-0.5">
                      {subtitleParts.join(" · ")}
                    </p>
                  </div>

                  {pendingTotal > 0 && (
                    <button
                      type="button"
                      onClick={() => handleTabChange("requests")}
                      className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-[var(--surface-glass)] shadow-sm transition-all hover:border-accent/30 hover:shadow-md lg:hidden"
                      aria-label={`${pendingTotal} lời mời kết bạn`}
                    >
                      <BellIcon className="h-5 w-5 text-accent" />
                      <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-bold text-white shadow-sm">
                        {pendingTotal > 9 ? "9+" : pendingTotal}
                      </span>
                    </button>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleTabChange("search")}
                className="zync-soft-button flex shrink-0 items-center gap-2 px-4 py-2 text-sm"
              >
                <UserPlusIcon className="h-4 w-4" />
                Tìm bạn
              </button>
            </div>

            <FriendsTabNavigation
              activeTab={activeTab}
              onTabChange={handleTabChange}
              pendingCount={pendingTotal}
            />
          </div>

          <div className="zync-dashboard-scroll flex-1 overflow-y-auto px-4 py-4 sm:px-6">
            {activeTab === "all" && (
              <div className="space-y-4">
                {friends.length === 0 && !isFriendsLoading ? (
                  <div className="flex flex-col items-center gap-4 rounded-[1.4rem] border border-dashed border-border bg-bg-card py-16 text-center shadow-sm">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-bg-hover">
                      <UsersIcon className="h-8 w-8 text-text-tertiary" />
                    </div>
                    <div>
                      <p className="font-ui-title text-base text-text-primary">
                        Chưa có bạn bè nào
                      </p>
                      <p className="font-ui-content mt-1 text-sm text-text-secondary">
                        Tìm kiếm và kết nối với mọi người
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleTabChange("search")}
                      className="zync-soft-button mt-2 px-5 py-2.5 text-sm"
                    >
                      Tìm bạn ngay
                    </button>
                  </div>
                ) : isFriendsLoading ? (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3 xl:grid-cols-4">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div
                        key={i}
                        className="flex min-h-[8rem] w-full max-w-full animate-pulse flex-col rounded-[var(--radius-card)] border border-border-soft bg-[var(--surface)] p-3"
                      >
                        <div className="mx-auto mt-6 h-11 w-11 shrink-0 rounded-full bg-bg-hover" />
                        <div className="mt-3 w-full space-y-2 px-2 text-center">
                          <div className="mx-auto h-3.5 w-2/3 rounded bg-bg-hover" />
                          <div className="mx-auto h-3 w-1/2 rounded bg-bg-hover" />
                        </div>
                        <div className="mt-auto h-9 w-full rounded-lg bg-bg-hover" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3 xl:grid-cols-4">
                      {friends.map((friend, index) => (
                        <div
                          key={friend.id}
                          className="zync-reveal-up h-full min-h-0 min-w-0"
                          style={{
                            animationDelay: `${Math.min(index * 30, 300)}ms`,
                          }}
                        >
                          <FriendCard
                            friend={friend}
                            onUnfriend={onUnfriend}
                            onBlock={onBlock}
                            isLoading={isLoadingMore}
                            onMessage={handleMessage}
                          />
                        </div>
                      ))}
                    </div>

                    {nextCursor && (
                      <button
                        type="button"
                        onClick={() => {
                          void onLoadMoreFriends();
                        }}
                        disabled={isLoadingMore}
                        className="zync-soft-button-secondary mt-2 w-full py-2.5 text-sm"
                      >
                        {isLoadingMore ? (
                          <span className="inline-flex items-center justify-center gap-2">
                            <ButtonSpinner size="sm" tone="muted" />
                            Đang tải...
                          </span>
                        ) : (
                          "Tải thêm bạn bè"
                        )}
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

            {activeTab === "requests" && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 sm:gap-3">
                  <h3 className="font-ui-title text-lg text-text-primary">
                    Lời mời kết bạn
                  </h3>
                  {pendingTotal > 0 && (
                    <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-accent/10 px-2 text-xs font-semibold text-accent">
                      {pendingTotal}
                    </span>
                  )}
                </div>
                <RequestList
                  incomingRequests={incomingRequests}
                  outgoingRequests={outgoingRequests}
                  isLoading={isFriendsLoading || isMutating}
                  onAcceptRequest={onAcceptRequest}
                  onRejectRequest={onRejectRequest}
                  onCancelRequest={onCancelRequest}
                />
              </div>
            )}

            {activeTab === "search" && (
              <div className="space-y-4">
                <div>
                  <h3 className="font-ui-title text-lg text-text-primary">
                    Tìm bạn mới
                  </h3>
                  <p className="font-ui-content mt-1 text-sm text-text-secondary">
                    Tìm kiếm người quen để kết nối
                  </p>
                </div>
                <SearchPanel
                  searchKeyword={searchKeyword}
                  searchResults={searchResults}
                  lastSubmittedSearchQuery={lastSubmittedSearchQuery}
                  isSearchLoading={isSearchLoading}
                  isActionLoading={isMutating}
                  onSearchKeywordChange={onSearchKeywordChange}
                  onSearch={onSearch}
                  onClearSearch={onClearSearch}
                  onSendRequest={onSendRequest}
                />
              </div>
            )}
          </div>
        </div>

        {/* Sidebar — mirrors /community aside */}
        <aside className="zync-dashboard-scroll hidden w-72 shrink-0 overflow-y-auto border-l border-border-soft bg-[var(--surface-muted)]/35 p-4 lg:flex lg:flex-col">
          <div className="mb-4">
            <h3 className="font-ui-title flex items-center gap-2 text-base text-text-primary">
              <SparklesIcon className="h-4 w-4 text-accent" />
              Tóm tắt kết nối
            </h3>
          </div>

          <div className="space-y-3">
            <div className="rounded-[1.2rem] border border-border bg-bg-card p-3 shadow-sm">
              <p className="font-ui-meta text-[0.65rem] uppercase tracking-[0.15em] text-text-tertiary">
                Bạn bè
              </p>
              <p className="font-ui-title mt-1 text-2xl text-text-primary">
                {friends.length}
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleTabChange("requests")}
              className="w-full rounded-[1.2rem] border border-transparent bg-bg-hover p-3 text-left transition-all hover:border-accent/30 hover:bg-bg-active hover:shadow-sm"
            >
              <p className="font-ui-meta text-[0.65rem] uppercase tracking-[0.15em] text-text-tertiary">
                Lời mời
              </p>
              <p className="font-ui-title mt-1 text-2xl text-accent-strong">
                {pendingTotal}
              </p>
              <p className="font-ui-content mt-0.5 text-xs text-text-secondary">
                Nhấn để xem chi tiết
              </p>
            </button>
          </div>

          {incomingRequests.length > 0 && (
            <div className="mt-6">
              <h4 className="font-ui-title mb-3 text-sm text-text-primary">
                Lời mời mới
              </h4>
              <div className="space-y-2">
                {incomingRequests.slice(0, 4).map((req) => (
                  <div
                    key={req.requestId}
                    className="group cursor-pointer rounded-[1.1rem] border border-transparent bg-bg-hover p-2.5 transition-all hover:border-accent/30 hover:bg-bg-active"
                    role="button"
                    tabIndex={0}
                    onClick={() => handleTabChange("requests")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleTabChange("requests");
                      }
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <FriendsAvatar
                        name={req.displayName}
                        avatarUrl={req.avatarUrl}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-ui-title truncate text-sm text-text-primary">
                          {req.displayName}
                        </p>
                        <p className="font-ui-meta text-[0.65rem] text-text-tertiary">
                          {formatRelativeTimeShort(req.createdAt)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {incomingRequests.length > 4 && (
                <button
                  type="button"
                  onClick={() => handleTabChange("requests")}
                  className="font-ui-meta mt-2 text-xs text-accent hover:underline"
                >
                  +{incomingRequests.length - 4} lời mời khác
                </button>
              )}
            </div>
          )}

          <div className="mt-6">
            <p className="font-ui-meta mb-3 flex items-center gap-1.5 text-[0.7rem] uppercase tracking-[0.18em] text-text-tertiary">
              <TagIcon className="h-3 w-3" />
              Gợi ý nhanh
            </p>
            <div className="space-y-2">
              {FRIEND_TIPS.map((tip) => (
                <div
                  key={tip.tag}
                  className="rounded-[1rem] border border-border bg-bg-hover px-3 py-2.5 transition-colors hover:border-accent/25"
                >
                  <span className="font-ui-meta text-[0.65rem] text-accent">
                    #{tip.tag}
                  </span>
                  <p className="font-ui-content mt-0.5 text-xs leading-snug text-text-secondary">
                    {tip.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      <UserProfileModal
        visible={profileModalOpen}
        userId={profileModalUserId}
        currentUserId={currentUserId ?? undefined}
        user={profileModalUser ?? undefined}
        loading={profileModalLoading}
        onClose={closeProfileModal}
        onSendMessage={(userId) => {
          void navigateToChat(userId);
        }}
        onSendFriendRequest={handleSendRequestFromModal}
      />
    </div>
  );
}
