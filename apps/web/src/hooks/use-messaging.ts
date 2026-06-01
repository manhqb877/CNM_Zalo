"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { v4 as uuidv4 } from "uuid";
import type { CallHistory, Message, MessageStatus, SenderInMessage } from "@zync/shared-types";
import {
  getSocket,
  isConnected,
  joinConversation,
  leaveConversation,
  listenToMessages,
  listenToStatusUpdates,
  listenToTypingIndicators,
  markAsDelivered,
  markAsRead,
  sendMessage as emitSendMessage,
  startTyping as emitStartTyping,
  stopTyping as emitStopTyping,
  clearPendingTyping as emitClearPendingTyping,
  unlistenToMessages,
  unlistenToStatusUpdates,
  unlistenToTypingIndicators,
  deleteMessageForMe,
  recallMessage,
  listenToMessageDeletion,
  unlistenToMessageDeletion,
  listenToMessageRecall,
  unlistenToMessageRecall,
  listenToMessageForwarded,
  unlistenToMessageForwarded,
  listenToMessageReacted,
  unlistenToMessageReacted,
} from "@/services/socket";
import { getMessages } from "@/services/chat";
import { MessageType } from "@zync/shared-types";

// ─── useChat Hook ───

interface MessageStatusMap {
  [messageId: string]: MessageStatus;
}

export interface TypingUser {
  userId: string;
  displayName: string;
}

interface UseChatOptions {
  conversationId: string;
  userId: string;
  token: string;
  displayName: string;
}

export interface SendMessageOptions {
  idempotencyKey?: string;
  deferEmit?: boolean;
  replyTo?: Message["replyTo"];
}

interface UseChatReturn {
  messages: Message[];
  unsetMessages_Status: () => void
  typingUsers: TypingUser[];
  messageStatus: MessageStatusMap;
  sendMessage: (
    content: string,
    type: MessageType,
    displayName: string,
    avatarUrl?: string,
    mediaUrl?: string,
    options?: SendMessageOptions,
  ) => Promise<string | null>;
  cancelPendingMessage: (idempotencyKey: string) => void;
  markAsRead: (messageIds: string[]) => void;
  startTyping: () => void;
  stopTyping: () => void;
  deleteMessageForMe: (
    messageId: string,
    idempotencyKey: string,
  ) => Promise<void>;
  recallMessage: (messageId: string, idempotencyKey: string) => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

export function useChat({
  conversationId,
  userId,
  token,
  displayName,
}: UseChatOptions): UseChatReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [messageStatus, setMessageStatus] = useState<MessageStatusMap>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track typing users with TTL (auto-remove after 4s)
  const typingTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const previousConversationId = useRef<string>("");
  // Luu callback theo event de co the cleanup dung callback thay vi xoa tat ca.
  const socketCallbackRefs = useRef<Record<string, (...args: unknown[]) => void>>({});

  // Initialize socket on mount or when token changes
  useEffect(() => {
    // Only initialize socket if token is available
    if (!token) {
      setError("No authentication token available");
      return;
    }

    try {
      getSocket(token);
    } catch (err) {
      console.error("Failed to initialize socket:", err);
      setError("Failed to connect to messaging service");
    }
  }, [token]);

  // Join conversation when it changes – also handles reconnect
  useEffect(() => {
    if (!conversationId || !token) return;

    const sock = getSocket(token);

    const doJoin = () => {
      // Leave previous conversation if it exists and is different
      if (
        previousConversationId.current &&
        previousConversationId.current !== conversationId
      ) {
        leaveConversation(previousConversationId.current);
      }
      joinConversation(conversationId);
      previousConversationId.current = conversationId;
    };

    if (sock.connected) {
      doJoin();
    }

    // Re-join on (re)connect so room membership survives reconnects
    sock.on("connect", doJoin);

    return () => {
      sock.off("connect", doJoin);
    };
  }, [conversationId, token]);

  // Setup message listener
  useEffect(() => {
    const handleReceiveMessage = (data: {
      messageId: string;
      conversationId?: string;
      senderId: string;
      sender: SenderInMessage;
      content: string;
      type: string;
      mediaUrl?: string;
      callHistory?: CallHistory;
      replyTo?: Message["replyTo"];
      idempotencyKey: string;
      createdAt: string;
    }) => {
      if (!data.conversationId || data.conversationId !== conversationId) {
        return;
      }

      const newMessage: Message = {
        _id: data.messageId,
        conversationId: data.conversationId,
        senderId: data.senderId,
      sender: data.sender,
      content: data.content,
      type: data.type as Message["type"],
      mediaUrl: data.mediaUrl,
      callHistory: data.callHistory,
      replyTo: data.replyTo,
        idempotencyKey: data.idempotencyKey, // Will be set on send
        status: "delivered",
        createdAt: data.createdAt,
      };

      setMessages((prev) => {
        const index = prev.findIndex(
          (msg) =>
            msg._id === data.messageId ||
            msg.idempotencyKey === data.idempotencyKey,
        );

        if (index === -1) {
          return [...prev, newMessage];
        }

        const next = [...prev];
        next[index] = {
          ...next[index],
          ...newMessage,
          _id: data.messageId,
          createdAt: data.createdAt || next[index].createdAt,
        };
        return next;
      });

      setMessageStatus((prev) => ({
        ...prev,
        [data.idempotencyKey]: "delivered",
        [data.messageId]: "delivered",
      }));

      if (data.senderId !== userId) {
        // Notify backend that message was delivered only for messages from other users.
        markAsDelivered(data.conversationId, [data.messageId]);

        // Auto-mark as read after 500ms
        setTimeout(() => {
          markAsRead(data.conversationId as string, [data.messageId]);
        }, 500);
      }
    };

    const handleMessageSent = (data: {
      messageId: string;
      idempotencyKey: string;
      createdAt: string;
    }) => {
      // Replace optimistic message (idempotency key) with real server message id.
      setMessages((prev) =>
        prev.map((msg) =>
          msg._id === data.idempotencyKey ||
          msg.idempotencyKey === data.idempotencyKey
            ? {
                ...msg,
                _id: data.messageId,
                createdAt: data.createdAt || msg.createdAt,
              }
            : msg,
        ),
      );

      setMessageStatus((prev) => {
        const next = { ...prev };
        const previousStatus = next[data.idempotencyKey] ?? "sent";
        
        const currentStatus = next[data.messageId];
        if (currentStatus !== "delivered" && currentStatus !== "read") {
          next[data.messageId] = previousStatus;
        }
        
        delete next[data.idempotencyKey];
        return next;
      });
    };

    const handleMessageReacted = (data: any) => {
      if (data.conversationId !== conversationId) return;
      setMessages((prev) =>
        prev.map((msg) =>
          msg._id === data.messageId
            ? { ...msg, reactions: data.reactions }
            : msg,
        ),
      );
    };

    try {
      listenToMessages(handleReceiveMessage);
      listenToMessageReacted(handleMessageReacted);
      const socket = getSocket(token);
      socket.on("message_sent", handleMessageSent);
    } catch (err) {
      console.error("Failed to setup message listener:", err);
    }

    return () => {
      try {
        unlistenToMessages();
        unlistenToMessageReacted();
        const socket = getSocket(token);
        socket.off("message_sent", handleMessageSent);
      } catch (err) {
        console.error("Failed to cleanup message listener:", err);
      }
    };
  }, [conversationId, token, userId]);

  // Setup status update listener
  useEffect(() => {
    const handleStatusUpdate = (data: {
      messageId?: string;
      messageIds?: string[];
      idempotencyKeys?: string[];
      conversationId?: string;
      status: MessageStatus;
      userId: string;
      updatedAt: string;
      reader?: {
        userId: string;
        displayName: string;
        avatarUrl?: string;
        readAt: string;
      };
    }) => {
      if (data.conversationId && data.conversationId !== conversationId) {
        return;
      }

      const ids = data.messageIds || [];
      const idems = data.idempotencyKeys || [];

      // Single message status update (sent event)
      if (ids.length === 0 && data.messageId) {
        const messageId = data.messageId;
        setMessageStatus((prev) => ({
          ...prev,
          [messageId]: data.status,
        }));
        return;
      }

      // Batch status update (auto-mark from getMessageHistory)
      // Backend sends idempotencyKeys = frontend mockIds (now guaranteed to match)
      setMessageStatus((prev) => {
        const updated = { ...prev };
        ids.forEach((id, i) => {
          if (updated[idems[i]]) {
            updated[idems[i]] = data.status;
          } else {
            updated[id] = data.status;
          }
        });
        // [...idems, ...ids].forEach((key) => {
        //   if (key) updated[key] = data.status;
        // });
        return updated;
      });

      if (data.status === "read" && data.reader) {
        const targetRefs = new Set<string>([
          ...ids.map(String),
          ...idems.map(String),
          ...(data.messageId ? [String(data.messageId)] : []),
        ]);

        if (targetRefs.size === 0) {
          return;
        }

        setMessages((prev) =>
          prev.map((msg) => {
            const messageRefs = [
              String(msg._id),
              String(msg.idempotencyKey || ""),
            ].filter(Boolean);
            const isTarget = messageRefs.some((ref) => targetRefs.has(ref));

            if (!isTarget) {
              return msg;
            }

            const existingReadBy = Array.isArray(msg.readBy) ? msg.readBy : [];
            const mergedReadBy = [
              data.reader!,
              ...existingReadBy.filter(
                (item) => item.userId !== data.reader!.userId,
              ),
            ].sort(
              (a, b) =>
                new Date(b.readAt).getTime() - new Date(a.readAt).getTime(),
            );

            const sentTo = Array.isArray(msg.sentTo)
              ? msg.sentTo.filter((item) => item.userId !== data.reader!.userId)
              : msg.sentTo;

            return {
              ...msg,
              status: "read" as MessageStatus,
              readBy: mergedReadBy,
              readByPreview: mergedReadBy.slice(0, 3),
              sentTo,
            };
          }),
        );
      }
    };

    try {
      listenToStatusUpdates(handleStatusUpdate);
    } catch (err) {
      console.error("Failed to setup status listener:", err);
    }

    return () => {
      try {
        unlistenToStatusUpdates();
      } catch (err) {
        console.error("Failed to cleanup status listener:", err);
      }
    };
  }, [conversationId, token]);

  // Setup typing indicator listener
  useEffect(() => {
    const handleTypingIndicator = (data: {
      userId: string;
      conversationId: string;
      isTyping: boolean;
    }) => {
      if (data.conversationId === conversationId && data.userId !== userId) {
        if (data.isTyping) {
          // Clear existing timeout for this user
          const existingTimeout = typingTimeouts.current.get(data.userId);
          if (existingTimeout) clearTimeout(existingTimeout);

          // Add user to typing list
          setTypingUsers((prev) => {
            const exists = prev.find((u) => u.userId === data.userId);
            if (exists) return prev;
            return [...prev, { userId: data.userId, displayName: data.userId }]; // Note: displayName will be set elsewhere
          });

          // Set auto-remove after 4s
          const timeout = setTimeout(() => {
            setTypingUsers((prev) =>
              prev.filter((u) => u.userId !== data.userId),
            );
            typingTimeouts.current.delete(data.userId);
          }, 4000);

          typingTimeouts.current.set(data.userId, timeout);
        } else {
          // Remove user immediately
          const existingTimeout = typingTimeouts.current.get(data.userId);
          if (existingTimeout) clearTimeout(existingTimeout);
          setTypingUsers((prev) =>
            prev.filter((u) => u.userId !== data.userId),
          );
          typingTimeouts.current.delete(data.userId);
        }
      }
    };

    try {
      listenToTypingIndicators(handleTypingIndicator);
    } catch (err) {
      console.error("Failed to setup typing listener:", err);
    }

    return () => {
      // Cleanup all typing timeouts
      typingTimeouts.current.forEach((timeout) => clearTimeout(timeout));
      typingTimeouts.current.clear();

      try {
        unlistenToTypingIndicators();
      } catch (err) {
        console.error("Failed to cleanup typing listener:", err);
      }
    };
  }, [conversationId, userId]);

  // Send message
  const handleSendMessage = useCallback(
    async (
      content: string,
      type: MessageType,
      displayName: string,
      avatarUrl?: string,
      mediaUrl?: string,
      options?: SendMessageOptions,
    ) => {
      // Kiem tra ket noi SOCKET truoc khi thuc hien bat ky thu gi
      // Neu chua ket noi, hien thong bao loi va khong tao optimistic bubble
      if (!isConnected()) {
        setError("Mat ket noi voi may chu. Vui long doi ket noi...");
        console.warn("[useChat] Cannot send: socket not connected");
        return null;
      }

      const idempotencyKey = options?.idempotencyKey || uuidv4();
      const shouldEmitNow = !options?.deferEmit;
      const timestamp = new Date().toISOString();

      console.debug(`[useChat] handleSendMessage: content="${content.substring(0, 30)}...", type=${type}, shouldEmitNow=${shouldEmitNow}`);

      try {
        if (shouldEmitNow) {
          setIsLoading(true);
        }
        setError(null);

        // Chi tao optimistic message neu thuc su co the gui
        const optimisticMessage: Message = {
          _id: idempotencyKey,
          conversationId,
          senderId: userId,
          sender: {
            senderId: userId,
            displayName: displayName,
            avatarUrl: avatarUrl
          },
          content,
          type,
          mediaUrl,
          replyTo: options?.replyTo,
          idempotencyKey,
          status: "sent",
          createdAt: timestamp,
        };

        setMessages((prev) => {
          const index = prev.findIndex(
            (msg) =>
              msg.idempotencyKey === idempotencyKey ||
              msg._id === idempotencyKey,
          );

          if (index === -1) {
            return [...prev, optimisticMessage];
          }

          const next = [...prev];
          next[index] = {
            ...next[index],
            ...optimisticMessage,
            _id: next[index]._id,
            createdAt: next[index].createdAt || optimisticMessage.createdAt,
          };
          return next;
        });

        setMessageStatus((prev) => ({
          ...prev,
          [idempotencyKey]: "sent",
        }));

        if (shouldEmitNow) {
          emitSendMessage(
            conversationId,
            content,
            type,
            idempotencyKey,
            mediaUrl,
            options?.replyTo,
          );

          emitClearPendingTyping(conversationId);
        }

        return idempotencyKey;
      } catch (err) {
        // Rollback optimistic message khi co loi
        setMessages((prev) =>
          prev.filter(
            (msg) =>
              msg.idempotencyKey !== idempotencyKey &&
              msg._id !== idempotencyKey,
          ),
        );
        setMessageStatus((prev) => {
          const next = { ...prev };
          delete next[idempotencyKey];
          return next;
        });

        const errorMsg =
          err instanceof Error ? err.message : "Khong the gui tin nhan";
        setError(errorMsg);
        console.error("Send message error:", err);
        return null;
      } finally {
        if (shouldEmitNow) {
          setIsLoading(false);
        }
      }
    },
    [conversationId, userId],
  );

  const handleCancelPendingMessage = useCallback((idempotencyKey: string) => {
    setMessages((prev) =>
      prev.filter(
        (msg) =>
          msg.idempotencyKey !== idempotencyKey && msg._id !== idempotencyKey,
      ),
    );

    setMessageStatus((prev) => {
      if (!prev[idempotencyKey]) {
        return prev;
      }

      const next = { ...prev };
      delete next[idempotencyKey];
      return next;
    });
  }, []);

  // Mark as read
  const handleMarkAsRead = useCallback(
    (messageIds: string[]) => {
      try {
        markAsRead(conversationId, messageIds);
        messageIds.forEach((id) => {
          setMessageStatus((prev) => ({
            ...prev,
            [id]: "read",
          }));
        });
      } catch (err) {
        console.error("Mark as read error:", err);
      }
    },
    [conversationId],
  );

  // Start typing
  const handleStartTyping = useCallback(() => {
    try {
      emitStartTyping(conversationId);
    } catch (err) {
      console.error("Start typing error:", err);
    }
  }, [conversationId]);

  // Stop typing
  const handleStopTyping = useCallback(() => {
    try {
      emitStopTyping(conversationId);
    } catch (err) {
      console.error("Stop typing error:", err);
    }
  }, [conversationId]);

  // ─── Delete Message Listeners Setup (Status Update Only) ───
  useEffect(() => {
    if (!token) return;

    const handleMessageDeletedForMe = (data: {
      messageId: string;
      conversationId: string;
      deletedAt: string;
      idempotencyKey?: string;
    }) => {
      // Only process if this is the right conversation
      if (data.conversationId !== conversationId) return;

      // Remove from realtime message state so merge layer cannot resurrect it.
      setMessages((prev) =>
        prev.filter((msg) => {
          const matchesById =
            msg._id === data.messageId || msg.idempotencyKey === data.messageId;
          const matchesByKey =
            Boolean(data.idempotencyKey) &&
            (msg._id === data.idempotencyKey ||
              msg.idempotencyKey === data.idempotencyKey);

          return !(matchesById || matchesByKey);
        }),
      );

      // Remove from status map
      setMessageStatus((prev) => {
        const newStatus = { ...prev };
        delete newStatus[data.messageId];
        if (data.idempotencyKey) {
          delete newStatus[data.idempotencyKey];
        }
        return newStatus;
      });
    };

    const handleMessageRecalled = (data: {
      messageId: string;
      idempotencyKey: string;
      conversationId: string;
      recalledBy: string;
      recalledAt: string;
    }) => {
      // Only process if this is the right conversation
      if (data.conversationId !== conversationId) return;

      // Keep message body in recalled state so later realtime merges cannot resurrect content.
      setMessages((prev) =>
        prev.map((msg) => {
          const matches =
            msg._id === data.messageId ||
            msg.idempotencyKey === data.idempotencyKey ||
            msg._id === data.idempotencyKey ||
            msg.idempotencyKey === data.messageId;

          if (!matches) {
            return msg;
          }

          return {
            ...msg,
            content:
              data.recalledBy === "system"
                ? "[Bị chặn bởi AI Moderator]"
                : "[Tin nhắn đã được thu hồi]",
            mediaUrl: undefined,
            type: "system-recall" as Message["type"],
          };
        }),
      );

      // Update status
      setMessageStatus((prev) => ({
        ...prev,
        [data.messageId]: "read",
      }));
    };

    // Luu vao refs de cleanup dung callback thay vi xoa tat ca.
    socketCallbackRefs.current['message_deleted_for_me'] = handleMessageDeletedForMe as (...args: unknown[]) => void;
    socketCallbackRefs.current['message_recalled'] = handleMessageRecalled as (...args: unknown[]) => void;

    try {
      // Use listener functions instead of direct socket.on
      listenToMessageDeletion(handleMessageDeletedForMe);
      listenToMessageRecall(handleMessageRecalled);
    } catch (err) {
      console.error("Failed to setup deletion listeners:", err);
    }

    return () => {
      try {
        unlistenToMessageDeletion(handleMessageDeletedForMe);
        unlistenToMessageRecall(handleMessageRecalled);
      } catch (err) {
        console.error("Failed to cleanup deletion listeners:", err);
      }
      delete socketCallbackRefs.current['message_deleted_for_me'];
      delete socketCallbackRefs.current['message_recalled'];
    };
  }, [conversationId, token]);

  // Delete for me
  const handleDeleteForMe = useCallback(
    async (messageId: string, idempotencyKey: string) => {
      if (!isConnected()) {
        setError("Not connected to messaging service");
        return;
      }

      try {
        // Optimistic remove to avoid temporary resurrection while waiting server ack.
        setMessages((prev) =>
          prev.filter(
            (msg) =>
              msg._id !== messageId &&
              msg.idempotencyKey !== messageId &&
              msg._id !== idempotencyKey &&
              msg.idempotencyKey !== idempotencyKey,
          ),
        );

        setMessageStatus((prev) => {
          const next = { ...prev };
          delete next[messageId];
          delete next[idempotencyKey];
          return next;
        });

        deleteMessageForMe(conversationId, messageId, idempotencyKey);
      } catch (err) {
        console.error("Failed to delete message:", err);
        setError("Failed to delete message");
      }
    },
    [conversationId],
  );

  // Recall message
  const handleRecall = useCallback(
    async (messageId: string, idempotencyKey: string) => {
      if (!isConnected()) {
        setError("Not connected to messaging service");
        return;
      }

      try {
        recallMessage(conversationId, messageId, idempotencyKey);
      } catch (err) {
        console.error("Failed to recall message:", err);
        setError("Failed to recall message");
      }
    },
    [conversationId],
  );

  const unsetMessages_Status = useCallback(
    () => {
      setMessages([])
      setMessageStatus({})
    },
    []
  )

  return {
    messages,
    typingUsers,
    messageStatus,
    sendMessage: handleSendMessage,
    cancelPendingMessage: handleCancelPendingMessage,
    markAsRead: handleMarkAsRead,
    startTyping: handleStartTyping,
    stopTyping: handleStopTyping,
    deleteMessageForMe: handleDeleteForMe,
    recallMessage: handleRecall,
    unsetMessages_Status,
    isLoading,
    error,
  };
}

// ─── useMessageHistory Hook ───

interface UseMessageHistoryOptions {
  conversationId: string;
}

interface UseMessageHistoryReturn {
  messages: Message[];
  cursor: string | undefined;
  hasMore: boolean;
  loading: boolean;
  error: string | null;
  fetchMessages: () => Promise<void>;
  loadMore: () => Promise<void>;
  setMessages: Dispatch<SetStateAction<Message[]>>;
}

export function useMessageHistory({
  conversationId,
}: UseMessageHistoryOptions): UseMessageHistoryReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [checkChange, setCheckChange] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMessages = useCallback(
    async (overrideCursor?: string) => {
      if (!conversationId || loading) return;

      const currentCursor = overrideCursor ?? cursor;
      if (currentCursor && !hasMore) return;

      try {
        setLoading(true);
        setError(null);

        const response = await getMessages(conversationId, currentCursor, 20);
        const { messages, nextCursor } = response;

        if (messages && Array.isArray(messages)) {
          const reversedMessages = messages.reverse();
          setMessages((prev) => {
            if (currentCursor) {
              return [...reversedMessages, ...prev];
            }
            // Merge with any real-time messages already present in prev
            const merged = new Map<string, Message>();
            reversedMessages.forEach((msg) => {
              const key = String(msg.idempotencyKey || msg._id);
              merged.set(key, msg);
            });
            prev.forEach((msg) => {
              const key = String(msg.idempotencyKey || msg._id);
              if (!merged.has(key)) {
                merged.set(key, msg);
              }
            });
            return Array.from(merged.values()).sort(
              (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
            );
          });
          setCursor(nextCursor);
          setHasMore(Boolean(nextCursor));
        } else {
          setMessages([]);
          setCursor(undefined);
          setHasMore(false);
        }
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : "Failed to fetch messages";
        setError(errorMsg);
        console.error("Fetch messages error:", err);
      } finally {
        setLoading(false);
      }
    },
    [conversationId, cursor, hasMore, loading],
  );

  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      setCursor(undefined);
      setHasMore(true);
      setError(null);
      return;
    }

    setMessages([]);
    setCursor(undefined);
    setHasMore(true);
    setError(null);
    setCheckChange((prev) => !prev);
  }, [conversationId]);

  // Auto-fetch initial messages when conversationId changes
  useEffect(() => {
    if (conversationId && !loading) {
      fetchMessages("");
    }
  }, [checkChange]);

  // Load more (fetch with current cursor)
  const loadMore = useCallback(async () => {
    if (!hasMore || loading) {
      return;
    }
    await fetchMessages();
  }, [fetchMessages, hasMore, loading]);

  // ─── Handle Message Deletion & Recall ───
  useEffect(() => {
    const handleMessageDeletedForMe = (data: {
      messageId: string;
      conversationId: string;
      deletedAt: string;
      idempotencyKey?: string;
    }) => {
      // Only process if this is the right conversation
      if (data.conversationId !== conversationId) return;

      // Remove from messages state
      setMessages((prev) =>
        prev.filter((msg) => {
          const matchesById =
            msg._id === data.messageId || msg.idempotencyKey === data.messageId;
          const matchesByKey =
            Boolean(data.idempotencyKey) &&
            (msg._id === data.idempotencyKey ||
              msg.idempotencyKey === data.idempotencyKey);

          return !(matchesById || matchesByKey);
        }),
      );
    };

    const handleMessageRecalled = (data: {
      messageId: string;
      idempotencyKey: string;
      conversationId: string;
      recalledBy: string;
      recalledAt: string;
    }) => {
      // Only process if this is the right conversation
      if (data.conversationId !== conversationId) return;

      // Update message to placeholder
      setMessages((prev) =>
        prev.map((msg) =>
          msg.idempotencyKey === data.idempotencyKey ||
          msg._id === data.messageId ||
          msg._id === data.idempotencyKey ||
          msg.idempotencyKey === data.messageId
            ? {
                ...msg,
                content:
                  data.recalledBy === "system"
                    ? "[Bị chặn bởi AI Moderator]"
                    : "[Tin nhắn đã được thu hồi]",
                mediaUrl: undefined,
                type: "system-recall" as Message["type"],
              }
            : msg,
        ),
      );
    };

    const handleMessageForwarded = (data: {
      messageId: string;
      idempotencyKey: string;
      toConversationId: string;
    }) => {
      // Just log forward confirmation - message appears in target conversation via receive_message
      console.debug(
        `Message forwarded: ${data.idempotencyKey} to ${data.toConversationId}`,
      );
    };

    try {
      listenToMessageDeletion(handleMessageDeletedForMe);
      listenToMessageRecall(handleMessageRecalled);
      listenToMessageForwarded(handleMessageForwarded);
    } catch (err) {
      console.error("Failed to setup deletion listeners:", err);
    }

    return () => {
      try {
        unlistenToMessageDeletion(handleMessageDeletedForMe);
        unlistenToMessageRecall(handleMessageRecalled);
        unlistenToMessageForwarded();
      } catch (err) {
        console.error("Failed to cleanup deletion listeners:", err);
      }
    };
  }, [conversationId]);

  return {
    messages,
    cursor,
    hasMore,
    loading,
    error,
    fetchMessages,
    loadMore,
    setMessages,
  };
}

// ─── useTypingIndicator Hook ───

interface UseTypingIndicatorOptions {
  conversationId: string;
}

interface UseTypingIndicatorReturn {
  typingUsers: TypingUser[];
  isAnyoneTyping: boolean;
}

export function useTypingIndicator({
  conversationId,
}: UseTypingIndicatorOptions): UseTypingIndicatorReturn {
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const typingTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());

  useEffect(() => {
    const handleTypingIndicator = (data: {
      userId: string;
      conversationId: string;
      isTyping: boolean;
    }) => {
      if (data.conversationId !== conversationId) return;

      if (data.isTyping) {
        // Clear existing timeout
        const existingTimeout = typingTimeouts.current.get(data.userId);
        if (existingTimeout) clearTimeout(existingTimeout);

        // Add user
        setTypingUsers((prev) => {
          const exists = prev.find((u) => u.userId === data.userId);
          return exists
            ? prev
            : [...prev, { userId: data.userId, displayName: data.userId }];
        });

        // Auto-remove after 4s
        const timeout = setTimeout(() => {
          setTypingUsers((prev) =>
            prev.filter((u) => u.userId !== data.userId),
          );
          typingTimeouts.current.delete(data.userId);
        }, 4000);

        typingTimeouts.current.set(data.userId, timeout);
      } else {
        // Remove user
        const existingTimeout = typingTimeouts.current.get(data.userId);
        if (existingTimeout) clearTimeout(existingTimeout);
        setTypingUsers((prev) => prev.filter((u) => u.userId !== data.userId));
        typingTimeouts.current.delete(data.userId);
      }
    };

    try {
      listenToTypingIndicators(handleTypingIndicator);
    } catch (err) {
      console.error("Failed to setup typing listener:", err);
    }

    return () => {
      typingTimeouts.current.forEach((timeout) => clearTimeout(timeout));
      typingTimeouts.current.clear();

      try {
        unlistenToTypingIndicators();
      } catch (err) {
        console.error("Failed to cleanup typing listener:", err);
      }
    };
  }, [conversationId]);

  return {
    typingUsers,
    isAnyoneTyping: typingUsers.length > 0,
  };
}
