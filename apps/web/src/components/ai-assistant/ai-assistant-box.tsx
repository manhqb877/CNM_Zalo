'use client';

import { useEffect, useRef } from 'react';
import { Bell, Check, CheckCircle2, MessageSquare, Reply, Search, Sparkles, Trash2, Users, X } from 'lucide-react';
import type { AiAssistantSearchPerson, AiAssistantSearchResult, AiGroupNote } from '@zync/shared-types';
import type { AiBoxTab } from '@/hooks/use-ai-assistant';
import { StatusBadge } from './status-badge';
import { AppLoader, ButtonSpinner } from '@/components/shared/loading-system';

type CatchupDetail = {
  _id: string;
  futureSignals?: {
    questionsForUser?: string[];
    actionItems?: Array<{ text: string; sourceMessageRefs: string[] }>;
    suggestedReplies?: string[];
  };
};

type AssistantTask = {
  _id: string;
  conversationId: string;
  title: string;
  description?: string;
  dueAt?: string;
  status: 'suggested' | 'accepted' | 'done' | 'dismissed';
  sourceMessageRefs: string[];
  conversationName?: string;
  conversationAvatarUrl?: string | null;
  conversationType?: 'direct' | 'group';
};

interface AiAssistantBoxProps {
  isOpen: boolean;
  activeTab: AiBoxTab;
  conversations: Array<{
    conversationId: string;
    name: string;
    avatarUrl?: string | null;
    type: 'direct' | 'group';
    unreadCount: number;
    updatedAt: string;
    aiStatus: 'not_started' | 'queued' | 'processing' | 'ready' | 'failed';
    aiItemId: string | null;
    aiItemRefId?: string | null;
    aiTitle: string | null;
    aiSummarySnippet: string | null;
    aiMetadata?: {
      unreadCount?: number;
      latestMessageAt?: string;
      lastDigestAt?: string;
      catchupMode?: 'unread' | 'since_last_digest' | 'recent';
      actionItemCount?: number;
      messageCount?: number;
    } | null;
  }>;
  catchupDetailsByConversationId?: Record<string, CatchupDetail>;
  tasks?: AssistantTask[];
  taskTotal?: number;
  notes?: AiGroupNote[];
  noteTotal?: number;
  searchQuery?: string;
  searchMode?: 'semantic' | 'hybrid' | 'keyword_fallback' | 'saved';
  searchAnswer?: string;
  searchPeople?: AiAssistantSearchPerson[];
  searchResults?: AiAssistantSearchResult[];
  searchTotal?: number;
  searchError?: string | null;
  items: Array<{
    _id: string;
    conversationId?: string;
    status: string;
    title?: string;
    summarySnippet?: string;
    metadata?: {
      unreadCount?: number;
      latestMessageAt?: string;
      lastDigestAt?: string;
      catchupMode?: 'unread' | 'since_last_digest' | 'recent';
      actionItemCount?: number;
      messageCount?: number;
    };
    createdAt?: string;
  }>;
  total: number;
  loadingList: boolean;
  loadingTasks?: boolean;
  loadingNotes?: boolean;
  loadingSearch?: boolean;
  loadingItems: Set<string>;
  pendingTaskCount?: number;
  onClose: () => void;
  onTabChange: (tab: AiBoxTab) => void;
  onSummarize: (conversationId: string) => void;
  onRegenerate: (conversationId: string) => void;
  onCreateTask?: (
    conversationId: string,
    actionItem: { text: string; sourceMessageRefs: string[] },
    digestId?: string,
  ) => void;
  onCompleteTask?: (taskId: string) => void;
  onDismissTask?: (taskId: string) => void;
  onAcceptTask?: (taskId: string) => void;
  onCreateNote?: (conversationId: string) => void;
  onToggleNotePin?: (noteId: string, pinned: boolean) => void;
  onDeleteNote?: (noteId: string) => void;
  onRegenerateNote?: (noteId: string) => void;
  onUseSuggestedReply?: (conversationId: string, reply: string) => void;
  onSearchQueryChange?: (query: string) => void;
  onOpenSearchResult?: (conversationId: string, messageRef: string) => void;
  onOpenChat: (conversationId: string) => void;
  onLoadMore?: () => void;
  onLoadMoreTasks?: () => void;
}

export function AiAssistantBox({
  isOpen,
  activeTab,
  conversations,
  catchupDetailsByConversationId = {},
  tasks = [],
  taskTotal = 0,
  notes = [],
  noteTotal = 0,
  searchQuery = '',
  searchMode = 'saved',
  searchAnswer,
  searchPeople = [],
  searchResults = [],
  searchTotal = 0,
  searchError = null,
  items,
  total,
  loadingList,
  loadingTasks = false,
  loadingNotes = false,
  loadingSearch = false,
  loadingItems,
  pendingTaskCount = 0,
  onClose,
  onTabChange,
  onSummarize,
  onRegenerate,
  onCreateTask = () => {},
  onCompleteTask = () => {},
  onDismissTask = () => {},
  onAcceptTask = () => {},
  onCreateNote = () => {},
  onToggleNotePin = () => {},
  onDeleteNote = () => {},
  onRegenerateNote = () => {},
  onUseSuggestedReply = () => {},
  onSearchQueryChange = () => {},
  onOpenSearchResult = () => {},
  onOpenChat,
  onLoadMore,
  onLoadMoreTasks,
}: AiAssistantBoxProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Trap scroll
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 md:hidden"
        onClick={onClose}
        aria-hidden
      />

      {/* Side panel */}
      <aside
        ref={panelRef}
        className="fixed bottom-0 right-0 top-0 z-50 flex w-full flex-col border-l border-border-soft bg-[var(--surface)] shadow-[var(--shadow-lg)] transition-transform duration-300 ease-out md:w-[min(92vw,448px)]"
        style={{ transform: 'translateX(0)' }}
        role="dialog"
        aria-label="Zync AI Assistant"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-soft bg-[var(--surface)] px-4 py-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-accent" aria-hidden />
            <h2 className="font-ui-title text-lg font-bold text-text-primary">
              Zync AI Assistant
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-[var(--surface-glass)] text-text-secondary transition hover:bg-[var(--surface-glass-strong)]"
            aria-label="Đóng"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="zync-page-tabs border-b border-border-soft bg-[var(--surface)] px-3">
          <button
            type="button"
            onClick={() => onTabChange('overview')}
            className={`shrink-0 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-semibold transition ${
              activeTab === 'overview'
                ? 'border-accent text-accent'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            Tổng quan
          </button>
          <button
            type="button"
            onClick={() => onTabChange('catchup')}
            className={`shrink-0 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-semibold transition ${
              activeTab === 'catchup'
                ? 'border-accent text-accent'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            Catch-up
            {conversations.length > 0 && (
              <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-bold text-white">
                {conversations.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => onTabChange('tasks')}
            className={`shrink-0 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-semibold transition ${
              activeTab === 'tasks'
                ? 'border-accent text-accent'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            Tasks
            {pendingTaskCount > 0 && (
              <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[11px] font-bold text-white">
                {pendingTaskCount > 9 ? '9+' : pendingTaskCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => onTabChange('notes')}
            className={`shrink-0 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-semibold transition ${
              activeTab === 'notes'
                ? 'border-accent text-accent'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            Notes
          </button>
          <button
            type="button"
            onClick={() => onTabChange('search')}
            className={`shrink-0 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-semibold transition ${
              activeTab === 'search'
                ? 'border-accent text-accent'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            Search
          </button>
        </div>

        {/* Tab content */}
        <div className="zync-scroll-area flex-1 overflow-y-auto px-4 py-4">
          {activeTab === 'overview' && <OverviewTab items={items} total={total} />}

          {activeTab === 'catchup' && (
            <CatchupTab
              conversations={conversations}
              catchupDetailsByConversationId={catchupDetailsByConversationId}
              total={total}
              loadingList={loadingList}
              loadingItems={loadingItems}
              onSummarize={onSummarize}
              onRegenerate={onRegenerate}
              onCreateTask={onCreateTask}
              onUseSuggestedReply={onUseSuggestedReply}
              onOpenChat={onOpenChat}
              onLoadMore={onLoadMore}
            />
          )}

          {activeTab === 'tasks' && (
            <TasksTab
              tasks={tasks}
              total={taskTotal}
              loadingTasks={loadingTasks}
              onCompleteTask={onCompleteTask}
              onDismissTask={onDismissTask}
              onAcceptTask={onAcceptTask}
              onOpenChat={onOpenChat}
              onLoadMore={onLoadMoreTasks}
            />
          )}

          {activeTab === 'notes' && (
            <NotesTab
              conversations={conversations}
              notes={notes}
              total={noteTotal}
              loadingNotes={loadingNotes}
              loadingItems={loadingItems}
              onCreateNote={onCreateNote}
              onTogglePin={onToggleNotePin}
              onDeleteNote={onDeleteNote}
              onRegenerateNote={onRegenerateNote}
              onOpenChat={onOpenChat}
              onOpenSource={onOpenSearchResult}
            />
          )}

          {activeTab === 'search' && (
            <SearchTab
              query={searchQuery}
              mode={searchMode}
              answer={searchAnswer}
              people={searchPeople}
              results={searchResults}
              total={searchTotal}
              error={searchError}
              loadingSearch={loadingSearch}
              onQueryChange={onSearchQueryChange}
              onOpenResult={onOpenSearchResult}
            />
          )}
        </div>
      </aside>
    </>
  );
}

// ─── Overview Tab ────────────────────────────────────────────────────────────────

function OverviewTab({
  items,
  total,
}: {
  items: AiAssistantBoxProps['items'];
  total: number;
}) {
  const readyCount = items.filter((i) => i.status === 'ready').length;
  const processingCount = items.filter((i) => i.status === 'queued' || i.status === 'processing').length;
  const notStartedCount = items.filter((i) => i.status === 'not_started').length;

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 font-ui-title text-sm font-semibold text-text-primary">Trạng thái AI</p>
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Đã tóm tắt" value={readyCount} color="text-accent-strong" />
          <StatCard label="Đang xử lý" value={processingCount} color="text-accent" />
          <StatCard label="Chưa bắt đầu" value={notStartedCount} color="text-text-tertiary" />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-[var(--surface-glass)] p-4">
        <p className="mb-2 font-ui-title text-sm font-semibold text-text-primary">AI Assistant Box</p>
        <p className="text-sm text-text-secondary">
          Tóm tắt hội thoại, tạo task, tìm semantic trong tin nhắn và lưu ghi chú nhóm có nguồn kiểm chứng.
        </p>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-text-primary">Đang hoạt động</p>
        <ul className="space-y-2">
          <FeatureItem label="Catch-up theo conversation" phase="Phase 1" done />
          <FeatureItem label="Tasks & Action Items" phase="Phase 2" done />
          <FeatureItem label="Semantic Search + Sources" phase="Phase 3" done />
          <FeatureItem label="Group Notes" phase="Phase 4" done />
        </ul>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex min-h-[70px] flex-col items-center justify-center rounded-xl border border-border bg-[var(--surface-glass)] p-3">
      <span className={`font-ui-title text-xl font-bold ${color}`}>{value}</span>
      <span className="mt-1 text-xs text-text-tertiary">{label}</span>
    </div>
  );
}

function FeatureItem({ label, phase, done = false }: { label: string; phase: string; done?: boolean }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      <span className={`h-2 w-2 shrink-0 rounded-full ${done ? 'bg-accent' : 'bg-border'}`} aria-hidden />
      <span className={done ? 'text-text-secondary' : 'text-text-primary'}>{label}</span>
      <span className="ml-auto text-[11px] text-text-tertiary">{phase}</span>
    </li>
  );
}

// ─── Catch-up Tab ────────────────────────────────────────────────────────────────

interface CatchupConversation {
  conversationId: string;
  name: string;
  avatarUrl?: string | null;
  type: 'direct' | 'group';
  unreadCount: number;
  updatedAt: string;
  aiStatus: 'not_started' | 'queued' | 'processing' | 'ready' | 'failed';
  aiItemId: string | null;
  aiItemRefId?: string | null;
  aiTitle: string | null;
  aiSummarySnippet: string | null;
  aiMetadata?: {
    unreadCount?: number;
    latestMessageAt?: string;
    lastDigestAt?: string;
    catchupMode?: 'unread' | 'since_last_digest' | 'recent';
    actionItemCount?: number;
    messageCount?: number;
  } | null;
}

function CatchupTab({
  conversations,
  catchupDetailsByConversationId = {},
  total,
  loadingList,
  loadingItems,
  onSummarize,
  onRegenerate,
  onCreateTask,
  onUseSuggestedReply,
  onOpenChat,
  onLoadMore,
}: {
  conversations: CatchupConversation[];
  catchupDetailsByConversationId?: Record<string, CatchupDetail>;
  total: number;
  loadingList: boolean;
  loadingItems: Set<string>;
  onSummarize: (id: string) => void;
  onRegenerate: (id: string) => void;
  onCreateTask: (
    conversationId: string,
    actionItem: { text: string; sourceMessageRefs: string[] },
    digestId?: string,
  ) => void;
  onUseSuggestedReply: (conversationId: string, reply: string) => void;
  onOpenChat: (id: string) => void;
  onLoadMore?: () => void;
}) {
  if (loadingList && conversations.length === 0) {
    return (
      <AppLoader layout="bare" size="md" tone="teal" message="Đang tải catch-up..." className="py-12" />
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Sparkles className="h-14 w-14 text-text-tertiary" aria-hidden />
        <p className="mt-3 text-sm font-semibold text-text-primary">Không có cuộc trò chuyện nào</p>
        <p className="mt-1 text-center text-xs text-text-secondary">
          Các cuộc trò chuyện gần đây sẽ xuất hiện ở đây.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {conversations.map((conv) => {
        const isProcessing = conv.aiStatus === 'queued' || conv.aiStatus === 'processing';
        const isLoading = isProcessing || loadingItems.has(conv.conversationId) || loadingItems.has(conv.aiItemId ?? '');
        const isReady = conv.aiStatus === 'ready';
        const catchupMode = conv.aiMetadata?.catchupMode ?? (conv.unreadCount > 0 ? 'unread' : 'recent');
        const latestMessageAt = conv.aiMetadata?.latestMessageAt ?? conv.updatedAt;
        const lastDigestAt = conv.aiMetadata?.lastDigestAt;
        const detail = catchupDetailsByConversationId[conv.conversationId];
        const actionItems = Array.from(
          new Map((detail?.futureSignals?.actionItems ?? []).map((item) => [item.text, item])).values(),
        );
        const suggestedReplies = Array.from(new Set(detail?.futureSignals?.suggestedReplies ?? []));

        return (
          <div
            key={conv.conversationId}
            className="rounded-[1.15rem] border border-border-soft bg-[var(--surface)] p-3 transition hover:border-border-strong"
          >
            {/* Header row */}
            <div className="flex items-start gap-3">
              {/* Avatar */}
              <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-[var(--surface-glass)]">
                {conv.avatarUrl ? (
                  <img src={conv.avatarUrl} alt={conv.name} className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-xs font-semibold text-text-secondary">
                    {conv.name.slice(0, 2).toUpperCase()}
                  </span>
                )}
                {conv.type === 'group' && (
                  <div className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[9px] text-white">
                    G
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <p className="truncate font-semibold text-text-primary">{conv.name}</p>
                  <StatusBadge status={conv.aiStatus} />
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-tertiary">
                  <span>{conv.unreadCount > 0 ? `${conv.unreadCount} tin chưa đọc` : 'Đã đọc gần đây'}</span>
                  <span>·</span>
                  <span>{getCatchupModeLabel(catchupMode)}</span>
                  {latestMessageAt && (
                    <>
                      <span>·</span>
                      <span>Tin mới {formatTimeAgo(latestMessageAt)}</span>
                    </>
                  )}
                  {lastDigestAt && (
                    <>
                      <span>·</span>
                      <span>Tóm tắt {formatTimeAgo(lastDigestAt)}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Digest snippet (nếu đã có) */}
            {isReady && conv.aiSummarySnippet && (
              <p className="mt-2 text-xs text-text-secondary line-clamp-2">{conv.aiSummarySnippet}</p>
            )}

            {isReady && actionItems.length > 0 && (
              <div className="mt-3 border-t border-border pt-3">
                <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase text-accent">
                  <Bell className="h-3.5 w-3.5" aria-hidden />
                  Action items
                </div>
                {actionItems.slice(0, 3).map((actionItem, index) => (
                  <div key={`${actionItem.text}-${index}`} className="flex items-start gap-2 py-1.5">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
                    <p className="min-w-0 flex-1 text-xs font-medium leading-relaxed text-text-secondary">
                      {actionItem.text}
                    </p>
                    <button
                      type="button"
                      onClick={() => onCreateTask(conv.conversationId, actionItem, detail?._id)}
                      className="shrink-0 rounded-md border border-border-soft bg-[var(--accent-soft)] px-2 py-1 text-[11px] font-bold text-accent-strong transition hover:border-border-strong"
                    >
                      Nhắc tôi
                    </button>
                  </div>
                ))}
              </div>
            )}

            {isReady && suggestedReplies.length > 0 && (
              <div className="mt-3 border-t border-border pt-3">
                <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase text-accent">
                  <Reply className="h-3.5 w-3.5" aria-hidden />
                  Suggested replies
                </div>
                <div className="flex flex-wrap gap-2">
                {suggestedReplies.slice(0, 3).map((reply) => (
                  <button
                    key={reply}
                    type="button"
                    onClick={() => onUseSuggestedReply(conv.conversationId, reply)}
                    className="max-w-full rounded-full border border-border-soft bg-[var(--accent-soft)] px-3 py-1.5 text-left text-xs font-semibold leading-relaxed text-accent-strong transition hover:border-border-strong hover:bg-accent-light"
                  >
                    {reply}
                  </button>
                ))}
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="mt-3 flex items-center gap-2">
              {catchupMode ? (
                <button
                  type="button"
                  onClick={() => onSummarize(conv.conversationId)}
                  disabled={isLoading}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isLoading ? (
                    <ButtonSpinner size="xs" tone="light" />
                  ) : (
                    <MessageSquare className="h-3 w-3" aria-hidden />
                  )}
                  {isProcessing ? 'Đang tóm tắt' : conv.aiStatus === 'failed' ? 'Thử lại' : 'Tóm tắt'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onRegenerate(conv.conversationId)}
                  disabled={isLoading}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isLoading ? (
                    <ButtonSpinner size="xs" tone="muted" />
                  ) : null}
                  Tạo lại
                </button>
              )}

              <div className="flex-1" />

              <button
                type="button"
                onClick={() => onOpenChat(conv.conversationId)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-[var(--surface-glass)] px-3 py-1.5 text-xs font-medium text-text-primary transition hover:bg-[var(--surface-glass-strong)]"
              >
                Mở chat
              </button>
            </div>
          </div>
        );
      })}

      {/* Load more */}
      {conversations.length < total && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={loadingList}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-[var(--surface-glass)] px-4 py-3 text-sm font-medium text-text-secondary transition hover:bg-[var(--surface-glass-strong)] disabled:opacity-50"
        >
          {loadingList ? (
            <ButtonSpinner size="sm" tone="muted" />
          ) : null}
          Tải thêm ({conversations.length}/{total})
        </button>
      )}
    </div>
  );
}

function TasksTab({
  tasks,
  total,
  loadingTasks,
  onAcceptTask,
  onCompleteTask,
  onDismissTask,
  onOpenChat,
  onLoadMore,
}: {
  tasks: AssistantTask[];
  total: number;
  loadingTasks: boolean;
  onAcceptTask: (taskId: string) => void;
  onCompleteTask: (taskId: string) => void;
  onDismissTask: (taskId: string) => void;
  onOpenChat: (conversationId: string) => void;
  onLoadMore?: () => void;
}) {
  if (loadingTasks && tasks.length === 0) {
    return (
      <AppLoader layout="bare" size="md" tone="teal" message="Đang tải task..." className="py-12" />
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Bell className="h-14 w-14 text-text-tertiary" aria-hidden />
        <p className="mt-3 text-sm font-semibold text-text-primary">Không có task đang mở</p>
        <p className="mt-1 text-center text-xs text-text-secondary">
          Action item từ Catch-up sẽ xuất hiện ở đây.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {tasks.map((task) => (
        <div
          key={task._id}
          className="rounded-[1.15rem] border border-border-soft bg-[var(--surface)] p-4 transition hover:border-border-strong"
        >
          <div className="flex items-start gap-3">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
              task.status === 'suggested'
                ? 'bg-[var(--accent-soft)] text-accent'
                : 'bg-[var(--success-bg)] text-[var(--success-text)]'
            }`}>
              {task.status === 'suggested' ? (
                <Bell className="h-4 w-4" aria-hidden />
              ) : (
                <CheckCircle2 className="h-4 w-4" aria-hidden />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-2">
                <p className="min-w-0 flex-1 text-sm font-semibold leading-snug text-text-primary">{task.title}</p>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                  task.status === 'suggested'
                    ? 'bg-[var(--accent-soft)] text-accent'
                    : 'bg-[var(--success-bg)] text-[var(--success-text)]'
                }`}>
                  {task.status === 'suggested' ? 'Suggested' : 'Reminder'}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-tertiary">
                <span>{task.conversationName ?? 'Cuộc trò chuyện'}</span>
                {task.dueAt && (
                  <>
                    <span>·</span>
                    <span>{formatDueLabel(task.dueAt)}</span>
                  </>
                )}
              </div>
              {task.description && (
                <p className="mt-2 line-clamp-2 text-xs text-text-secondary">{task.description}</p>
              )}
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            {task.status === 'suggested' ? (
              <button
                type="button"
                onClick={() => onAcceptTask(task._id)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-accent-hover"
              >
                <Bell className="h-3 w-3" aria-hidden />
                Nhắc tôi
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onCompleteTask(task._id)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-accent-hover"
              >
                <Check className="h-3 w-3" aria-hidden />
                Xong
              </button>
            )}
            <button
              type="button"
              onClick={() => onDismissTask(task._id)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-[var(--surface-glass)] px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:bg-[var(--surface-glass-strong)]"
            >
              <Trash2 className="h-3 w-3" aria-hidden />
              Bỏ qua
            </button>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => onOpenChat(task.conversationId)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-[var(--surface-glass)] px-3 py-1.5 text-xs font-medium text-text-primary transition hover:bg-[var(--surface-glass-strong)]"
            >
              Mở chat
            </button>
          </div>
        </div>
      ))}

      {tasks.length < total && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={loadingTasks}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-[var(--surface-glass)] px-4 py-3 text-sm font-medium text-text-secondary transition hover:bg-[var(--surface-glass-strong)] disabled:opacity-50"
        >
          {loadingTasks ? <ButtonSpinner size="sm" tone="muted" /> : null}
          Tải thêm ({tasks.length}/{total})
        </button>
      )}
    </div>
  );
}

function NotesTab({
  conversations,
  notes,
  total,
  loadingNotes,
  loadingItems,
  onCreateNote,
  onTogglePin,
  onDeleteNote,
  onRegenerateNote,
  onOpenChat,
  onOpenSource,
}: {
  conversations: AiAssistantBoxProps['conversations'];
  notes: AiGroupNote[];
  total: number;
  loadingNotes: boolean;
  loadingItems: Set<string>;
  onCreateNote: (conversationId: string) => void;
  onTogglePin: (noteId: string, pinned: boolean) => void;
  onDeleteNote: (noteId: string) => void;
  onRegenerateNote: (noteId: string) => void;
  onOpenChat: (conversationId: string) => void;
  onOpenSource: (conversationId: string, messageRef: string) => void;
}) {
  const createTargets = conversations.slice(0, 6);

  if (loadingNotes && notes.length === 0) {
    return (
      <AppLoader layout="bare" size="md" tone="teal" message="Đang tải ghi chú..." className="py-12" />
    );
  }

  return (
    <div className="space-y-3">
      {createTargets.length > 0 && (
        <div className="rounded-xl border border-border bg-[var(--surface-card)] p-3">
          <p className="mb-2 text-xs font-semibold text-text-secondary">Tạo ghi chú cho conversation</p>
          <div className="flex flex-wrap gap-2">
            {createTargets.map((conversation) => {
              const loading = loadingItems.has(conversation.conversationId);
              return (
                <button
                  key={conversation.conversationId}
                  type="button"
                  onClick={() => onCreateNote(conversation.conversationId)}
                  disabled={loading}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border bg-[var(--surface-glass)] px-3 py-1.5 text-xs font-medium text-text-primary transition hover:bg-[var(--surface-glass-strong)] disabled:opacity-50"
                >
                  {loading ? <ButtonSpinner size="xs" tone="muted" /> : <MessageSquare className="h-3 w-3" aria-hidden />}
                  <span className="truncate">{conversation.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {notes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12">
          <MessageSquare className="h-14 w-14 text-text-tertiary" aria-hidden />
          <p className="mt-3 text-sm font-semibold text-text-primary">Chưa có ghi chú nhóm</p>
          <p className="mt-1 text-center text-xs text-text-secondary">
            Chọn một conversation ở trên để tạo ghi chú từ tin nhắn gần nhất.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between text-xs text-text-tertiary">
            <span>Ghi chú đã lưu</span>
            <span>{total} ghi chú</span>
          </div>
          <div className="space-y-2">
            {notes.map((note) => {
              const sourceRef = note.sourceMessageRefs[0] ?? note.toMessageRef;
              const loading = loadingItems.has(note._id);
              return (
                <div
                  key={note._id}
                  className="rounded-xl border border-border bg-[var(--surface-card)] p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold text-text-primary">
                          {note.title || 'Ghi chú nhóm'}
                        </p>
                        {note.pinned && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
                            Ghim
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-text-tertiary">
                        {note.conversationName ?? 'Cuộc trò chuyện'} · {formatSearchTimestamp(note.generatedAt ?? note.updatedAt)}
                      </p>
                    </div>
                    <StatusBadge status={note.status} />
                  </div>

                  {note.content && (
                    <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-text-secondary">
                      {note.content}
                    </p>
                  )}

                  <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-text-tertiary">
                    <span>{note.messageCount} tin</span>
                    <span>·</span>
                    <span>{note.decisions.length} quyết định</span>
                    <span>·</span>
                    <span>{note.openQuestions.length} câu hỏi mở</span>
                    {note.actionItems.length > 0 && (
                      <>
                        <span>·</span>
                        <span>{note.actionItems.length} việc cần làm</span>
                      </>
                    )}
                  </div>

                  {note.status === 'failed' && note.error && (
                    <p className="mt-2 rounded-lg bg-red-50 px-2 py-1 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-200">
                      {note.error}
                    </p>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenChat(note.conversationId)}
                      className="rounded-lg border border-border bg-[var(--surface-glass)] px-3 py-1.5 text-xs font-medium text-text-primary transition hover:bg-[var(--surface-glass-strong)]"
                    >
                      Mở chat
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenSource(note.conversationId, sourceRef)}
                      className="rounded-lg border border-border bg-[var(--surface-glass)] px-3 py-1.5 text-xs font-medium text-text-primary transition hover:bg-[var(--surface-glass-strong)]"
                    >
                      Xem nguồn
                    </button>
                    <button
                      type="button"
                      onClick={() => onTogglePin(note._id, !note.pinned)}
                      className="rounded-lg border border-border bg-[var(--surface-glass)] px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:bg-[var(--surface-glass-strong)]"
                    >
                      {note.pinned ? 'Bỏ ghim' : 'Ghim'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onRegenerateNote(note._id)}
                      disabled={loading}
                      className="rounded-lg border border-border bg-[var(--surface-glass)] px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:bg-[var(--surface-glass-strong)] disabled:opacity-50"
                    >
                      {loading ? 'Đang tạo...' : 'Tạo lại'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteNote(note._id)}
                      className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-100 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200"
                    >
                      Xóa
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function SearchTab({
  query,
  mode,
  answer,
  people,
  results,
  total,
  error,
  loadingSearch,
  onQueryChange,
  onOpenResult,
}: {
  query: string;
  mode: 'semantic' | 'hybrid' | 'keyword_fallback' | 'saved';
  answer?: string;
  people: AiAssistantSearchPerson[];
  results: AiAssistantSearchResult[];
  total: number;
  error?: string | null;
  loadingSearch: boolean;
  onQueryChange: (query: string) => void;
  onOpenResult: (conversationId: string, messageRef: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="sticky top-0 z-10 -mx-4 bg-[var(--surface-card)] px-4 pb-3">
        <div className="flex items-center gap-2 rounded-xl border border-border bg-[var(--surface-glass)] px-3 py-2 focus-within:border-accent/60">
          <Search className="h-4 w-4 shrink-0 text-text-tertiary" aria-hidden />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Tìm trong tin nhắn"
            className="min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-tertiary"
          />
          {loadingSearch && <ButtonSpinner size="sm" tone="muted" />}
        </div>
      </div>

      {loadingSearch && results.length === 0 ? (
        <AppLoader layout="bare" size="md" tone="teal" message="Đang tìm..." className="py-12" />
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      ) : results.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12">
          <Search className="h-14 w-14 text-text-tertiary" aria-hidden />
          <p className="mt-3 text-sm font-semibold text-text-primary">
            {query.trim() ? 'Không có kết quả phù hợp' : 'Chưa có tìm kiếm gần đây'}
          </p>
          <p className="mt-1 text-center text-xs text-text-secondary">
            Nhập từ khóa hoặc câu hỏi để tìm ngữ nghĩa trong hội thoại.
          </p>
        </div>
      ) : (
        <>
          {answer && (
            <div className="rounded-xl border border-accent/20 bg-accent/10 px-3 py-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase text-accent">AI answer</span>
                <span className="rounded-full bg-[var(--surface-card)] px-2 py-0.5 text-[10px] font-semibold text-text-tertiary">
                  {getSearchModeLabel(mode)}
                </span>
              </div>
              <p className="text-sm font-medium text-text-primary">{answer}</p>
            </div>
          )}
          {people.length > 0 && (
            <div className="rounded-xl border border-border bg-[var(--surface-card)] p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-bold text-text-primary">
                <Users className="h-4 w-4 text-accent" aria-hidden />
                Người liên quan nhất
              </div>
              <div className="space-y-2">
                {people.slice(0, 3).map((person) => (
                  <div key={`${person.senderId}:${person.evidenceMessageRefs.join(',')}`} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-text-primary">{person.senderName}</p>
                      <p className="line-clamp-2 text-xs text-text-secondary">{person.reason}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-bold text-accent">{Math.round(person.score * 100)}%</p>
                      <p className="text-[10px] text-text-tertiary">{person.count} nguồn</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-center justify-between text-xs text-text-tertiary">
            <span>{query.trim() ? `Kết quả cho "${query}"` : 'Tìm kiếm gần đây'}</span>
            <span>{total} kết quả</span>
          </div>

          <div className="space-y-2">
            {results.map((result) => (
              <button
                key={result.itemId ?? `${result.conversationId}:${result.messageRef}`}
                type="button"
                onClick={() => onOpenResult(result.conversationId, result.messageRef)}
                className="w-full rounded-xl border border-border bg-[var(--surface-card)] p-3 text-left transition hover:border-accent/50 hover:bg-[var(--surface-glass)]"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-glass)] text-xs font-bold text-text-secondary">
                    {result.conversationName.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-text-primary">
                        {result.senderName} · {result.conversationName}
                      </p>
                      {typeof result.score === 'number' && (
                        <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-bold text-accent">
                          {Math.round(result.score * 100)}%
                        </span>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-text-secondary" title={result.messageRef}>
                      {highlightSearchTerms(result.messageSnippet || result.snippet, query)}
                    </p>
                    {result.matchReason && (
                      <p className="mt-1 line-clamp-2 text-[11px] text-text-tertiary">
                        {result.matchReason}
                      </p>
                    )}
                    <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-text-tertiary">
                      <span>{formatSearchTimestamp(result.timestamp)}</span>
                      <span className="font-semibold text-accent">Xem tin nhắn</span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function getCatchupModeLabel(mode?: 'unread' | 'since_last_digest' | 'recent'): string {
  if (mode === 'unread') return 'Tin chưa đọc';
  if (mode === 'since_last_digest') return 'Tin mới sau tóm tắt';
  return 'Tóm tắt gần đây';
}

function formatSearchTimestamp(isoDate?: string): string {
  if (!isoDate) return '';
  const date = new Date(isoDate);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getSearchModeLabel(mode: 'semantic' | 'hybrid' | 'keyword_fallback' | 'saved'): string {
  if (mode === 'semantic') return 'Semantic';
  if (mode === 'hybrid') return 'Semantic + keyword';
  if (mode === 'keyword_fallback') return 'Keyword fallback';
  return 'Đã lưu';
}

function highlightSearchTerms(text: string, query: string) {
  const source = text || '';
  const terms = Array.from(new Set(
    query
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/gi, 'd')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((term) => term.length >= 3),
  ));

  if (terms.length === 0) return source;

  const escapedTerms = terms.map(termToVietnameseRegex);
  const regex = new RegExp(`(${escapedTerms.join('|')})`, 'ig');
  const parts = source.split(regex);

  return parts.map((part, index) => {
    const normalizedPart = part
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/gi, 'd')
      .toLowerCase();
    const isMatch = terms.includes(normalizedPart);

    return isMatch ? (
      <mark key={`${part}-${index}`} className="rounded bg-yellow-200 px-0.5 text-yellow-950 dark:bg-yellow-700 dark:text-yellow-50">
        {part}
      </mark>
    ) : part;
  });
}

function termToVietnameseRegex(term: string): string {
  const classes: Record<string, string> = {
    a: '[aáàảãạăắằẳẵặâấầẩẫậ]',
    e: '[eéèẻẽẹêếềểễệ]',
    i: '[iíìỉĩị]',
    o: '[oóòỏõọôốồổỗộơớờởỡợ]',
    u: '[uúùủũụưứừửữự]',
    y: '[yýỳỷỹỵ]',
    d: '[dđ]',
  };

  return term
    .split('')
    .map((char) => classes[char] ?? char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('');
}

function formatDueLabel(isoDate: string): string {
  const date = new Date(isoDate);
  if (!Number.isFinite(date.getTime())) return '';
  return `Hạn ${date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}`;
}

function formatTimeAgo(isoDate?: string): string {
  if (!isoDate) return '';
  const now = Date.now();
  const date = new Date(isoDate).getTime();
  const diff = Math.floor((now - date) / 1000);

  if (diff < 60) return `${diff} giây trước`;
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  return `${Math.floor(diff / 86400)} ngày trước`;
}
