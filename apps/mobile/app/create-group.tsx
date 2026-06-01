import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { lightTheme } from '../src/theme/colors';
import api from '../src/services/api';
import { useAuthStore } from '../src/store/useAuthStore';
import { SkeletonCardPreset } from '../src/ui/ZyncSkeleton';

interface Friend {
  _id: string;
  displayName: string;
  avatarUrl?: string;
  username?: string;
}

export default function CreateGroupScreen() {
  const router = useRouter();
  const userInfo = useAuthStore((s) => s.userInfo);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    void loadFriends();
  }, []);

  const loadFriends = async () => {
    try {
      setIsLoading(true);
      const res = await api.get('/friends');
      const friendsList = (res.data?.data || res.data?.friends || []).map((f: any) => ({
        _id: f._id || f.userId || f.id,
        displayName: f.displayName || f.username || 'Người dùng',
        avatarUrl: f.avatarUrl,
        username: f.username,
      }));
      setFriends(friendsList);
    } catch (err) {
      console.error('Load friends failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  const handleCreate = useCallback(async () => {
    if (selectedIds.length < 2) {
      Alert.alert('Thông báo', 'Cần ít nhất 2 thành viên để tạo nhóm');
      return;
    }

    const name = groupName.trim() || `Nhóm của ${userInfo?.displayName || 'bạn'}`;

    try {
      setIsCreating(true);
      const res = await api.post('/groups', {
        name,
        memberIds: selectedIds,
      });

      const groupId = res.data?.data?._id || res.data?._id;
      if (groupId) {
        router.replace({
          pathname: '/chat-room',
          params: {
            conversationId: groupId,
            name,
            isGroup: 'true',
          },
        });
      } else {
        router.back();
      }
    } catch (err: any) {
      const message = err?.response?.data?.message;
      Alert.alert('Lỗi', typeof message === 'string' ? message : 'Không thể tạo nhóm');
    } finally {
      setIsCreating(false);
    }
  }, [groupName, router, selectedIds, userInfo?.displayName]);

  // Lọc danh sách bạn bè theo từ khóa
  const filtered = search.trim()
    ? friends.filter(
        (f) =>
          f.displayName.toLowerCase().includes(search.toLowerCase()) ||
          (f.username && f.username.toLowerCase().includes(search.toLowerCase())),
      )
    : friends;

  const renderFriend = useCallback(
    ({ item }: { item: Friend }) => {
      const isSelected = selectedIds.includes(item._id);
      const initial = (item.displayName || '?').charAt(0).toUpperCase();
      return (
        <TouchableOpacity
          style={[styles.friendRow, isSelected && styles.friendRowSelected]}
          activeOpacity={0.7}
          onPress={() => toggleSelect(item._id)}
        >
          {item.avatarUrl ? (
            <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarLetter}>{initial}</Text>
            </View>
          )}
          <View style={styles.friendInfo}>
            <Text style={styles.friendName}>{item.displayName}</Text>
            {item.username && (
              <Text style={styles.friendUsername}>@{item.username}</Text>
            )}
          </View>
          <View style={[styles.checkbox, isSelected && styles.checkboxActive]}>
            {isSelected && <Ionicons name="checkmark" size={16} color="#fff" />}
          </View>
        </TouchableOpacity>
      );
    },
    [selectedIds, toggleSelect],
  );

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={lightTheme.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Tạo nhóm</Text>
        <TouchableOpacity
          style={[styles.createBtn, (selectedIds.length < 2 || isCreating) && styles.createBtnDisabled]}
          onPress={handleCreate}
          disabled={selectedIds.length < 2 || isCreating}
        >
          {isCreating ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.createBtnText}>Tạo ({selectedIds.length})</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Ten nhom */}
      <View style={styles.nameRow}>
        <Ionicons name="people-circle-outline" size={22} color={lightTheme.accent} />
        <TextInput
          style={styles.nameInput}
          placeholder="Tên nhóm (không bắt buộc)"
          placeholderTextColor={lightTheme.textTertiary}
          value={groupName}
          onChangeText={setGroupName}
          maxLength={50}
        />
      </View>

      {/* Tim kiem */}
      <View style={styles.searchBox}>
        <Ionicons name="search-outline" size={18} color={lightTheme.textTertiary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Tìm bạn bè..."
          placeholderTextColor={lightTheme.textTertiary}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
      </View>

      {/* Selected chips */}
      {selectedIds.length > 0 && (
        <View style={styles.chipRow}>
          {selectedIds.map((id) => {
            const friend = friends.find((f) => f._id === id);
            if (!friend) return null;
            return (
              <TouchableOpacity
                key={id}
                style={styles.chip}
                onPress={() => toggleSelect(id)}
              >
                <Text style={styles.chipText} numberOfLines={1}>
                  {friend.displayName}
                </Text>
                <Ionicons name="close-circle" size={16} color={lightTheme.textTertiary} />
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Danh sach ban be */}
      {isLoading ? (
        <View style={{ padding: 16, gap: 12 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCardPreset key={i} lines={2} showAvatar />
          ))}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item, index) => item._id?.toString() || index.toString()}
          renderItem={renderFriend}
          ListEmptyComponent={
            <Text style={styles.emptyText}>Không tìm thấy bạn bè</Text>
          }
          contentContainerStyle={{ paddingBottom: 30 }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: lightTheme.bgPrimary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: lightTheme.borderLight,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: lightTheme.textPrimary,
    fontFamily: 'BeVietnamPro_600SemiBold',
  },
  createBtn: {
    backgroundColor: lightTheme.accent,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  createBtnDisabled: {
    opacity: 0.5,
  },
  createBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'BeVietnamPro_600SemiBold',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: lightTheme.borderLight,
    gap: 10,
  },
  nameInput: {
    flex: 1,
    fontSize: 15,
    color: lightTheme.textPrimary,
    fontFamily: 'BeVietnamPro_400Regular',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: lightTheme.bgHover,
    borderRadius: 10,
    margin: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: lightTheme.textPrimary,
    fontFamily: 'BeVietnamPro_400Regular',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 6,
    marginBottom: 12,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: lightTheme.accentLight,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipText: {
    fontSize: 12,
    color: lightTheme.accent,
    fontFamily: 'BeVietnamPro_500Medium',
    maxWidth: 80,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: lightTheme.borderLight,
  },
  friendRowSelected: {
    backgroundColor: lightTheme.bgActive,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
  },
  avatarFallback: {
    backgroundColor: lightTheme.accentLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarLetter: {
    fontSize: 16,
    fontWeight: '600',
    color: lightTheme.accent,
  },
  friendInfo: {
    flex: 1,
  },
  friendName: {
    fontSize: 15,
    fontWeight: '500',
    color: lightTheme.textPrimary,
    fontFamily: 'BeVietnamPro_500Medium',
  },
  friendUsername: {
    fontSize: 12,
    color: lightTheme.textTertiary,
    fontFamily: 'BeVietnamPro_400Regular',
    marginTop: 2,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: lightTheme.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxActive: {
    backgroundColor: lightTheme.accent,
    borderColor: lightTheme.accent,
  },
  emptyText: {
    textAlign: 'center',
    color: lightTheme.textTertiary,
    marginTop: 40,
    fontSize: 14,
    fontFamily: 'BeVietnamPro_400Regular',
  },
});
