import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { MessageCircle, UserPlus } from 'lucide-react-native';
import { useAppPreferencesStore } from '../store/useAppPreferencesStore';
import { getAppTheme } from '../theme/get-app-theme';
import api from '../services/api';

interface UserProfile {
  _id: string;
  displayName: string;
  email?: string;
  username?: string;
  avatarUrl?: string;
  bio?: string;
  friendCount?: number;
  mutualFriends?: number;
  isFriend?: boolean;
  createdAt?: string;
}

interface ProfileBottomSheetProps {
  visible: boolean;
  userId: string | null;
  currentUserId: string;
  onClose: () => void;
  onSendMessage?: (userId: string) => void;
}

export function ProfileBottomSheet({
  visible,
  userId,
  currentUserId,
  onClose,
  onSendMessage,
}: ProfileBottomSheetProps) {
  const mode = useAppPreferencesStore((s) => s.theme);
  const theme = getAppTheme(mode);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [friendRequestSent, setFriendRequestSent] = useState(false);

  // Reset state when sheet closes or user changes
  useEffect(() => {
    if (!visible) {
      setFriendRequestSent(false);
      setActionLoading(false);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || !userId) return;
    void loadProfile();
  }, [visible, userId]);

  const loadProfile = async () => {
    if (!userId) return;
    try {
      setLoading(true);
      const res = await api.get(`/users/${userId}`);
      const userData = res.data?.data || res.data;
      setProfile(userData);
      // Reset friend request state when profile loads
      setFriendRequestSent(false);
    } catch (err) {
      console.error('Load profile failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSendFriendRequest = useCallback(async () => {
    if (!userId) return;
    try {
      setActionLoading(true);
      await api.post('/friends/request', { toUserId: userId });
      setFriendRequestSent(true);
    } catch (err) {
      console.error('Send friend request failed:', err);
    } finally {
      setActionLoading(false);
    }
  }, [userId]);

  if (!visible) return null;

  const isMe = userId === currentUserId;
  const initial = (profile?.displayName || '?').charAt(0).toUpperCase();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: theme.bgCard }]}>
          {/* Handle bar */}
          <View style={[styles.handle, { backgroundColor: theme.border }]} />

          {loading ? (
            <ActivityIndicator
              size="large"
              color={theme.accent}
              style={{ marginVertical: 60 }}
            />
          ) : profile ? (
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Avatar + Name */}
              <View style={styles.profileHeader}>
                {profile.avatarUrl ? (
                  <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: theme.accentLight }]}>
                    <Text style={[styles.avatarLetter, { color: theme.accent }]}>{initial}</Text>
                  </View>
                )}
                <Text style={[styles.displayName, { color: theme.textPrimary }]}>{profile.displayName}</Text>
                {profile.username && (
                  <Text style={[styles.username, { color: theme.textTertiary }]}>@{profile.username}</Text>
                )}
                {profile.bio && <Text style={[styles.bio, { color: theme.textSecondary }]}>{profile.bio}</Text>}
              </View>

              {/* Stats */}
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: theme.textPrimary }]}>{profile.friendCount ?? 0}</Text>
                  <Text style={[styles.statLabel, { color: theme.textTertiary }]}>Bạn bè</Text>
                </View>
                {profile.mutualFriends !== undefined && !isMe && (
                  <View style={styles.statItem}>
                    <Text style={[styles.statValue, { color: theme.textPrimary }]}>{profile.mutualFriends}</Text>
                    <Text style={[styles.statLabel, { color: theme.textTertiary }]}>Bạn chung</Text>
                  </View>
                )}
                {profile.createdAt && (
                  <View style={styles.statItem}>
                    <Text style={[styles.statValue, { color: theme.textPrimary }]}>
                      {new Date(profile.createdAt).getFullYear()}
                    </Text>
                    <Text style={[styles.statLabel, { color: theme.textTertiary }]}>Tham gia</Text>
                  </View>
                )}
              </View>

              {/* Actions */}
              {!isMe && (
                <View style={styles.actions}>
                  {profile.isFriend ? (
                    <TouchableOpacity
                      style={[styles.primaryBtn, { backgroundColor: theme.accent }]}
                      onPress={() => {
                        onSendMessage?.(profile._id);
                        onClose();
                      }}
                    >
                      <MessageCircle size={18} color={theme.textOnAccent} />
                      <Text style={[styles.primaryBtnText, { color: theme.textOnAccent }]}>Nhắn tin</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[
                        styles.primaryBtn,
                        { backgroundColor: friendRequestSent ? theme.bgSecondary : theme.accent },
                      ]}
                      onPress={handleSendFriendRequest}
                      disabled={actionLoading || friendRequestSent}
                    >
                      {actionLoading ? (
                        <ActivityIndicator size="small" color={theme.textOnAccent} />
                      ) : (
                        <>
                          <UserPlus size={18} color={theme.textOnAccent} />
                          <Text style={[styles.primaryBtnText, { color: theme.textOnAccent }]}>
                            {friendRequestSent ? 'Đã gửi' : 'Kết bạn'}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* Close */}
              <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                <Text style={[styles.closeBtnText, { color: theme.textTertiary }]}>Đóng</Text>
              </TouchableOpacity>
            </ScrollView>
          ) : (
            <Text style={[styles.errorText, { color: theme.textTertiary }]}>Không thể tải thông tin</Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 36,
    maxHeight: '75%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 16,
  },
  profileHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 12,
  },
  avatarFallback: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarLetter: {
    fontSize: 30,
    fontWeight: '600',
  },
  displayName: {
    fontSize: 20,
    fontWeight: '700',
    fontFamily: 'BeVietnamPro_700Bold',
  },
  username: {
    fontSize: 14,
    fontFamily: 'BeVietnamPro_400Regular',
    marginTop: 2,
  },
  bio: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 20,
    fontFamily: 'BeVietnamPro_400Regular',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 28,
    marginBottom: 24,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: 'BeVietnamPro_700Bold',
  },
  statLabel: {
    fontSize: 11,
    fontFamily: 'BeVietnamPro_400Regular',
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    paddingVertical: 12,
  },
  primaryBtnText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'BeVietnamPro_600SemiBold',
  },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    paddingVertical: 12,
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'BeVietnamPro_600SemiBold',
  },
  closeBtn: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  closeBtnText: {
    fontSize: 14,
    fontFamily: 'BeVietnamPro_500Medium',
  },
  errorText: {
    textAlign: 'center',
    marginVertical: 40,
    fontSize: 14,
  },
});
