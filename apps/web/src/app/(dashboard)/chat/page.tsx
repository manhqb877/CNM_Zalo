'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useHomeDashboard } from '@/hooks/use-home-dashboard';
import { HomeDashboardChatPanel } from '@/components/home-dashboard/organisms/home-dashboard-chat-panel';
import { PageLoading } from '@/components/shared/page-loading';
import { EmptyState } from '@/components/shared/EmptyState';
import { ZyncPageTransition } from '@/components/shared/ZyncPageTransition';
import { setActiveConversationId } from '@/services/active-conversation';

export default function ChatPage() {
  return (
    <Suspense fallback={<PageLoading variant="chat" mode="panel" />}>
      <ChatPageContent />
    </Suspense>
  );
}

function ChatPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [targetMessageRef, setTargetMessageRef] = useState<string | null>(null);
  const [openCreateGroupOnMount, setOpenCreateGroupOnMount] = useState(false);
  const {
    loading,
    conversations,
    selectedConversationId,
    onSelectConversation,
    aiCatchupByConversation,
    onRequestAiCatchup,
    onRegenerateAiCatchup,
    onToggleAiCatchupSetting,
    onCreateReminder,
    searchTargets,
    onSelectSearchTarget,
    friendsForGroup,
    groupActionLoading,
    onCreateGroup,
    onUpdateGroup,
    onAddGroupMembers,
    onUpdateGroupMemberRole,
    onUpdateGroupMemberApproval,
    onRemoveGroupMember,
    onDisbandGroup,
    onLeaveGroup,
    onToggleConversationPin,
    onMuteConversation,
    onUnmuteConversation,
    isSelectedConversationPinned,
    selectedConversationMutedUntil,
    messages,
    messagesLoading,
    messagesHasMore,
    aiCatchupDigest,
    aiCatchupUnreadCount,
    aiCatchupEnabled,
    aiCatchupRequesting,
    messageStatus,
    conversationInfo,
    typingUsers,
    onSendMessage,
    onCancelPendingMessage,
    onStartTyping,
    onStopTyping,
    onLoadMore,
    onDeleteMessageForMe,
    onRecallMessage,
    onForwardMessage,
    onReactionUpsert,
    onReactionRemoveAllMine,
    onFetchReactionDetails,
    reactionUserStateByMessage,
    userId,
    forwardModalOpen,
    forwardingMessage,
    forwardLoading,
    onCloseForwardModal,
    onExecuteForward,
    callStatus,
    callPeerName,
    callParticipantNames,
    isGroupCallActive,
    selectedConversationActiveCall,
    callError,
    callFriendError,
    onDismissCallFriendError,
    isMicMuted,
    isCameraEnabled,
    isScreenSharing,
    screenSharingUserId,
    localVideoRef,
    screenShareVideoRef,
    remoteVideoRef,
    remoteParticipantVideos,
    isCallingAvailable,
    onStartAudioCall,
    onStartVideoCall,
    onAcceptIncomingCall,
    onRejectIncomingCall,
    onEndCall,
    onDismissCallUi,
    onToggleMic,
    onToggleCamera,
    onToggleScreenShare,
  } = useHomeDashboard();

  useEffect(() => {
    setActiveConversationId(selectedConversationId || null);
    return () => setActiveConversationId(null);
  }, [selectedConversationId]);

  // Deep link: /chat?conversationId=... (alias: ?conversation= for legacy links)
  useEffect(() => {
    const conversationId =
      searchParams.get('conversationId') ?? searchParams.get('conversation');
    const messageRef = searchParams.get('messageRef') ?? searchParams.get('messageId');
    if (!conversationId) return;

    setTargetMessageRef(messageRef);
    onSelectConversation(conversationId);
    router.replace('/chat');
  }, [searchParams, onSelectConversation, router]);

  useEffect(() => {
    if (searchParams.get('createGroup') !== '1') {
      return;
    }

    setOpenCreateGroupOnMount(true);
    router.replace('/chat');
  }, [searchParams, router]);

  if (loading) {
    return <PageLoading variant="chat" mode="panel" />;
  }

  if (conversations.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <EmptyState variant="no-messages" />
      </div>
    );
  }

  return (
    <ZyncPageTransition className="relative flex h-full w-full min-h-0 min-w-0 flex-1">
      <HomeDashboardChatPanel
        conversations={conversations}
        selectedConversationId={selectedConversationId}
        onSelectConversation={onSelectConversation}
        searchTargets={searchTargets}
        onSelectSearchTarget={onSelectSearchTarget}
        friends={friendsForGroup}
        onCreateGroup={onCreateGroup}
        onUpdateGroup={onUpdateGroup}
        onAddGroupMembers={onAddGroupMembers}
        onUpdateGroupMemberRole={onUpdateGroupMemberRole}
        onUpdateGroupMemberApproval={onUpdateGroupMemberApproval}
        onRemoveGroupMember={onRemoveGroupMember}
        onDisbandGroup={onDisbandGroup}
        onLeaveGroup={onLeaveGroup}
        onToggleConversationPin={onToggleConversationPin}
        onMuteConversation={onMuteConversation}
        onUnmuteConversation={onUnmuteConversation}
        isConversationPinned={isSelectedConversationPinned}
        conversationMutedUntil={selectedConversationMutedUntil}
        aiCatchupByConversation={aiCatchupByConversation}
        onRequestAiCatchup={onRequestAiCatchup}
        onToggleAiCatchupSetting={onToggleAiCatchupSetting}
        isCreatingGroup={groupActionLoading}
        initialCreateGroupOpen={openCreateGroupOnMount}
        onLoadMore={onLoadMore}
        chatPanelProps={{
          conversationId: selectedConversationId,
          currentUserId: userId,
          participantName: conversationInfo?.participantName,
          participantAvatar: conversationInfo?.participantAvatar,
          participantAvatarUrl: conversationInfo?.participantAvatarUrl,
          isOnline: conversationInfo?.isOnline,
          messages: messages,
          targetMessageRef,
          onTargetMessageConsumed: () => setTargetMessageRef(null),
          messageStatus: messageStatus,
          typingUsers: typingUsers,
          isLoading: messagesLoading,
          hasMoreMessages: messagesHasMore,
          aiCatchupDigest,
          aiCatchupUnreadCount,
          aiCatchupEnabled,
          aiCatchupRequesting,
          onRequestAiCatchup: () => onRequestAiCatchup(selectedConversationId),
          onRegenerateAiCatchup: () => onRegenerateAiCatchup(aiCatchupDigest?._id),
          onCreateReminder: (actionItem) => void onCreateReminder?.(actionItem),
          onSendMessage: onSendMessage,
          onCancelPendingMessage: onCancelPendingMessage,
          onStartTyping: onStartTyping,
          onStopTyping: onStopTyping,
          onDeleteMessageForMe: onDeleteMessageForMe,
          onRecallMessage: onRecallMessage,
          onForwardMessage: onForwardMessage,
          onReactionUpsert: onReactionUpsert,
          onReactionRemoveAllMine: onReactionRemoveAllMine,
          onFetchReactionDetails: onFetchReactionDetails,
          reactionUserStateByMessage: reactionUserStateByMessage,
          callStatus: callStatus,
          callPeerName: callPeerName,
          callParticipantNames: callParticipantNames,
          isGroupCallActive: isGroupCallActive,
          activeConversationCall: selectedConversationActiveCall,
          callError: callError,
          callFriendError: callFriendError,
          onDismissCallFriendError: onDismissCallFriendError,
          isMicMuted: isMicMuted,
          isCameraEnabled: isCameraEnabled,
          isScreenSharing: isScreenSharing,
          screenSharingUserId: screenSharingUserId,
          localVideoRef: localVideoRef,
          screenShareVideoRef: screenShareVideoRef,
          remoteVideoRef: remoteVideoRef,
          remoteParticipantVideos: remoteParticipantVideos,
          isCallingAvailable: isCallingAvailable,
          onStartAudioCall: onStartAudioCall,
          onStartVideoCall: onStartVideoCall,
          onAcceptIncomingCall: onAcceptIncomingCall,
          onRejectIncomingCall: onRejectIncomingCall,
          onEndCall: onEndCall,
          onDismissCallBanner: onDismissCallUi,
          onToggleMic: onToggleMic,
          onToggleCamera: onToggleCamera,
          onToggleScreenShare: onToggleScreenShare,
          forwardingMessage,
          forwardModalOpen,
          forwardLoading,
          onCloseForwardModal,
          onExecuteForward
        }}
      />
    </ZyncPageTransition>
  );
}
