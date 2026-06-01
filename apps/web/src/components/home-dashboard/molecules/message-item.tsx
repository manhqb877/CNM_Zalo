'use client';

import Image from 'next/image';
import { useRef, useState, useCallback, useEffect, createContext, ReactNode, useContext } from 'react';
import type { Message, MessageStatus } from '@zync/shared-types';
import { MessageBubble } from '../atoms/message-bubble';
import type { ReactionDetailsResponse } from '@/services/chat';

function EllipsisVerticalIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <circle cx="12" cy="5" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="12" cy="19" r="1.5" />
    </svg>
  );
}

function TrashIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

function ArrowUturnLeftIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13" />
    </svg>
  );
}

function ForwardIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8l4 4m0 0l-4 4m4-4H8m6 0a4 4 0 100-8" />
    </svg>
  );
}

function EmptyLikeIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 20h-4a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2h4" />
      <path d="M14 10V6a2 2 0 0 1 2-2 2 2 0 0 1 2 2v3h2a2 2 0 0 1 1.94 2.49l-1.2 6A2 2 0 0 1 18.79 19H10V10Z" />
    </svg>
  );
}

function PhoneMiniIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.41 2 2 0 0 1 3.6 1.23h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.18 6.18l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function VideoMiniIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="m22 8-6 4 6 4V8Z" />
      <rect x="2" y="6" width="14" height="12" rx="2" ry="2" />
    </svg>
  );
}

const QUICK_REACTIONS = ['👍', '❤️', '🤣', '😳', '😭', '😡'];
const DEFAULT_MENU_REACTIONS = ['❤️', '👍', '😆', '😢', '😡'];
const PICKER_HIDE_DELAY_MS = 700;

interface MenuHandle {
  isSender: boolean;
  canRecall: boolean;
  menuReactions: string[];
  handleReactionClick: (emoji: string, source: string) => void;
  handleDeleteForMeClick: () => void;
  handleRecallClick: () => void;
  handleForwardClick: () => void;
  handleReplyClick: () => void;
}

interface MenuContextType {
  anchorElementForMenu: HTMLElement | null;
  openForMenu: boolean;
  activeMenuKey: string | null;
  handleForMenu: MenuHandle | null;
  openMenu: (anchorElement: HTMLElement, key: string, handles: MenuHandle) => void;
  toggleMenu: (anchorElement: HTMLElement, key: string, handles: MenuHandle) => void;
  closeMenu: () => void;
}

const MenuContext = createContext<MenuContextType | undefined>(undefined);

interface PickerHandle {
  isSender: boolean;
  canClearMine: boolean;
  handleReactionClick: (emoji: string, source: string) => void;
  handleRemoveMineReactions: () => void;
}

interface PickerContextType {
  anchorElementForPicker: HTMLElement | null;
  openForPicker: boolean;
  activePickerKey: string | null;
  handleForPicker: PickerHandle | null;
  openReactionPicker: (anchorElement: HTMLElement, key: string, handles: PickerHandle) => void;
  scheduleCloseReactionPicker: () => void;
  cancelCloseReactionPicker: () => void;
  closeReactionPicker: () => void;
}

const PickerContext = createContext<PickerContextType | undefined>(undefined);

interface ReactionDetailsHandle {
  message: Message;
  fetchReactionDetails: (message: Message) => Promise<ReactionDetailsResponse>;
}

interface ReactionDetailsContextType {
  openForReactionDetails: boolean;
  activeReactionDetailsKey: string | null;
  reactionDetailsHandle: ReactionDetailsHandle | null;
  reactionDetails: ReactionDetailsResponse | null;
  reactionDetailsLoading: boolean;
  openReactionDetailsModal: (message: Message, fetchReactionDetails: (message: Message) => Promise<ReactionDetailsResponse>) => void;
  closeReactionDetailsModal: () => void;
}

const ReactionDetailsContext = createContext<ReactionDetailsContextType | undefined>(undefined);

interface StatusDetailsContextType {
  openForStatusDetails: boolean;
  activeStatusDetailsKey: string | null;
  statusDetailsMessage: Message | null;
  openStatusDetailsModal: (message: Message) => void;
  closeStatusDetailsModal: () => void;
}

const StatusDetailsContext = createContext<StatusDetailsContextType | undefined>(undefined);

interface MessageItemProps {
  message: Message;
  isSender: boolean;
  canRecall: boolean;
  senderAvatar?: string;
  senderDisplayName?: string;
  messageStatus?: Record<string, MessageStatus | string>;
  reactionUserState?: {
    lastEmoji: string | null;
    totalCount: number;
    emojiCounts: Record<string, number>;
  };
  onDeleteForMe?: (messageId: string, idempotencyKey: string) => void;
  onRecall?: (messageId: string, idempotencyKey: string) => void;
  onForward?: (message: Message) => void;
  onReply?: (message: Message) => void;
  onJumpToMessage?: (messageRef: string) => void;
  onReactionUpsert?: (message: Message, emoji: string, delta: 1 | 2 | 3, actionSource: string) => void;
  onReactionRemoveAllMine?: (message: Message) => void;
  onFetchReactionDetails?: (message: Message) => Promise<ReactionDetailsResponse>;
  onReact?: (messageId: string, reactionType: string) => void;
  showSenderInfo?: boolean;
  showDateSeparator?: boolean;
  dateSeparatorText?: string;
  isFirstInGroup?: boolean;
  isConsecutive?: boolean;
  seenByAvatarUrl?: string;
  onImageLike?: (message: Message) => void;
  onImageOptions?: (message: Message) => void;
}

function ReactionDetailsContent({
  open,
  details,
  loading,
  onClose,
}: {
  open: boolean;
  details: ReactionDetailsResponse | null;
  loading: boolean;
  onClose: () => void;
}) {
  if (!open) {
    return null;
  }

  const visibleRows = (details?.rows || []).filter((row) => row.totalCount > 0);

  return (
    <div className="absolute inset-0 z-[90] flex items-center justify-center bg-black/55 px-4" onClick={onClose}>
      <div
        className="reaction-details-modal w-full max-w-xl rounded-2xl border border-border bg-surface-card-strong p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h4 className="reaction-modal-header text-base font-semibold">Chi tiết cảm xúc</h4>
          <button
            type="button"
            onClick={onClose}
            className="reaction-modal-button rounded-lg px-3 py-1 text-sm hover:opacity-80 transition-opacity"
          >
            Đóng
          </button>
        </div>

        {loading ? (
          <p className="reaction-row-meta py-6 text-center text-sm">Đang tải...</p>
        ) : !details || visibleRows.length === 0 ? (
          <p className="reaction-row-meta py-6 text-center text-sm">Chưa có cảm xúc cho tin nhắn này.</p>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap gap-2">
              {details.tabs.map((tab) => (
                <span key={tab.emoji} className="reaction-emoji-tab rounded-full px-3 py-1 text-sm">
                  {tab.emoji} {tab.count}
                </span>
              ))}
            </div>
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {visibleRows.map((row) => (
                <div key={row.userId} className="reaction-row rounded-lg border px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="reaction-row-text truncate text-sm font-medium">{row.displayName}</p>
                    <p className="reaction-row-meta text-xs">{row.totalCount} lan</p>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {Object.entries(row.emojiCounts).map(([emoji, count]) => (
                      <span key={`${row.userId}-${emoji}`} className="reaction-emoji-count rounded-md px-2 py-0.5 text-xs">
                        {emoji} {count}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatusDetailsContent({
  open,
  message,
  onClose,
}: {
  open: boolean;
  message: Message;
  onClose: () => void;
}) {
  if (!open) {
    return null;
  }

  const readBy = Array.isArray(message.readBy) ? message.readBy : [];
  const sentTo = Array.isArray(message.sentTo) ? message.sentTo : [];

  return (
    <div className="absolute inset-0 z-[92] flex items-center justify-center bg-black/55 px-4" onClick={onClose}>
      <div
        className="reaction-details-modal w-full max-w-lg rounded-2xl border border-border bg-surface-card-strong p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h4 className="reaction-modal-header text-base font-semibold">Thống kê đã xem</h4>
          <button
            type="button"
            onClick={onClose}
            className="reaction-modal-button rounded-lg px-3 py-1 text-sm hover:opacity-80 transition-opacity"
          >
            Đóng
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="status-modal-box rounded-xl border p-3">
            <p className="status-modal-label mb-2 text-xs uppercase tracking-wide">Đã xem ({readBy.length})</p>
            {readBy.length === 0 ? (
              <p className="status-modal-label text-sm">Chưa có ai đã xem.</p>
            ) : (
              <div className="space-y-2">
                {readBy.map((item) => (
                  <div key={`read-${item.userId}`} className="status-user-item rounded-md border px-2.5 py-2">
                    <div className="flex items-center gap-2.5">
                      {item.avatarUrl ? (
                        <Image
                          src={item.avatarUrl}
                          alt={item.displayName || 'user'}
                          width={28}
                          height={28}
                          className="status-user-avatar h-7 w-7 rounded-full object-cover"
                        />
                      ) : (
                        <span className="status-user-avatar inline-flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold">
                          {(item.displayName || 'U').slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className="status-user-name truncate text-sm font-medium">{item.displayName}</p>
                        <p className="status-modal-label text-xs">
                          {new Date(item.readAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="status-modal-box rounded-xl border p-3">
            <p className="status-modal-label mb-2 text-xs uppercase tracking-wide">Chưa đọc ({sentTo.length})</p>
            {sentTo.length === 0 ? (
              <p className="status-modal-label text-sm">Tất cả đã đọc.</p>
            ) : (
              <div className="space-y-2">
                {sentTo.map((item) => (
                  <div key={`sent-${item.userId}`} className="status-user-item rounded-md border px-2.5 py-2">
                    <div className="flex items-center gap-2.5">
                      {item.avatarUrl ? (
                        <Image
                          src={item.avatarUrl}
                          alt={item.displayName || 'user'}
                          width={28}
                          height={28}
                          className="status-user-avatar h-7 w-7 rounded-full object-cover"
                        />
                      ) : (
                        <span className="status-user-avatar inline-flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold">
                          {(item.displayName || 'U').slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <p className="status-user-name truncate text-sm font-medium">{item.displayName}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ReactionDetailsModalProvider({ children, containerRef }: { children: ReactNode; containerRef?: React.RefObject<HTMLElement | null> }) {
  const [openForReactionDetails, setOpenForReactionDetails] = useState(false);
  const [activeReactionDetailsKey, setActiveReactionDetailsKey] = useState<string | null>(null);
  const [reactionDetailsHandle, setReactionDetailsHandle] = useState<ReactionDetailsHandle | null>(null);
  const [reactionDetails, setReactionDetails] = useState<ReactionDetailsResponse | null>(null);
  const [reactionDetailsLoading, setReactionDetailsLoading] = useState(false);

  const closeReactionDetailsModal = useCallback(() => {
    setOpenForReactionDetails(false);
    setActiveReactionDetailsKey(null);
    setReactionDetailsHandle(null);
    setReactionDetails(null);
    setReactionDetailsLoading(false);
  }, []);

  const openReactionDetailsModal = useCallback((message: Message, fetchReactionDetails: (message: Message) => Promise<ReactionDetailsResponse>) => {
    const key = message._id || message.idempotencyKey || '';
    setActiveReactionDetailsKey(key);
    setReactionDetailsHandle({ message, fetchReactionDetails });
    setOpenForReactionDetails(true);
    setReactionDetailsLoading(true);
    setReactionDetails(null);

    void fetchReactionDetails(message)
      .then((details) => {
        setReactionDetails(details);
      })
      .finally(() => {
        setReactionDetailsLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!openForReactionDetails) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedInside = containerRef?.current?.contains(target);
      if (!clickedInside) {
        closeReactionDetailsModal();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [openForReactionDetails, containerRef, closeReactionDetailsModal]);

  return (
    <ReactionDetailsContext.Provider
      value={{
        openForReactionDetails,
        activeReactionDetailsKey,
        reactionDetailsHandle,
        reactionDetails,
        reactionDetailsLoading,
        openReactionDetailsModal,
        closeReactionDetailsModal,
      }}
    >
      {children}
    </ReactionDetailsContext.Provider>
  );
}

export const useReactionDetailsModal = () => {
  const context = useContext(ReactionDetailsContext);
  if (!context) {
    throw new Error('useReactionDetailsModal phải nằm trong ReactionDetailsModalProvider');
  }
  return context;
};

export function ReactionDetailsModal() {
  const {
    openForReactionDetails,
    reactionDetails,
    reactionDetailsLoading,
    closeReactionDetailsModal,
  } = useReactionDetailsModal();

  return (
    <ReactionDetailsContent
      open={openForReactionDetails}
      details={reactionDetails}
      loading={reactionDetailsLoading}
      onClose={closeReactionDetailsModal}
    />
  );
}

export function StatusDetailsModalProvider({ children, containerRef }: { children: ReactNode; containerRef?: React.RefObject<HTMLElement | null> }) {
  const [openForStatusDetails, setOpenForStatusDetails] = useState(false);
  const [activeStatusDetailsKey, setActiveStatusDetailsKey] = useState<string | null>(null);
  const [statusDetailsMessage, setStatusDetailsMessage] = useState<Message | null>(null);

  const closeStatusDetailsModal = useCallback(() => {
    setOpenForStatusDetails(false);
    setActiveStatusDetailsKey(null);
    setStatusDetailsMessage(null);
  }, []);

  const openStatusDetailsModal = useCallback((message: Message) => {
    const key = message._id || message.idempotencyKey || '';
    setActiveStatusDetailsKey(key);
    setStatusDetailsMessage(message);
    setOpenForStatusDetails(true);
  }, []);

  useEffect(() => {
    if (!openForStatusDetails) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedInside = containerRef?.current?.contains(target);
      if (!clickedInside) {
        closeStatusDetailsModal();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [openForStatusDetails, containerRef, closeStatusDetailsModal]);

  return (
    <StatusDetailsContext.Provider
      value={{
        openForStatusDetails,
        activeStatusDetailsKey,
        statusDetailsMessage,
        openStatusDetailsModal,
        closeStatusDetailsModal,
      }}
    >
      {children}
    </StatusDetailsContext.Provider>
  );
}

export const useStatusDetailsModal = () => {
  const context = useContext(StatusDetailsContext);
  if (!context) {
    throw new Error('useStatusDetailsModal phải nằm trong StatusDetailsModalProvider');
  }
  return context;
};

export function StatusDetailsModal() {
  const {
    openForStatusDetails,
    statusDetailsMessage,
    closeStatusDetailsModal,
  } = useStatusDetailsModal();

  if (!statusDetailsMessage) {
    return null;
  }

  return (
    <StatusDetailsContent
      open={openForStatusDetails}
      message={statusDetailsMessage}
      onClose={closeStatusDetailsModal}
    />
  );
}

function isGroupLifecycleNotice(message: Message): boolean {
  const normalized = message.content.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return normalized.includes('đã rời khỏi nhóm')
    || normalized.includes('được bạn thêm vào nhóm')
    || normalized.includes('được thêm vào nhóm')
    || normalized.includes('đã bị xóa khỏi nhóm')
    || normalized.includes('đã bị xoá khỏi nhóm')
    || normalized.includes('là quản trị viên')
    || normalized.includes('là trưởng nhóm');
}

function initialsFromNotice(content: string): string {
  const rawName = content
    .replace(/đã rời khỏi nhóm.*/i, '')
    .replace(/được bạn thêm vào nhóm.*/i, '')
    .replace(/được thêm vào nhóm.*/i, '')
    .replace(/đã bị xóa khỏi nhóm.*/i, '')
    .replace(/đã bị xoá khỏi nhóm.*/i, '')
    .replace(/là quản trị viên.*/i, '')
    .replace(/là trưởng nhóm.*/i, '')
    .trim();

  if (!rawName) {
    return 'HT';
  }

  const parts = rawName.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }

  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

// ─── Main Component ───
function formatCallHistoryDuration(durationSeconds?: number): string {
  if (!durationSeconds || durationSeconds <= 0) {
    return '0 giây';
  }

  const minutes = Math.floor(durationSeconds / 60);
  const seconds = Math.floor(durationSeconds % 60);
  if (minutes <= 0) return `${seconds} giây`;
  if (seconds <= 0) return `${minutes} phút`;
  return `${minutes} phút ${seconds} giây`;
}

function getCallHistoryLabel(message: Message): { title: string; detail: string } {
  const history = message.callHistory;
  const callTypeLabel = history?.callType === 'audio' ? 'Cuộc gọi thoại' : 'Cuộc gọi video';
  const duration = formatCallHistoryDuration(history?.durationSeconds);

  if (history?.status === 'missed') {
    return { title: `${callTypeLabel} bị nhỡ`, detail: 'Không có người tham gia' };
  }

  if (history?.status === 'rejected') {
    return { title: `${callTypeLabel} bị từ chối`, detail: 'Lời mời gọi đã bị từ chối' };
  }

  if (history?.status === 'cancelled') {
    return { title: `${callTypeLabel} đã hủy`, detail: `Thời lượng ${duration}` };
  }

  return { title: `${callTypeLabel} đã kết thúc`, detail: `Thời lượng ${duration}` };
}

export function MessageItem({
  message,
  isSender,
  canRecall,
  senderAvatar,
  senderDisplayName,
  messageStatus,
  reactionUserState,
  onDeleteForMe,
  onRecall,
  onForward,
  onReply,
  onJumpToMessage,
  onReactionUpsert,
  onReactionRemoveAllMine,
  onFetchReactionDetails,
  onReact,
  showSenderInfo = true,
  showDateSeparator = false,
  dateSeparatorText,
  isFirstInGroup = true,
  isConsecutive = false,
  seenByAvatarUrl,
  onImageLike,
  onImageOptions,
}: MessageItemProps) {
  const { openForMenu, activeMenuKey, toggleMenu, closeMenu } = useMenu();
  const {
    openForPicker,
    activePickerKey,
    openReactionPicker,
    scheduleCloseReactionPicker,
    cancelCloseReactionPicker,
    closeReactionPicker,
  } = useReactionPicker();
  const { openReactionDetailsModal } = useReactionDetailsModal();
  const { openStatusDetailsModal } = useStatusDetailsModal();
  const messageRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);

  const status = (messageStatus?.[message._id] || message.status) as MessageStatus | undefined;
  const isLifecycleNotice = isGroupLifecycleNotice(message);
  const isCallHistory = message.type === 'call_history' && Boolean(message.callHistory);
  const lastSelectedEmoji = reactionUserState?.lastEmoji ?? null;

  const summary = message.reactionSummary;
  const summaryEntries = Object.entries(summary?.emojiCounts || {}).sort((a, b) => b[1] - a[1]);
  const hasSummary = (summary?.totalCount || 0) > 0;
  const canClearMine = (reactionUserState?.totalCount || 0) > 0;

  const legacyReactionEntries = Array.isArray((message as any).reactions)
    ? Object.entries(
      ((message as any).reactions as Array<{ type: string }>).reduce<Record<string, number>>((acc, reaction) => {
        if (!reaction?.type) {
          return acc;
        }
        acc[reaction.type] = (acc[reaction.type] || 0) + 1;
        return acc;
      }, {}),
    )
    : [];

  const menuReactions = summaryEntries.length > 0
    ? summaryEntries.slice(0, 5).map(([emoji]) => emoji)
    : DEFAULT_MENU_REACTIONS;

  const isRecalled = message.type === 'system-recall' && message.content === '[Tin nhắn đã được thu hồi]';
  const canOpenReadStats = isSender
    && status === 'read'
    && !isRecalled
    && (message.readByPreview?.length || 0) > 0;
  const isMenuOpenForThisMessage = openForMenu && activeMenuKey === message._id;
  const isPickerOpenForThisMessage = openForPicker && activePickerKey === message._id;

  const handleDeleteForMeClick = useCallback(() => {
    onDeleteForMe?.(message._id, message.idempotencyKey);
    closeMenu();
  }, [closeMenu, message._id, message.idempotencyKey, onDeleteForMe]);

  const handleRecallClick = useCallback(() => {
    onRecall?.(message._id, message.idempotencyKey);
    closeMenu();
  }, [closeMenu, message._id, message.idempotencyKey, onRecall]);

  const handleForwardClick = useCallback(() => {
    onForward?.(message);
    closeMenu();
  }, [closeMenu, message, onForward]);

  const handleReplyClick = useCallback(() => {
    onReply?.(message);
    closeMenu();
  }, [closeMenu, message, onReply]);

  const handleReactionClick = useCallback((emoji: string, source = 'menu') => {
    if (onReactionUpsert) {
      onReactionUpsert(message, emoji, 1, source);
    } else {
      onReact?.(message._id, emoji);
    }
    closeReactionPicker();
    closeMenu();
  }, [closeMenu, closeReactionPicker, message, onReactionUpsert, onReact]);

  const handleTriggerClick = useCallback(() => {
    if (!lastSelectedEmoji) {
      return;
    }
    handleReactionClick(lastSelectedEmoji, 'trigger-click');
  }, [handleReactionClick, lastSelectedEmoji]);

  const handleOpenReactionDetails = useCallback(async () => {
    if (!onFetchReactionDetails) {
      return;
    }

    openReactionDetailsModal(message, onFetchReactionDetails);
  }, [message, onFetchReactionDetails, openReactionDetailsModal]);

  const handleRemoveMineReactions = useCallback(() => {
    onReactionRemoveAllMine?.(message);
    closeReactionPicker();
  }, [closeReactionPicker, message, onReactionRemoveAllMine]);

  const handleReactionHoverEnter = useCallback((anchorElement: HTMLElement | null) => {
    if (!anchorElement) {
      return;
    }
    cancelCloseReactionPicker();
    openReactionPicker(anchorElement, message._id, {
      isSender,
      canClearMine,
      handleReactionClick,
      handleRemoveMineReactions,
    });
  }, [
    cancelCloseReactionPicker,
    canClearMine,
    handleReactionClick,
    handleRemoveMineReactions,
    isSender,
    message._id,
    openReactionPicker,
  ]);

  const handleReactionHoverLeave = useCallback(() => {
    scheduleCloseReactionPicker();
  }, [scheduleCloseReactionPicker]);

  const handleContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isRecalled) {
      const anchorElement = menuTriggerRef.current ?? messageRef.current;
      if (anchorElement) {
        toggleMenu(anchorElement, message._id, {
          isSender,
          canRecall,
          menuReactions,
          handleReactionClick,
          handleDeleteForMeClick,
          handleRecallClick,
          handleForwardClick,
          handleReplyClick,
        });
      }
    }
  }, [
    canRecall,
    handleDeleteForMeClick,
    handleForwardClick,
    handleReactionClick,
    handleRecallClick,
    handleReplyClick,
    isRecalled,
    isSender,
    menuReactions,
    message._id,
    toggleMenu,
  ]);

  const handleOpenReadStats = useCallback(() => {
    if (!canOpenReadStats) {
      return;
    }
    openStatusDetailsModal(message);
  }, [canOpenReadStats, message, openStatusDetailsModal]);

  if (isCallHistory) {
    const timeStr = new Date(message.createdAt).toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const { title, detail } = getCallHistoryLabel(message);

    return (
      <div className="my-3 flex flex-col items-center gap-1.5">
        {showDateSeparator && dateSeparatorText && (
          <div className="chat-date-separator">
            <span>{dateSeparatorText}</span>
          </div>
        )}
        <div className="chat-call-bubble">
          <div className="chat-call-bubble-icon">
            {message.callHistory?.callType === 'audio' ? (
              <PhoneMiniIcon className="h-4 w-4" />
            ) : (
              <VideoMiniIcon className="h-4 w-4" />
            )}
          </div>
          <span className="min-w-0 text-left">
            <span className="block truncate font-semibold">{title}</span>
            <span className="block text-xs text-text-secondary">{detail}</span>
          </span>
          <span className="text-xs text-text-tertiary">{timeStr}</span>
        </div>
      </div>
    );
  }

  // Lifecycle notice messages
  if (isLifecycleNotice) {
    const timeStr = new Date(message.createdAt).toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
    });

    return (
      <div className="my-3 flex flex-col items-center gap-1.5">
        <div className="chat-lifecycle-bubble">
          <div className="chat-lifecycle-bubble-initials">
            {initialsFromNotice(message.content)}
          </div>
          <span className="truncate">{message.content}</span>
        </div>
        <span className="chat-lifecycle-bubble-time">{timeStr}</span>
      </div>
    );
  }

  return (
    <div
      ref={messageRef}
      className={`group relative flex flex-row items-start hover:z-20 ${
        isConsecutive ? 'mb-1' : 'mb-3'
      } ${
        isMenuOpenForThisMessage || isPickerOpenForThisMessage ? 'z-30' : 'z-0'
      } ${
        isSender ? 'justify-end' : 'justify-start'
      }`}
      onContextMenu={handleContextMenu}
    >
      {/* Date Separator */}
      {showDateSeparator && dateSeparatorText && (
        <div className="chat-date-separator">
          <span>{dateSeparatorText}</span>
        </div>
      )}

      {/* ── Bubble column ── */}
      <div className="relative order-2">
        {!isRecalled && (
          <div
            className={`absolute top-1/2 z-30 flex -translate-y-1/2 items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100 ${
              isSender ? 'right-full mr-2' : 'left-full ml-2'
            }`}
          >
            <div
              className="relative"
              onMouseEnter={(event) => handleReactionHoverEnter(event.currentTarget)}
              onMouseLeave={handleReactionHoverLeave}
            >
              <button
                type="button"
                onClick={handleTriggerClick}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border-light bg-transparent text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
                title="Thả cảm xúc"
              >
                {lastSelectedEmoji ? (
                  <span className="text-sm leading-none">{lastSelectedEmoji}</span>
                ) : (
                  <EmptyLikeIcon className="h-3.5 w-3.5" />
                )}
              </button>
            </div>

            <div className="relative">
              <button
                ref={menuTriggerRef}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const anchorElement = menuTriggerRef.current ?? messageRef.current;
                  if (!anchorElement) {
                    return;
                  }

                  toggleMenu(anchorElement, message._id, {
                    isSender,
                    canRecall,
                    menuReactions,
                    handleReactionClick,
                    handleDeleteForMeClick,
                    handleRecallClick,
                    handleForwardClick,
                    handleReplyClick,
                  });
                }}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border-light bg-transparent text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
                title="Thêm tùy chọn"
              >
                <EllipsisVerticalIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Message Bubble */}
        <MessageBubble
          isOwn={isSender}
          content={message.content}
          type={message.type}
          mediaUrl={message.mediaUrl}
          replyTo={message.replyTo}
          onJumpToMessage={onJumpToMessage}
          status={status}
          readByPreview={message.readByPreview}
          readByCount={message.readBy?.length}
          onReadPreviewPress={canOpenReadStats ? handleOpenReadStats : undefined}
          timestamp={message.createdAt}
          senderAvatar={senderAvatar}
          senderDisplayName={senderDisplayName}
          showSenderInfo={showSenderInfo}
          reactionSummary={summary}
          userReaction={lastSelectedEmoji}
          onReactionClick={() => handleOpenReactionDetails()}
          isFirstInGroup={isFirstInGroup}
          isConsecutive={isConsecutive}
          seenByAvatarUrl={seenByAvatarUrl}
          onImageLike={() => onImageLike?.(message)}
          onImageOptions={() => onImageOptions?.(message)}
        />

        {isRecalled && (
          <p className="mt-1 text-xs italic text-text-tertiary">
            {isSender ? 'Bạn đã thu hồi tin nhắn này' : 'Tin nhắn đã được thu hồi'}
          </p>
        )}

        {/* Legacy reaction entries (non-summary format) - only show when no summary exists */}
        {!isRecalled && !hasSummary && legacyReactionEntries.length > 0 && (
          <div className={`mt-1 flex flex-wrap gap-1 ${isSender ? 'justify-end' : 'justify-start'}`}>
            {legacyReactionEntries.map(([emoji, count]) => (
              <button
                key={`${message._id}-${emoji}`}
                onClick={handleOpenReactionDetails}
                className="reaction-pill inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition-opacity hover:opacity-80"
              >
                <span>{emoji}</span>
                {count > 1 && <span>{count}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ImageViewer is rendered by ImageViewerProvider at a higher level */}
    </div>
  );
}
export function MenuProvider({ children }: { children: ReactNode }) {
  const [anchorElementForMenu, setAnchorElementForMenu] = useState<HTMLElement | null>(null);
  const [activeMenuKey, setActiveMenuKey] = useState<string | null>(null);
  const [openForMenu, setOpenForMenu] = useState<boolean>(false);
  const [handleForMenu, setHandleForMenu] = useState<MenuHandle | null>(null);

  const closeMenu = useCallback(() => {
    setOpenForMenu(false);
    setActiveMenuKey(null);
    setAnchorElementForMenu(null);
    setHandleForMenu(null);
  }, []);

  const openMenu = useCallback((anchorElement: HTMLElement, key: string, handles: MenuHandle) => {
    setAnchorElementForMenu(anchorElement);
    setActiveMenuKey(key);
    setHandleForMenu(handles);
    setOpenForMenu(true);
  }, []);

  const toggleMenu = useCallback((anchorElement: HTMLElement, key: string, handles: MenuHandle) => {
    setOpenForMenu((previous) => {
      const shouldClose = previous && activeMenuKey === key;
      if (shouldClose) {
        setActiveMenuKey(null);
        setAnchorElementForMenu(null);
        setHandleForMenu(null);
        return false;
      }

      setAnchorElementForMenu(anchorElement);
      setActiveMenuKey(key);
      setHandleForMenu(handles);
      return true;
    });
  }, [activeMenuKey]);

  return (
    <MenuContext.Provider
      value={{
        anchorElementForMenu,
        openForMenu,
        activeMenuKey,
        handleForMenu,
        openMenu,
        toggleMenu,
        closeMenu,
      }}
    >
      {children}
    </MenuContext.Provider>
  );
}

export const useMenu = () => {
  const context = useContext(MenuContext);
  if (!context) {
    throw new Error('useMenu phải nằm trong MenuProvider');
  }
  return context;
};

export function ReactionPickerProvider({ children }: { children: ReactNode }) {
  const [anchorElementForPicker, setAnchorElementForPicker] = useState<HTMLElement | null>(null);
  const [activePickerKey, setActivePickerKey] = useState<string | null>(null);
  const [openForPicker, setOpenForPicker] = useState<boolean>(false);
  const [handleForPicker, setHandleForPicker] = useState<PickerHandle | null>(null);
  const pickerHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelCloseReactionPicker = useCallback(() => {
    if (pickerHideTimeoutRef.current) {
      clearTimeout(pickerHideTimeoutRef.current);
      pickerHideTimeoutRef.current = null;
    }
  }, []);

  const closeReactionPicker = useCallback(() => {
    cancelCloseReactionPicker();
    setOpenForPicker(false);
    setActivePickerKey(null);
    setAnchorElementForPicker(null);
    setHandleForPicker(null);
  }, [cancelCloseReactionPicker]);

  const openReactionPicker = useCallback((anchorElement: HTMLElement, key: string, handles: PickerHandle) => {
    cancelCloseReactionPicker();
    setAnchorElementForPicker(anchorElement);
    setActivePickerKey(key);
    setHandleForPicker(handles);
    setOpenForPicker(true);
  }, [cancelCloseReactionPicker]);

  const scheduleCloseReactionPicker = useCallback(() => {
    cancelCloseReactionPicker();
    pickerHideTimeoutRef.current = setTimeout(() => {
      setOpenForPicker(false);
      setActivePickerKey(null);
      setAnchorElementForPicker(null);
      setHandleForPicker(null);
      pickerHideTimeoutRef.current = null;
    }, PICKER_HIDE_DELAY_MS);
  }, [cancelCloseReactionPicker]);

  useEffect(() => {
    return () => {
      if (pickerHideTimeoutRef.current) {
        clearTimeout(pickerHideTimeoutRef.current);
      }
    };
  }, []);

  return (
    <PickerContext.Provider
      value={{
        anchorElementForPicker,
        openForPicker,
        activePickerKey,
        handleForPicker,
        openReactionPicker,
        scheduleCloseReactionPicker,
        cancelCloseReactionPicker,
        closeReactionPicker,
      }}
    >
      {children}
    </PickerContext.Provider>
  );
}

export const useReactionPicker = () => {
  const context = useContext(PickerContext);
  if (!context) {
    throw new Error('useReactionPicker phải nằm trong ReactionPickerProvider');
  }
  return context;
};

export function ReactionPicker({
  containerRef,
  staticRef,
}: {
  containerRef: React.RefObject<HTMLElement | null>;
  staticRef: React.RefObject<HTMLElement | null>;
}) {
  const {
    openForPicker,
    handleForPicker,
    anchorElementForPicker,
    scheduleCloseReactionPicker,
    cancelCloseReactionPicker,
  } = useReactionPicker();
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const [pickerPlacement, setPickerPlacement] = useState<'top' | 'bottom'>('top');

  useEffect(() => {
    if (!openForPicker || !anchorElementForPicker || !handleForPicker || !containerRef.current || !staticRef.current) {
      setCoords(null);
      return;
    }

    const containerRect = containerRef.current.getBoundingClientRect();
    const anchorRect = anchorElementForPicker.getBoundingClientRect();

    const estimatedWidth = handleForPicker.canClearMine ? 288 : 248;
    const estimatedHeight = 44;
    const horizontalPadding = 8;
    const verticalGap = 8;

    const spaceAbove = anchorRect.top - staticRef.current.getBoundingClientRect().top;
    const nextPlacement: 'top' | 'bottom' = spaceAbove >= (estimatedHeight + verticalGap) ? 'top' : 'bottom';

    let left = handleForPicker.isSender
      ? anchorRect.right - containerRect.left - estimatedWidth
      : anchorRect.left - containerRect.left;

    const maxLeft = Math.max(
      horizontalPadding,
      containerRect.width - estimatedWidth - horizontalPadding,
    );
    left = Math.min(Math.max(left, horizontalPadding), maxLeft);

    const top = nextPlacement === 'top'
      ? anchorRect.top - containerRect.top - estimatedHeight - verticalGap
      : anchorRect.bottom - containerRect.top + verticalGap;

    setPickerPlacement(nextPlacement);
    setCoords({ top: Math.max(0, top), left });
  }, [anchorElementForPicker, containerRef, handleForPicker, openForPicker]);

  if (!handleForPicker || !coords || !openForPicker) {
    return null;
  }

  return (
    <div
      className={`chat-reaction-picker absolute z-[120] ${
        pickerPlacement === 'top' ? 'origin-bottom' : 'origin-top'
      }`}
      style={{ top: `${coords.top}px`, left: `${coords.left}px` }}
      onMouseEnter={cancelCloseReactionPicker}
      onMouseLeave={scheduleCloseReactionPicker}
      onClick={(e) => e.stopPropagation()}
    >
      {QUICK_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => handleForPicker.handleReactionClick(emoji, 'picker-select')}
          className="chat-reaction-picker-item"
        >
          {emoji}
        </button>
      ))}
      {handleForPicker.canClearMine && (
        <button
          type="button"
          onClick={handleForPicker.handleRemoveMineReactions}
          className="rounded-full px-3 py-1.5 text-xs font-semibold text-red-400 transition-opacity hover:opacity-80"
        >
          Xóa
        </button>
      )}
    </div>
  );
}

export function Menu({
  containerRef,
  staticRef,
}: {
  containerRef: React.RefObject<HTMLElement | null>;
  staticRef: React.RefObject<HTMLElement | null>;
}) {
  const { openForMenu, handleForMenu, anchorElementForMenu, closeMenu } = useMenu();
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const [menuPlacement, setMenuPlacement] = useState<'top' | 'bottom'>('bottom');
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openForMenu || !anchorElementForMenu || !handleForMenu || !containerRef.current || !staticRef.current) {
      setCoords(null);
      return;
    }

    const containerRect = containerRef.current.getBoundingClientRect();
    const anchorRect = anchorElementForMenu.getBoundingClientRect();

    const estimatedWidth = handleForMenu.isSender ? 170 : 170;
    const estimatedHeight = handleForMenu.isSender
      ? (handleForMenu.canRecall ? 220 : 182)
      : 64;
    const horizontalPadding = 8;
    const verticalGap = 8;

    const spaceBelow = staticRef.current.getBoundingClientRect().bottom - anchorRect.bottom;
    const nextPlacement: 'top' | 'bottom' = spaceBelow < estimatedHeight ? 'top' : 'bottom';

    let left = handleForMenu.isSender
      ? anchorRect.right - containerRect.left - estimatedWidth
      : anchorRect.left - containerRect.left;

    const maxLeft = Math.max(
      horizontalPadding,
      containerRect.width - estimatedWidth - horizontalPadding,
    );
    left = Math.min(Math.max(left, horizontalPadding), maxLeft);

    const top = nextPlacement === 'bottom'
      ? anchorRect.bottom - containerRect.top + verticalGap
      : anchorRect.top - containerRect.top - estimatedHeight - verticalGap;

    setMenuPlacement(nextPlacement);
    setCoords({ top: Math.max(0, top), left });
  }, [anchorElementForMenu, containerRef, handleForMenu, openForMenu]);

  useEffect(() => {
    if (!openForMenu) {
      return;
    }

    const handleResize = () => {
      if (!anchorElementForMenu || !containerRef.current || !handleForMenu) {
        return;
      }

      const containerRect = containerRef.current.getBoundingClientRect();
      const anchorRect = anchorElementForMenu.getBoundingClientRect();
      const estimatedWidth = handleForMenu.isSender ? 170 : 170;
      const horizontalPadding = 8;

      let left = handleForMenu.isSender
        ? anchorRect.right - containerRect.left - estimatedWidth
        : anchorRect.left - containerRect.left;

      const maxLeft = Math.max(
        horizontalPadding,
        containerRect.width - estimatedWidth - horizontalPadding,
      );
      left = Math.min(Math.max(left, horizontalPadding), maxLeft);

      setCoords((prev) => (prev ? { ...prev, left } : prev));
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [anchorElementForMenu, containerRef, handleForMenu, openForMenu]);

  useEffect(() => {
    if (!openForMenu) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedMenu = menuRef.current?.contains(target);
      const clickedAnchor = anchorElementForMenu?.contains(target);
      if (!clickedMenu && !clickedAnchor) {
        closeMenu();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [anchorElementForMenu, closeMenu, openForMenu]);

  if (!handleForMenu || !coords || !openForMenu) {
    return null;
  }

  const {
    isSender,
    canRecall,
    menuReactions,
    handleReactionClick,
    handleDeleteForMeClick,
    handleRecallClick,
    handleForwardClick,
    handleReplyClick,
  } = handleForMenu;

  return (
    <div
      ref={menuRef}
      className={`chat-context-menu absolute z-[120] ${
        menuPlacement === 'top' ? 'origin-bottom' : 'origin-top'
      } ${
        isSender ? 'text-right' : 'text-left'
        }`}
      style={{ top: `${coords.top}px`, left: `${coords.left}px`, minWidth: '160px' }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1 px-3 py-2 border-b border-border-light">
        {menuReactions.map((emoji) => (
          <button
            key={emoji}
            onClick={() => handleReactionClick(emoji, 'menu')}
            className="reaction-menu-item p-0.5 transition-transform hover:scale-125"
            title={`React ${emoji}`} 
          >
            {emoji}
          </button>
        ))}
      </div>
      {isSender ? (
        <>
          <button
            onClick={handleDeleteForMeClick}
            className="chat-context-menu-item border-b border-border-light"
          >
            <TrashIcon className="h-4 w-4 flex-shrink-0" />
            <span>Xóa chỗ tôi</span>
          </button>
          {canRecall && (
            <button
              onClick={handleRecallClick}
              className="chat-context-menu-item border-b border-border-light"
            >
              <ArrowUturnLeftIcon className="h-4 w-4 flex-shrink-0" />
              <span>Thu hồi</span>
            </button>
          )}
          <button
            onClick={handleForwardClick}
            className="chat-context-menu-item border-b border-border-light"
          >
            <ForwardIcon className="h-4 w-4 flex-shrink-0" />
            <span>Chuyển tiếp</span>
          </button>
          <button
            onClick={handleReplyClick}
            className="chat-context-menu-item"
          >
            <ArrowUturnLeftIcon className="h-4 w-4 flex-shrink-0" />
            <span>Trả lời</span>
          </button>
        </>
      ) : (
        <>
          <button
            onClick={handleReplyClick}
            className="chat-context-menu-item"
          >
            <ArrowUturnLeftIcon className="h-4 w-4 flex-shrink-0" />
            <span>Trả lời</span>
          </button>
        </>
      )}
    </div>
  )
}
