import { useEffect, useCallback, useRef, useState } from 'react';
import { socketService } from '../services/socket';
import api from '../services/api';

const HEARTBEAT_INTERVAL_MS = 30000;

export interface PresenceInfo {
  online: boolean;
  lastSeen: string | null;
  lastSeenFormatted?: string;
}

export function usePresence(userIds: string[]) {
  const [presenceMap, setPresenceMap] = useState<Map<string, PresenceInfo>>(new Map());
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch initial presence from API
  const fetchPresence = useCallback(async () => {
    if (userIds.length === 0) return;
    try {
      const { data } = await api.get<{
        success: boolean;
        presence: Record<string, { online: boolean; lastSeen: string | null; lastSeenFormatted: string }>;
      }>('/users/presence/bulk');
      const map = new Map<string, PresenceInfo>();
      for (const [uid, info] of Object.entries(data.presence)) {
        map.set(uid, {
          online: info.online,
          lastSeen: info.lastSeen,
          lastSeenFormatted: info.lastSeenFormatted,
        });
      }
      setPresenceMap(map);
    } catch {
      // ignore fetch errors silently
    }
  }, [userIds.join(',')]);

  useEffect(() => {
    void fetchPresence();
  }, [fetchPresence]);

  // Socket listener for real-time presence changes
  useEffect(() => {
    const socket = socketService.getSocket();
    if (!socket) return;

    const handlePresenceChanged = (payload: {
      userId: string;
      status: string;
      lastSeen: string | null;
    }) => {
      if (userIds.includes(payload.userId)) {
        setPresenceMap((prev) => {
          const next = new Map(prev);
          next.set(payload.userId, {
            online: payload.status === 'online',
            lastSeen: payload.lastSeen,
            lastSeenFormatted: formatLastSeen(payload.lastSeen),
          });
          return next;
        });
      }
    };

    socket.on('presence_changed', handlePresenceChanged);
    return () => {
      socket.off('presence_changed', handlePresenceChanged);
    };
  }, [userIds.join(',')]);

  // Heartbeat every 30 seconds
  useEffect(() => {
    heartbeatRef.current = setInterval(() => {
      socketService.emitHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
      }
    };
  }, []);

  const getPresence = useCallback(
    (userId: string): PresenceInfo | undefined => {
      return presenceMap.get(userId);
    },
    [presenceMap]
  );

  return { presenceMap, getPresence, refetch: fetchPresence };
}

function formatLastSeen(lastSeen: string | null): string {
  if (!lastSeen) return 'Chua tung hoat dong';
  const diff = Date.now() - new Date(lastSeen).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return 'Vua xong';
  if (minutes < 60) return `Hoat dong ${minutes} phut truoc`;
  if (hours < 24) return `Hoat dong ${hours} gio truoc`;
  if (days < 7) return `Hoat dong ${days} ngay truoc`;
  return 'Chua tung hoat dong gan day';
}
