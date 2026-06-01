import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  CheckCheck,
  ChevronRight,
  HelpCircle,
  Info,
  KeyRound,
  LogOut,
  Moon,
  Radio,
  ShieldCheck,
  User,
  Users,
  Volume2,
  MessageCircle,
} from 'lucide-react-native';
import { useAuthStore } from '../src/store/useAuthStore';
import { socketService } from '../src/services/socket';
import api from '../src/services/api';
import { useAppPreferencesStore } from '../src/store/useAppPreferencesStore';
import { getAppTheme } from '../src/theme/get-app-theme';

export default function SettingsScreen() {
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const appThemeMode = useAppPreferencesStore((s) => s.theme);
  const theme = getAppTheme(appThemeMode);

  const [notifyMessages, setNotifyMessages] = useState(true);
  const [notifyFriends, setNotifyFriends] = useState(true);
  const [notifySounds, setNotifySounds] = useState(true);
  const [showOnlineStatus, setShowOnlineStatus] = useState(true);
  const [showReadReceipts, setShowReadReceipts] = useState(true);

  const handleLogout = useCallback(() => {
    Alert.alert('Đăng xuất', 'Bạn có chắc chắn muốn đăng xuất?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Đăng xuất',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.post('/auth/logout').catch(() => {});
            socketService.disconnect();
            await logout();
            router.replace('/(auth)/login');
          } catch {
            await logout();
            router.replace('/(auth)/login');
          }
        },
      },
    ]);
  }, [logout, router]);

  const accountItems = [
    { Icon: User, label: 'Chỉnh sửa hồ sơ', color: theme.accent },
    { Icon: KeyRound, label: 'Đổi mật khẩu', color: theme.info },
    { Icon: ShieldCheck, label: 'Bảo mật hai bước', color: theme.warning },
  ];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bgPrimary }]}>
      <View style={[styles.header, { borderBottomColor: theme.borderLight }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={22} stroke={theme.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>Cài đặt</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textTertiary }]}>Tài khoản</Text>
          <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
            {accountItems.map((item, idx) => (
              <TouchableOpacity
                key={idx}
                style={[styles.menuItem, idx < accountItems.length - 1 && styles.menuItemBorder, idx < accountItems.length - 1 && { borderBottomColor: theme.borderLight }]}
              >
                <View style={[styles.menuIconBox, { backgroundColor: `${item.color}15` }]}>
                  <item.Icon size={20} stroke={item.color} />
                </View>
                <Text style={[styles.menuLabel, { color: theme.textPrimary }]}>{item.label}</Text>
                <ChevronRight size={18} stroke={theme.textTertiary} />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textTertiary }]}>Giao diện</Text>
          <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
            <View style={styles.switchRow}>
              <View style={styles.switchInfo}>
                <Moon size={20} stroke={theme.violet} />
                <Text style={[styles.switchLabel, { color: theme.textPrimary }]}>Chế độ tối</Text>
              </View>
              <Switch
                value={false}
                disabled
                trackColor={{ false: theme.border, true: theme.accent }}
                thumbColor={theme.textOnAccent}
              />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textTertiary }]}>Thông báo</Text>
          <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
            {[
              { Icon: MessageCircle, label: 'Tin nhắn', value: notifyMessages, setValue: setNotifyMessages, color: theme.accent },
              { Icon: Users, label: 'Lời mời kết bạn', value: notifyFriends, setValue: setNotifyFriends, color: theme.info },
              { Icon: Volume2, label: 'Âm thanh', value: notifySounds, setValue: setNotifySounds, color: theme.pink },
            ].map((item, idx, arr) => (
              <View key={item.label} style={[styles.switchRow, idx < arr.length - 1 && styles.menuItemBorder, idx < arr.length - 1 && { borderBottomColor: theme.borderLight }]}>
                <View style={styles.switchInfo}>
                  <item.Icon size={20} stroke={item.color} />
                  <Text style={[styles.switchLabel, { color: theme.textPrimary }]}>{item.label}</Text>
                </View>
                <Switch
                  value={item.value}
                  onValueChange={item.setValue}
                  trackColor={{ false: theme.border, true: theme.accent }}
                  thumbColor={theme.textOnAccent}
                />
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textTertiary }]}>Quyền riêng tư</Text>
          <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
            {[
              { Icon: Radio, label: 'Trạng thái online', value: showOnlineStatus, setValue: setShowOnlineStatus, color: theme.accent },
              { Icon: CheckCheck, label: 'Xác nhận đã đọc', value: showReadReceipts, setValue: setShowReadReceipts, color: theme.info },
            ].map((item, idx) => (
              <View key={item.label} style={[styles.switchRow, idx === 0 && styles.menuItemBorder, idx === 0 && { borderBottomColor: theme.borderLight }]}>
                <View style={styles.switchInfo}>
                  <item.Icon size={20} stroke={item.color} />
                  <Text style={[styles.switchLabel, { color: theme.textPrimary }]}>{item.label}</Text>
                </View>
                <Switch
                  value={item.value}
                  onValueChange={item.setValue}
                  trackColor={{ false: theme.border, true: theme.accent }}
                  thumbColor={theme.textOnAccent}
                />
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textTertiary }]}>Thông tin</Text>
          <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
            <TouchableOpacity style={[styles.menuItem, styles.menuItemBorder, { borderBottomColor: theme.borderLight }]}>
              <View style={[styles.menuIconBox, { backgroundColor: `${theme.info}15` }]}>
                <HelpCircle size={20} stroke={theme.info} />
              </View>
              <Text style={[styles.menuLabel, { color: theme.textPrimary }]}>Trợ giúp & Phản hồi</Text>
              <ChevronRight size={18} stroke={theme.textTertiary} />
            </TouchableOpacity>
            <View style={styles.menuItem}>
              <View style={[styles.menuIconBox, { backgroundColor: `${theme.neutral}15` }]}>
                <Info size={20} stroke={theme.neutral} />
              </View>
              <Text style={[styles.menuLabel, { color: theme.textPrimary }]}>Phiên bản</Text>
              <Text style={[styles.versionText, { color: theme.textTertiary }]}>1.0.0</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity style={[styles.logoutBtn, { backgroundColor: theme.dangerSoft, borderColor: theme.dangerBorder }]} onPress={handleLogout}>
          <LogOut size={20} stroke={theme.danger} />
          <Text style={[styles.logoutText, { color: theme.danger }]}>Đăng xuất</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontFamily: 'BeVietnamPro_600SemiBold' },
  scroll: { flex: 1, paddingHorizontal: 16 },
  section: { marginTop: 24 },
  sectionTitle: {
    fontSize: 13,
    fontFamily: 'BeVietnamPro_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  menuItemBorder: { borderBottomWidth: StyleSheet.hairlineWidth },
  menuIconBox: {
    width: 34,
    height: 34,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  menuLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'BeVietnamPro_500Medium',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  switchInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchLabel: { fontSize: 15, fontFamily: 'BeVietnamPro_500Medium' },
  versionText: { fontSize: 14, fontFamily: 'BeVietnamPro_400Regular' },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 30,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  logoutText: { fontSize: 15, fontFamily: 'BeVietnamPro_600SemiBold' },
});
