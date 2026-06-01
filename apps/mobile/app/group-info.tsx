import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  Alert,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { lightTheme } from '../src/theme/colors';
import api from '../src/services/api';
import { useAuthStore } from '../src/store/useAuthStore';
import { SkeletonCardPreset } from '../src/ui/ZyncSkeleton';

interface Member {
  _id: string;
  displayName: string;
  avatarUrl?: string;
  username?: string;
}

export default function GroupInfoScreen() {
  const router = useRouter();
  const { conversationId, name, avatarUrl } = useLocalSearchParams<{
    conversationId: string;
    name?: string;
    avatarUrl?: string;
  }>();
  const userInfo = useAuthStore((s) => s.userInfo);
  const userId = String(userInfo?._id || userInfo?.id || '');

  const [groupName, setGroupName] = useState(name || 'Nhóm');
  const [groupAvatar, setGroupAvatar] = useState<string | undefined>(avatarUrl);
  const [members, setMembers] = useState<Member[]>([]);
  const [adminIds, setAdminIds] = useState<string[]>([]);
  const [creatorId, setCreatorId] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [nameEdit, setNameEdit] = useState('');

  const isAdmin = adminIds.includes(userId);

  useEffect(() => {
    void loadGroupInfo();
  }, [conversationId]);

  const loadGroupInfo = async () => {
    if (!conversationId) return;
    try {
      setIsLoading(true);
      const res = await api.get('/conversations');
      const conversations = res.data?.data || res.data?.conversations || [];
      const group = conversations.find((c: any) => c._id === conversationId);
      if (group) {
        setGroupName(group.name || 'Nhóm');
        setGroupAvatar(group.avatarUrl || undefined);
        setMembers(Array.isArray(group.users) ? group.users : []);
        setAdminIds(Array.isArray(group.adminIds) ? group.adminIds : []);
        setCreatorId(group.createdBy);
      }
    } catch (err) {
      console.error('Load group info failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateName = useCallback(async () => {
    const trimmed = nameEdit.trim();
    if (!trimmed || trimmed === groupName) {
      setIsEditing(false);
      return;
    }

    try {
      await api.patch(`/groups/${conversationId}`, { name: trimmed });
      setGroupName(trimmed);
      setIsEditing(false);
    } catch (err: any) {
      const message = err?.response?.data?.message;
      Alert.alert('Lỗi', typeof message === 'string' ? message : 'Không thể cập nhật');
    }
  }, [conversationId, groupName, nameEdit]);

  const handleLeaveGroup = useCallback(() => {
    Alert.alert('Rời nhóm', 'Bạn có chắc muốn rời nhóm này?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Rời nhóm',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/groups/${conversationId}/members/me`);
            router.back();
          } catch (err: any) {
            const message = err?.response?.data?.message;
            Alert.alert('Lỗi', typeof message === 'string' ? message : 'Không thể rời nhóm');
          }
        },
      },
    ]);
  }, [conversationId, router]);

  const handleDisbandGroup = useCallback(() => {
    Alert.alert('Giải tán nhóm', 'Tất cả thành viên sẽ bị loại. Bạn có chắc?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Giải tán',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/groups/${conversationId}`);
            router.back();
          } catch (err: any) {
            const message = err?.response?.data?.message;
            Alert.alert('Lỗi', typeof message === 'string' ? message : 'Không thể giải tán nhóm');
          }
        },
      },
    ]);
  }, [conversationId, router]);

  const handleRemoveMember = useCallback(
    (memberId: string, displayName: string) => {
      Alert.alert('Xóa thành viên', `Xóa ${displayName} khỏi nhóm?`, [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/groups/${conversationId}/members/${memberId}`);
              setMembers((prev) => prev.filter((m) => m._id !== memberId));
            } catch (err: any) {
              const message = err?.response?.data?.message;
              Alert.alert('Lỗi', typeof message === 'string' ? message : 'Không thể xóa thành viên');
            }
          },
        },
      ]);
    },
    [conversationId],
  );

  const handleToggleRole = useCallback(
    async (memberId: string, currentRole: 'admin' | 'member') => {
      const newRole = currentRole === 'admin' ? 'member' : 'admin';
      try {
        const res = await api.patch(
          `/groups/${conversationId}/members/${memberId}/role`,
          { role: newRole },
        );
        if (res.data?.data?.adminIds) {
          setAdminIds(res.data.data.adminIds);
        }
      } catch (err: any) {
        const message = err?.response?.data?.message;
        Alert.alert('Lỗi', typeof message === 'string' ? message : 'Không thể cập nhật quyền');
      }
    },
    [conversationId],
  );

  const renderMember = useCallback(
    ({ item }: { item: Member }) => {
      const isMemberAdmin = adminIds.includes(item._id);
      const isCreator = item._id === creatorId;
      const isMe = item._id === userId;
      const initial = (item.displayName || '?').charAt(0).toUpperCase();

      return (
        <View style={styles.memberRow}>
          {item.avatarUrl ? (
            <Image source={{ uri: item.avatarUrl }} style={styles.memberAvatar} />
          ) : (
            <View style={[styles.memberAvatar, styles.memberAvatarFallback]}>
              <Text style={styles.memberAvatarLetter}>{initial}</Text>
            </View>
          )}
          <View style={styles.memberInfo}>
            <Text style={styles.memberName}>
              {item.displayName}
              {isMe ? ' (Bạn)' : ''}
            </Text>
            <Text style={styles.memberRole}>
              {isCreator ? 'Người tạo' : isMemberAdmin ? 'Quản trị viên' : 'Thành viên'}
            </Text>
          </View>

          {/* Actions chi hien cho admin va khong phai chinh minh */}
          {isAdmin && !isMe && !isCreator && (
            <View style={styles.memberActions}>
              <TouchableOpacity
                style={styles.memberActionBtn}
                onPress={() => handleToggleRole(item._id, isMemberAdmin ? 'admin' : 'member')}
              >
                <Ionicons
                  name={isMemberAdmin ? 'shield-outline' : 'shield-checkmark-outline'}
                  size={18}
                  color={isMemberAdmin ? '#f59e0b' : lightTheme.accent}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.memberActionBtn}
                onPress={() => handleRemoveMember(item._id, item.displayName)}
              >
                <Ionicons name="person-remove-outline" size={18} color="#ef4444" />
              </TouchableOpacity>
            </View>
          )}
        </View>
      );
    },
    [adminIds, creatorId, handleRemoveMember, handleToggleRole, isAdmin, userId],
  );

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={lightTheme.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Thông tin nhóm</Text>
        <View style={{ width: 24 }} />
      </View>

      {isLoading ? (
        <View style={{ padding: 16, gap: 12 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCardPreset key={i} lines={2} showAvatar={false} />
          ))}
        </View>
      ) : (
        <FlatList
          data={members}
          keyExtractor={(item) => item._id}
          renderItem={renderMember}
          ListHeaderComponent={
            <View>
              {/* Group avatar + name */}
              <View style={styles.groupHeader}>
                <View style={styles.groupAvatarBox}>
                  {groupAvatar ? (
                    <Image source={{ uri: groupAvatar }} style={styles.groupAvatar} />
                  ) : (
                    <View style={[styles.groupAvatar, styles.groupAvatarFallback]}>
                      <Ionicons name="people" size={36} color={lightTheme.accent} />
                    </View>
                  )}
                </View>

                {isEditing ? (
                  <View style={styles.editNameRow}>
                    <TextInput
                      style={styles.editNameInput}
                      value={nameEdit}
                      onChangeText={setNameEdit}
                      autoFocus
                      maxLength={50}
                      onSubmitEditing={handleUpdateName}
                    />
                    <TouchableOpacity onPress={handleUpdateName}>
                      <Ionicons name="checkmark-circle" size={24} color={lightTheme.accent} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.nameRow}
                    onPress={() => {
                      if (isAdmin) {
                        setNameEdit(groupName);
                        setIsEditing(true);
                      }
                    }}
                  >
                    <Text style={styles.groupNameText}>{groupName}</Text>
                    {isAdmin && (
                      <Ionicons name="pencil-outline" size={16} color={lightTheme.textTertiary} />
                    )}
                  </TouchableOpacity>
                )}

                <Text style={styles.memberCount}>{members.length} thành viên</Text>
              </View>

              {/* Actions */}
              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.actionBtn} onPress={handleLeaveGroup}>
                  <Ionicons name="exit-outline" size={20} color="#ef4444" />
                  <Text style={[styles.actionLabel, { color: '#ef4444' }]}>Rời nhóm</Text>
                </TouchableOpacity>
                {isAdmin && creatorId === userId && (
                  <TouchableOpacity style={styles.actionBtn} onPress={handleDisbandGroup}>
                    <Ionicons name="trash-outline" size={20} color="#ef4444" />
                    <Text style={[styles.actionLabel, { color: '#ef4444' }]}>Giải tán</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Members header */}
              <Text style={styles.sectionTitle}>Thành viên</Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: 40 }}
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
  groupHeader: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  groupAvatarBox: {
    marginBottom: 16,
  },
  groupAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  groupAvatarFallback: {
    backgroundColor: lightTheme.accentLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  groupNameText: {
    fontSize: 22,
    fontWeight: '700',
    color: lightTheme.textPrimary,
    fontFamily: 'BeVietnamPro_700Bold',
  },
  editNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
  },
  editNameInput: {
    flex: 1,
    fontSize: 18,
    color: lightTheme.textPrimary,
    borderBottomWidth: 1,
    borderBottomColor: lightTheme.accent,
    paddingVertical: 4,
    fontFamily: 'BeVietnamPro_500Medium',
  },
  memberCount: {
    fontSize: 13,
    color: lightTheme.textTertiary,
    fontFamily: 'BeVietnamPro_400Regular',
    marginTop: 4,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: lightTheme.borderLight,
    marginHorizontal: 16,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'BeVietnamPro_600SemiBold',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: lightTheme.textTertiary,
    fontFamily: 'BeVietnamPro_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: lightTheme.borderLight,
  },
  memberAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    marginRight: 12,
  },
  memberAvatarFallback: {
    backgroundColor: lightTheme.accentLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  memberAvatarLetter: {
    fontSize: 16,
    fontWeight: '600',
    color: lightTheme.accent,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 15,
    fontWeight: '500',
    color: lightTheme.textPrimary,
    fontFamily: 'BeVietnamPro_500Medium',
  },
  memberRole: {
    fontSize: 12,
    color: lightTheme.textTertiary,
    fontFamily: 'BeVietnamPro_400Regular',
    marginTop: 2,
  },
  memberActions: {
    flexDirection: 'row',
    gap: 8,
  },
  memberActionBtn: {
    padding: 6,
  },
});
