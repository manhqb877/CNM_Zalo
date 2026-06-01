'use client';

import { Suspense } from 'react';
import { FriendsScreen } from '@/components/friends/organisms/friends-screen';
import { useFriendsDashboard } from '@/hooks/use-friends-dashboard';
import { PageLoading } from '@/components/shared/page-loading';
import { ZyncPageTransition } from '@/components/shared/ZyncPageTransition';

function FriendsPageContent() {
  const dashboard = useFriendsDashboard();

  return (
    <FriendsScreen
      friends={dashboard.friends}
      incomingRequests={dashboard.incomingRequests}
      outgoingRequests={dashboard.outgoingRequests}
      searchKeyword={dashboard.searchKeyword}
      searchResults={dashboard.searchResults}
      lastSubmittedSearchQuery={dashboard.lastSubmittedSearchQuery}
      pendingTotal={dashboard.pendingTotal}
      nextCursor={dashboard.nextCursor}
      isFriendsLoading={dashboard.isFriendsLoading}
      isSearchLoading={dashboard.isSearchLoading}
      isMutating={dashboard.isMutating}
      isLoadingMore={dashboard.isLoadingMore}
      infoMessage={dashboard.infoMessage}
      errorMessage={dashboard.errorMessage}
      onSearchKeywordChange={dashboard.setSearchKeyword}
      onSearch={dashboard.onSearch}
      onClearSearch={dashboard.onClearSearch}
      onLoadMoreFriends={dashboard.loadMoreFriends}
      onSendRequest={dashboard.onSendRequest}
      onAcceptRequest={dashboard.onAcceptRequest}
      onRejectRequest={dashboard.onRejectRequest}
      onCancelRequest={dashboard.onCancelRequest}
      onUnfriend={dashboard.onUnfriend}
      onBlock={dashboard.onBlock}
      onUnblock={dashboard.onUnblock}
    />
  );
}

export default function FriendsPage() {
  return (
    <Suspense fallback={<PageLoading variant="friends" mode="panel" />}>
      <ZyncPageTransition className="flex h-full w-full min-h-0 min-w-0 flex-1 flex-col">
        <FriendsPageContent />
      </ZyncPageTransition>
    </Suspense>
  );
}
