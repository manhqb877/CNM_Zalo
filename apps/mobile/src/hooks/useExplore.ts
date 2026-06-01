import { useState, useCallback } from 'react';
import {
  fetchExploreChannels,
  fetchPublicChannels,
  fetchDiscoverUsers,
  joinPublicChannel,
  type GroupConversation,
  type DiscoverUser,
} from '../services/explore';

export function useExplore() {
  const [channels, setChannels] = useState<GroupConversation[]>([]);
  const [users, setUsers] = useState<DiscoverUser[]>([]);
  const [isLoadingChannels, setIsLoadingChannels] = useState(false);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isJoining, setIsJoining] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadChannels = useCallback(async () => {
    try {
      setIsLoadingChannels(true);
      setError(null);
      const [explore, trending] = await Promise.all([
        fetchExploreChannels(),
        fetchPublicChannels(),
      ]);
      const combined = [...explore];
      for (const ch of trending) {
        if (!combined.some((c) => c._id === ch._id)) {
          combined.push(ch);
        }
      }
      setChannels(combined);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Không thể tải danh sách kênh'
      );
    } finally {
      setIsLoadingChannels(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      setIsLoadingUsers(true);
      setError(null);
      const data = await fetchDiscoverUsers();
      setUsers(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Không thể tải danh sách người dùng'
      );
    } finally {
      setIsLoadingUsers(false);
    }
  }, []);

  const handleJoinChannel = useCallback(
    async (channelId: string) => {
      setIsJoining(channelId);
      try {
        await joinPublicChannel(channelId);
        setChannels((prev) =>
          prev.map((ch) =>
            ch._id === channelId
              ? { ...ch, memberCount: ch.memberCount + 1 }
              : ch
          )
        );
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Không thể tham gia kênh'
        );
      } finally {
        setIsJoining(null);
      }
    },
    []
  );

  return {
    channels,
    users,
    isLoadingChannels,
    isLoadingUsers,
    isJoining,
    error,
    loadChannels,
    loadUsers,
    handleJoinChannel,
  };
}
