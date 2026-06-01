import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Bell, HelpCircle, Lock, LogOut, Palette, Settings, ShieldCheck,
} from 'lucide-react-native';
import { useAuthStore } from '../../src/store/useAuthStore';
import { socketService } from '../../src/services/socket';
import api from '../../src/services/api';

import { AppScreen } from '../../src/ui/AppScreen';
import { AppCard } from '../../src/ui/AppCard';
import { Avatar } from '../../src/ui/Avatar';
import { fonts } from '../../src/theme/fonts';
import { lightTheme } from '../../src/theme/colors';
import { ProfileMenuItem } from '../../src/ui/ProfileMenuItem';
import { ConfirmDialog } from '../../src/ui/ConfirmDialog';

export default function ProfileScreen() {
  const router = useRouter();
  const userInfo = useAuthStore((s) => s.userInfo);
  const logout = useAuthStore((s) => s.logout);

  const [friendCount, setFriendCount] = useState(0);
  const [conversationCount, setConversationCount] = useState(0);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);

  const displayName = userInfo?.displayName || userInfo?.username || 'Người dùng Zync';
  const email = userInfo?.email || '';
  const username = userInfo?.username ? `@${userInfo.username}` : null;
  const joinedYear = userInfo?.createdAt ? new Date(userInfo.createdAt).getFullYear() : new Date().getFullYear();

  useEffect(() => {
    const loadStats = async () => {
      try {
        const [friendsRes, convsRes] = await Promise.all([
          api.get('/friends/count').catch(() => ({ data: { count: 0 } })),
          api.get('/conversations').catch(() => ({ data: { conversations: [] } })),
        ]);
        setFriendCount(friendsRes.data?.count || 0);
        const conversations = convsRes.data?.conversations || convsRes.data?.data || [];
        setConversationCount(Array.isArray(conversations) ? conversations.length : 0);
      } catch (e) {
        console.error('Profile stats error:', e);
      }
    };
    loadStats();
  }, []);

  const handleLogout = () => {
    setLogoutDialogOpen(true);
  };

  const confirmLogout = async () => {
    try {
      setLogoutLoading(true);
      await api.post('/auth/logout').catch(() => {});
      socketService.disconnect();
      await logout();
      router.replace('/(auth)/login');
    } finally {
      setLogoutLoading(false);
      setLogoutDialogOpen(false);
    }
  };

  const menuOptions = [
    { title: 'Tài khoản và Bảo mật', Icon: ShieldCheck, color: lightTheme.success, route: '/settings' },
    { title: 'Quyền riêng tư', Icon: Lock, color: lightTheme.info, route: '/settings' },
    { title: 'Thông báo', Icon: Bell, color: lightTheme.warning, route: '/settings' },
    { title: 'Giao diện và Ngôn ngữ', Icon: Palette, color: lightTheme.violet, route: '/settings' },
    { title: 'Trợ giúp & Phản hồi', Icon: HelpCircle, color: lightTheme.pink, route: '/settings' },
  ];
  return (
    <AppScreen scrollable hideStatusBar={false}>
      {/* Header Info */}
      <View style={styles.profileHeader}>
        <Avatar 
          url={userInfo?.avatarUrl} 
          name={displayName} 
          size={100} 
          style={styles.avatarMargin}
          showStatus
          status="online"
        />
        <Text style={styles.userName}>{displayName}</Text>
        {username ? <Text style={styles.userHandle}>{username}</Text> : null}
        {email ? <Text style={styles.userEmail}>{email}</Text> : null}
        
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.editProfileBtn} onPress={() => router.push('/settings')}>
            <Text style={styles.editProfileText}>Chỉnh sửa hồ sơ</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.settingsBtn} onPress={() => router.push('/settings')}>
            <Settings size={20} stroke={lightTheme.accent} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.contentPadding}>
        {/* Stats Row */}
        <AppCard style={styles.statsCard}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{friendCount}</Text>
            <Text style={styles.statLabel}>Bạn bè</Text>
          </View>
          <View style={styles.dividerVertical} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{conversationCount}</Text>
            <Text style={styles.statLabel}>Hội thoại</Text>
          </View>
          <View style={styles.dividerVertical} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{joinedYear}</Text>
            <Text style={styles.statLabel}>Tham gia</Text>
          </View>
        </AppCard>

        {/* Menu Items */}
        <AppCard style={styles.menuCard}>
          {menuOptions.map((item, index) => (
            <ProfileMenuItem
              key={index} 
              title={item.title}
              icon={<item.Icon size={20} stroke={item.color} />}
              tone={item.color}
              showBorder={index < menuOptions.length - 1}
              onPress={() => item.route && router.push(item.route as any)}
            />
          ))}
        </AppCard>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <LogOut size={22} stroke={lightTheme.danger} style={{ marginRight: 10 }} />
          <Text style={styles.logoutText}>Đăng xuất</Text>
        </TouchableOpacity>
      </View>

      <ConfirmDialog
        visible={logoutDialogOpen}
        title="Đăng xuất"
        message="Bạn có chắc chắn muốn đăng xuất khỏi tài khoản này?"
        cancelLabel="Hủy"
        confirmLabel="Đăng xuất"
        danger
        loading={logoutLoading}
        onCancel={() => setLogoutDialogOpen(false)}
        onConfirm={confirmLogout}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  profileHeader: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 20,
  },
  avatarMargin: {
    marginBottom: 16,
  },
  userName: {
    color: lightTheme.textPrimary,
    fontSize: 22,
    fontFamily: fonts.bold,
  },
  userHandle: {
    color: lightTheme.accent,
    fontSize: 14,
    fontFamily: fonts.medium,
    marginTop: 4,
  },
  userEmail: {
    color: lightTheme.textTertiary,
    fontSize: 14,
    fontFamily: fonts.regular,
    marginTop: 4,
  },
  headerActions: {
    flexDirection: 'row',
    marginTop: 20,
    alignItems: 'center',
  },
  editProfileBtn: {
    backgroundColor: lightTheme.accent,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    marginRight: 10,
  },
  editProfileText: {
    color: lightTheme.textOnAccent,
    fontSize: 14,
    fontFamily: fonts.semiBold,
  },
  settingsBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: lightTheme.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: lightTheme.border,
  },
  contentPadding: {
    paddingHorizontal: 16,
    paddingBottom: 132,
    gap: 16,
  },
  statsCard: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 20,
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 20,
    fontFamily: fonts.bold,
    color: lightTheme.textPrimary,
  },
  statLabel: {
    fontSize: 13,
    fontFamily: fonts.medium,
    color: lightTheme.textTertiary,
    marginTop: 4,
  },
  dividerVertical: {
    width: 1,
    backgroundColor: lightTheme.border,
    marginVertical: 4,
  },
  menuCard: {
    padding: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  menuItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F0F4F8',
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  menuText: {
    flex: 1,
    fontSize: 15,
    fontFamily: fonts.semiBold,
    color: lightTheme.textSecondary,
  },
  sectionCard: {
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: lightTheme.textPrimary,
    marginBottom: 16,
  },
  trustRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  trustLabel: {
    fontSize: 14,
    fontFamily: fonts.medium,
    color: lightTheme.textSecondary,
  },
  trustValue: {
    fontSize: 16,
    fontFamily: fonts.bold,
  },
  trustBarTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: lightTheme.surfaceSoft,
    marginBottom: 16,
    overflow: 'hidden',
  },
  trustBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  violationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  violationLabel: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: lightTheme.textSecondary,
  },
  violationValue: {
    fontSize: 15,
    fontFamily: fonts.bold,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: lightTheme.dangerSoft,
    padding: 12,
    borderRadius: 12,
    marginTop: 16,
    gap: 10,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    fontFamily: fonts.medium,
    color: lightTheme.danger,
  },
  securityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 12,
  },
  securityText: {
    fontSize: 14,
    fontFamily: fonts.medium,
    color: lightTheme.textSecondary,
    flex: 1,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: lightTheme.dangerSoft,
    paddingVertical: 16,
    borderRadius: 20,
    marginTop: 8,
  },
  logoutText: {
    color: lightTheme.danger,
    fontSize: 15,
    fontFamily: fonts.bold,
  },
});
