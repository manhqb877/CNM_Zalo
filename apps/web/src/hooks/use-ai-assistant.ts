'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AiAssistantItem,
  AiAssistantItemPayload,
  AiAssistantSearchPerson,
  AiAssistantSearchResult,
  AiCatchupDigest,
  AiGroupNote,
  AiReminderUpdatedPayload,
} from '@zync/shared-types';
import {
  getUnreadConversations,
  createCatchupDigest,
  getCatchupLatest,
  getAssistantTasks,
  createAssistantTask,
  updateAssistantTask,
  regenerateCatchup,
  searchAssistantMessages,
  listGroupNotes,
  createGroupNote,
  updateGroupNote,
  deleteGroupNote,
  regenerateGroupNote,
  type AssistantTask,
  type ConversationWithAiDigest,
} from '@/services/ai-assistant';
import {
  listenToAiAssistantItemUpdated,
  unlistenToAiAssistantItemUpdated,
  listenToAiReminderUpdated,
  unlistenToAiReminderUpdated,
  getRawSocket,
} from '@/services/socket';

export type AiBoxTab = 'overview' | 'catchup' | 'tasks' | 'search' | 'notes';
const PROCESSING_POLL_INTERVAL_MS = 5000;
const SEARCH_DEBOUNCE_MS = 300;

interface UseAiAssistantOptions {
  /** Số conversation hiển thị tối đa trong AI Box */
  defaultLimit?: number;
}

export function useAiAssistant(options: UseAiAssistantOptions = {}) {
  const { defaultLimit = 10 } = options;

  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<AiBoxTab>('catchup');
  /** Recent conversations + AI state for Catch-up. */
  const [conversations, setConversations] = useState<ConversationWithAiDigest[]>([]);
  const [catchupDetailsByConversationId, setCatchupDetailsByConversationId] = useState<Record<string, AiCatchupDigest>>({});
  const [tasks, setTasks] = useState<AssistantTask[]>([]);
  const [taskTotal, setTaskTotal] = useState(0);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [notes, setNotes] = useState<AiGroupNote[]>([]);
  const [noteTotal, setNoteTotal] = useState(0);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'semantic' | 'hybrid' | 'keyword_fallback' | 'saved'>('saved');
  const [searchAnswer, setSearchAnswer] = useState<string | undefined>();
  const [searchPeople, setSearchPeople] = useState<AiAssistantSearchPerson[]>([]);
  const [searchResults, setSearchResults] = useState<AiAssistantSearchResult[]>([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [loadingSearch, setLoadingSearch] = useState(false);
  /** Legacy AI items (dùng cho tổng hợp, không còn là nguồn chính) */
  const [items, setItems] = useState<AiAssistantItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingItems, setLoadingItems] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const loadingRef = useRef(false);
  const skipRef = useRef(0);
  const taskSkipRef = useRef(0);
  const searchRequestSeqRef = useRef(0);

  const hydrateCatchupDetails = useCallback(async (targets: ConversationWithAiDigest[]) => {
    const readyTargets = targets.filter((conversation) => conversation.aiStatus === 'ready');
    if (readyTargets.length === 0) return;

    const results = await Promise.allSettled(
      readyTargets.map((conversation) => getCatchupLatest(conversation.conversationId)),
    );

    setCatchupDetailsByConversationId((prev) => {
      let changed = false;
      const next = { ...prev };

      results.forEach((result, index) => {
        if (result.status !== 'fulfilled' || !result.value?.detail) return;
        const conversationId = readyTargets[index]?.conversationId;
        if (!conversationId) return;
        next[conversationId] = result.value.detail;
        changed = true;
      });

      return changed ? next : prev;
    });
  }, []);

  const loadTasks = useCallback(async (reset = true) => {
    setLoadingTasks(true);
    setError(null);

    try {
      const result = await getAssistantTasks({
        status: 'active',
        limit: 20,
        skip: reset ? 0 : taskSkipRef.current,
      });

      if (reset) {
        setTasks(result.tasks);
        taskSkipRef.current = result.tasks.length;
      } else {
        setTasks((prev) => [...prev, ...result.tasks]);
        taskSkipRef.current += result.tasks.length;
      }
      setTaskTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks');
    } finally {
      setLoadingTasks(false);
    }
  }, []);

  const loadSearchResults = useCallback(async (
    query: string = searchQuery,
    options: { hydrateQuery?: boolean } = {},
  ) => {
    const requestSeq = searchRequestSeqRef.current + 1;
    searchRequestSeqRef.current = requestSeq;
    setLoadingSearch(true);
    setError(null);

    try {
      const result = await searchAssistantMessages({
        q: query,
        limit: 20,
      });

      if (searchRequestSeqRef.current !== requestSeq) return;
      setSearchMode(result.mode);
      setSearchAnswer(result.answer);
      setSearchPeople(result.people ?? []);
      setSearchResults(result.results);
      setSearchTotal(result.total);
      if (options.hydrateQuery && !query.trim() && result.query) {
        setSearchQuery(result.query);
      }
    } catch (err) {
      if (searchRequestSeqRef.current !== requestSeq) return;
      setError(err instanceof Error ? err.message : 'Failed to search messages');
    } finally {
      if (searchRequestSeqRef.current === requestSeq) {
        setLoadingSearch(false);
      }
    }
  }, [searchQuery]);

  const loadNotes = useCallback(async () => {
    setLoadingNotes(true);
    setError(null);
    try {
      const result = await listGroupNotes({ limit: 30, status: 'all' });
      setNotes(result.notes);
      setNoteTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notes');
    } finally {
      setLoadingNotes(false);
    }
  }, []);

  const createNote = useCallback(async (conversationId: string) => {
    setLoadingItems((prev) => new Set([...prev, conversationId]));
    try {
      const result = await createGroupNote(conversationId);
      setNotes((prev) => [result.detail, ...prev.filter((note) => note._id !== result.detail._id)]);
      setNoteTotal((prev) => Math.max(prev, prev + (notes.some((note) => note._id === result.detail._id) ? 0 : 1)));
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create note');
      throw err;
    } finally {
      setLoadingItems((prev) => {
        const next = new Set(prev);
        next.delete(conversationId);
        return next;
      });
    }
  }, [notes]);

  const toggleNotePin = useCallback(async (noteId: string, pinned: boolean) => {
    try {
      const updated = await updateGroupNote(noteId, { pinned });
      setNotes((prev) => prev
        .map((note) => (note._id === noteId ? updated : note))
        .sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update note');
      throw err;
    }
  }, []);

  const removeNote = useCallback(async (noteId: string) => {
    try {
      await deleteGroupNote(noteId);
      setNotes((prev) => prev.filter((note) => note._id !== noteId));
      setNoteTotal((prev) => Math.max(0, prev - 1));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete note');
      throw err;
    }
  }, []);

  const regenerateNote = useCallback(async (noteId: string) => {
    setLoadingItems((prev) => new Set([...prev, noteId]));
    try {
      const result = await regenerateGroupNote(noteId);
      setNotes((prev) => prev.map((note) => (note._id === noteId ? result.detail : note)));
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate note');
      throw err;
    } finally {
      setLoadingItems((prev) => {
        const next = new Set(prev);
        next.delete(noteId);
        return next;
      });
    }
  }, []);

  // ── Socket handler ─────────────────────────────────────────────────────────────

  const handleSocketUpdate = useCallback((payload: AiAssistantItemPayload) => {
    if (payload.type === 'catchup_digest' && payload.conversationId && payload.detail) {
      setCatchupDetailsByConversationId((prev) => ({
        ...prev,
        [payload.conversationId!]: payload.detail as AiCatchupDigest,
      }));
    }

    if (payload.type === 'task') {
      void loadTasks(true);
      return;
    }

    if (payload.type === 'group_note') {
      if (payload.metadata?.deleted && payload.metadata.noteId) {
        setNotes((prev) => prev.filter((note) => note._id !== payload.metadata?.noteId));
        return;
      }
      if (payload.detail) {
        const detail = payload.detail as AiGroupNote;
        setNotes((prev) => {
          const exists = prev.some((note) => note._id === detail._id);
          const next = exists
            ? prev.map((note) => (note._id === detail._id ? { ...note, ...detail } : note))
            : [detail, ...prev];
          return next.sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        });
      } else {
        void loadNotes();
      }
      if (payload.status === 'ready' || payload.status === 'failed') {
        setLoadingItems((prev) => {
          const next = new Set(prev);
          next.delete(payload.itemId);
          if (payload.conversationId) next.delete(payload.conversationId);
          if (payload.metadata?.noteId) next.delete(payload.metadata.noteId);
          return next;
        });
      }
      return;
    }

    // Cập nhật conversations state (nguồn chính cho Phase 1)
    setConversations((prev) => {
      const idx = prev.findIndex((c) => c.conversationId === payload.conversationId);
      if (idx === -1) return prev;

      const updated = [...prev];
      updated[idx] = {
        ...updated[idx],
        aiStatus: payload.status as ConversationWithAiDigest['aiStatus'],
        aiItemId: payload.itemId ?? updated[idx].aiItemId,
        aiTitle: payload.title ?? updated[idx].aiTitle,
        aiSummarySnippet: payload.summarySnippet ?? updated[idx].aiSummarySnippet,
        aiMetadata: payload.metadata
          ? { ...updated[idx].aiMetadata, ...payload.metadata }
          : updated[idx].aiMetadata,
      };
      return updated;
    });

    // Cập nhật legacy items state
    setItems((prev) => {
      const exists = prev.some((item) => item._id === payload.itemId);
      if (exists) {
        return prev.map((item) =>
          item._id === payload.itemId
            ? {
                ...item,
                status: payload.status,
                title: payload.title ?? item.title,
                summarySnippet: payload.summarySnippet ?? item.summarySnippet,
                metadata: payload.metadata ? { ...item.metadata, ...payload.metadata } : item.metadata,
                updatedAt: payload.updatedAt,
              }
            : item,
        );
      }
      if (payload.status === 'queued' || payload.status === 'processing') {
        return [
          {
            _id: payload.itemId,
            userId: '',
            type: payload.type,
            conversationId: payload.conversationId ?? '',
            status: payload.status,
            title: payload.title,
            summarySnippet: payload.summarySnippet,
            metadata: payload.metadata,
            trigger: 'manual',
            createdAt: payload.updatedAt,
            updatedAt: payload.updatedAt,
          },
          ...prev,
        ];
      }
      return prev;
    });

    // Clear loading khi done/failed
    if (payload.status === 'ready' || payload.status === 'failed') {
      setLoadingItems((prev) => {
        const next = new Set(prev);
        next.delete(payload.itemId);
        if (payload.conversationId) next.delete(payload.conversationId);
        return next;
      });
    }
  }, [loadNotes, loadTasks]);

  // ── Load recent conversations for Catch-up ────────────────────────────────────

  const loadConversations = useCallback(
    async (reset = false) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      setLoadingList(true);
      setError(null);

      try {
        const result = await getUnreadConversations({
          limit: defaultLimit,
          skip: reset ? 0 : skipRef.current,
        });

        if (reset) {
          setConversations(result.conversations);
          skipRef.current = defaultLimit;
        } else {
          setConversations((prev) => [...prev, ...result.conversations]);
          skipRef.current += defaultLimit;
        }
        setTotal(result.total);
        void hydrateCatchupDetails(result.conversations);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load conversations');
      } finally {
        loadingRef.current = false;
        setLoadingList(false);
      }
    },
    [defaultLimit, hydrateCatchupDetails],
  );

  // Alias để layout gọi được loadItems
  const loadItems = loadConversations;

  // ── Create digest ──────────────────────────────────────────────────────────────

  const createDigest = useCallback(async (conversationId: string) => {
    setLoadingItems((prev) => new Set([...prev, conversationId]));
    setConversations((prev) => prev.map((conversation) =>
      conversation.conversationId === conversationId
        ? {
            ...conversation,
            aiStatus: 'queued',
            aiTitle: conversation.aiTitle ?? 'Đang tóm tắt hội thoại',
          }
        : conversation,
    ));

    try {
      const result = await createCatchupDigest({ conversationId, trigger: 'manual' });

      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.conversationId === conversationId);
        if (idx !== -1) {
          const updated = [...prev];
          updated[idx] = {
            ...updated[idx],
            aiStatus: result.item.status,
            aiItemId: result.item._id,
            aiTitle: result.item.title ?? null,
            aiSummarySnippet: result.item.summarySnippet ?? updated[idx].aiSummarySnippet,
            aiMetadata: result.item.metadata ?? updated[idx].aiMetadata,
          };
          return updated;
        }
        return prev;
      });

      return result;
    } catch (err) {
      setConversations((prev) => prev.map((conversation) =>
        conversation.conversationId === conversationId
          ? { ...conversation, aiStatus: 'failed' }
          : conversation,
      ));
      setError(err instanceof Error ? err.message : 'Failed to create digest');
      throw err;
    } finally {
      setLoadingItems((prev) => {
        const next = new Set(prev);
        next.delete(conversationId);
        return next;
      });
    }
  }, []);

  // ── Regenerate digest ──────────────────────────────────────────────────────────

  const doRegenerate = useCallback(async (conversationId: string) => {
    setLoadingItems((prev) => new Set([...prev, conversationId]));
    setConversations((prev) => prev.map((conversation) =>
      conversation.conversationId === conversationId
        ? {
            ...conversation,
            aiStatus: 'queued',
            aiTitle: conversation.aiTitle ?? 'Đang tóm tắt hội thoại',
          }
        : conversation,
    ));

    try {
      const result = await regenerateCatchup(conversationId);

      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.conversationId === conversationId);
        if (idx !== -1) {
          const updated = [...prev];
          updated[idx] = {
            ...updated[idx],
            aiStatus: result.item.status,
            aiItemId: result.item._id,
            aiTitle: result.item.title ?? null,
            aiSummarySnippet: result.item.summarySnippet ?? updated[idx].aiSummarySnippet,
            aiMetadata: result.item.metadata ?? updated[idx].aiMetadata,
          };
          return updated;
        }
        return prev;
      });
    } catch (err) {
      setConversations((prev) => prev.map((conversation) =>
        conversation.conversationId === conversationId
          ? { ...conversation, aiStatus: 'failed' }
          : conversation,
      ));
      setError(err instanceof Error ? err.message : 'Failed to regenerate digest');
      throw err;
    } finally {
      setLoadingItems((prev) => {
        const next = new Set(prev);
        next.delete(conversationId);
        return next;
      });
    }
  }, []);

  const createTaskFromActionItem = useCallback(async (
    conversationId: string,
    actionItem: { text: string; sourceMessageRefs: string[] },
    digestId?: string,
  ) => {
    try {
      await createAssistantTask({
        conversationId,
        digestId,
        sourceMessageRefs: actionItem.sourceMessageRefs,
        title: actionItem.text,
        createdBy: 'ai_suggestion',
        status: 'accepted',
      });
      await loadTasks(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task');
      throw err;
    }
  }, [loadTasks]);

  const completeTask = useCallback(async (taskId: string) => {
    try {
      await updateAssistantTask(taskId, { status: 'done' });
      setTasks((prev) => prev.filter((task) => task._id !== taskId));
      setTaskTotal((prev) => Math.max(0, prev - 1));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete task');
      throw err;
    }
  }, []);

  const acceptTask = useCallback(async (taskId: string) => {
    try {
      const updatedTask = await updateAssistantTask(taskId, { status: 'accepted' });
      setTasks((prev) => prev.map((task) => (task._id === taskId ? updatedTask : task)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept task');
      throw err;
    }
  }, []);

  const dismissTask = useCallback(async (taskId: string) => {
    try {
      await updateAssistantTask(taskId, { status: 'dismissed' });
      setTasks((prev) => prev.filter((task) => task._id !== taskId));
      setTaskTotal((prev) => Math.max(0, prev - 1));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to dismiss task');
      throw err;
    }
  }, []);

  const handleReminderUpdate = useCallback((payload: AiReminderUpdatedPayload) => {
    if (payload.status === 'suggested' || payload.status === 'accepted') {
      void loadTasks(true);
      return;
    }

    setTasks((prev) => prev.filter((task) => task._id !== payload._id));
    setTaskTotal((prev) => Math.max(0, prev - 1));
  }, [loadTasks]);

  // ── Open / Close ───────────────────────────────────────────────────────────────

  const openBox = useCallback(() => {
    setIsOpen(true);
    void loadConversations(true);
    void loadTasks(true);
    void loadNotes();
    void loadSearchResults('', { hydrateQuery: true });
  }, [loadConversations, loadNotes, loadSearchResults, loadTasks]);

  const closeBox = useCallback(() => {
    setIsOpen(false);
  }, []);

  // ── Socket lifecycle ───────────────────────────────────────────────────────────

  useEffect(() => {
    const socket = getRawSocket();
    if (!socket) return;

    listenToAiAssistantItemUpdated(handleSocketUpdate);
    listenToAiReminderUpdated(handleReminderUpdate);
    return () => {
      unlistenToAiAssistantItemUpdated(handleSocketUpdate);
      unlistenToAiReminderUpdated(handleReminderUpdate);
    };
  }, [handleSocketUpdate, handleReminderUpdate]);

  useEffect(() => {
    if (!isOpen) return;

    const processingConversations = conversations.filter(
      (conversation) => conversation.aiStatus === 'queued' || conversation.aiStatus === 'processing',
    );

    if (processingConversations.length === 0) return;

    const pollProcessing = async () => {
      const results = await Promise.allSettled(
        processingConversations.map((conversation) => getCatchupLatest(conversation.conversationId)),
      );

      setConversations((prev) => {
        let changed = false;
        const next = [...prev];

        results.forEach((result, index) => {
          if (result.status !== 'fulfilled' || !result.value?.item) return;

          const polled = result.value;
          const conversationId = processingConversations[index]?.conversationId;
          const currentIndex = next.findIndex((conversation) => conversation.conversationId === conversationId);
          if (currentIndex === -1) return;
          if (conversationId && polled.detail) {
            setCatchupDetailsByConversationId((prevDetails) => ({
              ...prevDetails,
              [conversationId]: polled.detail!,
            }));
          }

          const current = next[currentIndex];
          if (!current) return;
          const updated = {
            ...current,
            aiStatus: polled.item.status,
            aiItemId: polled.item._id,
            aiTitle: polled.item.title ?? current.aiTitle,
            aiSummarySnippet: polled.item.summarySnippet ?? current.aiSummarySnippet,
            aiMetadata: polled.item.metadata ?? current.aiMetadata,
          };
          const metadataChanged = JSON.stringify(current.aiMetadata ?? null) !== JSON.stringify(updated.aiMetadata ?? null);
          const changedForConversation =
            current.aiStatus !== updated.aiStatus
            || current.aiItemId !== updated.aiItemId
            || current.aiTitle !== updated.aiTitle
            || current.aiSummarySnippet !== updated.aiSummarySnippet
            || metadataChanged;

          if (changedForConversation) {
            next[currentIndex] = updated;
            changed = true;
          }

          if (polled.item.status === 'ready' || polled.item.status === 'failed') {
            setLoadingItems((prevLoading) => {
              const loading = new Set(prevLoading);
              loading.delete(conversationId ?? '');
              loading.delete(polled.item._id);
              return loading;
            });
          }
        });

        return changed ? next : prev;
      });
    };

    void pollProcessing();
    const timer = window.setInterval(() => {
      void pollProcessing();
    }, PROCESSING_POLL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [isOpen, conversations]);

  useEffect(() => {
    if (!isOpen || activeTab !== 'search') return;

    const timer = window.setTimeout(() => {
      void loadSearchResults(searchQuery);
    }, searchQuery.trim() ? SEARCH_DEBOUNCE_MS : 0);

    return () => window.clearTimeout(timer);
  }, [activeTab, isOpen, loadSearchResults, searchQuery]);

  useEffect(() => {
    if (!isOpen || activeTab !== 'notes') return;
    void loadNotes();
  }, [activeTab, isOpen, loadNotes]);

  // ── Badge count ───────────────────────────────────────────────────────────────

  const unreadDigestCount = conversations.filter((c) => c.unreadCount > 0).length;

  return {
    isOpen,
    activeTab,
    setActiveTab,
    conversations,
    catchupDetailsByConversationId,
    tasks,
    taskTotal,
    notes,
    noteTotal,
    searchQuery,
    searchMode,
    searchAnswer,
    searchPeople,
    setSearchQuery,
    searchResults,
    searchTotal,
    items,
    total,
    loadingList,
    loadingTasks,
    loadingNotes,
    loadingSearch,
    loadingItems,
    error,
    unreadDigestCount,
    pendingTaskCount: taskTotal,
    openBox,
    closeBox,
    loadConversations,
    loadTasks,
    loadNotes,
    createNote,
    toggleNotePin,
    removeNote,
    regenerateNote,
    loadSearchResults,
    loadItems,
    createDigest,
    regenerate: doRegenerate,
    createTaskFromActionItem,
    acceptTask,
    completeTask,
    dismissTask,
  };
}
