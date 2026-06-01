import React from 'react';
import { 
  View, 
  StyleSheet, 
  Text, 
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassPanel } from '../../src/ui/GlassPanel';
import { colors } from '../../src/theme/colors';
import { typography } from '../../src/theme/fonts';
import { useAuthStore } from '../../src/store/useAuthStore';
import { Zap, MessageCircle, Users, Shield, ArrowRight } from 'lucide-react-native';
import { getPostAuthRoute } from '../../src/utils/onboarding';

const FEATURES = [
  {
    icon: MessageCircle,
    title: 'Trò chuyện thời gian thực',
    description: 'Kết nối với cộng đồng developer mọi lúc mọi nơi',
  },
  {
    icon: Users,
    title: 'Kết nối cộng đồng',
    description: 'Tìm kiếm và kết nối với những lập trình viên cùng chí hướng',
  },
  {
    icon: Shield,
    title: 'Bảo mật & Riêng tư',
    description: 'Dữ liệu của bạn được bảo vệ an toàn tuyệt đối',
  },
];

export default function WelcomeScreen() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const userInfo = useAuthStore((s) => s.userInfo);

  const handleLoginPress = () => {
    if (isAuthenticated) {
      router.replace(getPostAuthRoute(userInfo));
    } else {
      router.push('/(auth)/login');
    }
  };

  return (
    <LinearGradient
      colors={[colors.backgroundSoft, colors.backgroundMid, colors.backgroundDeep]}
      style={styles.container}
    >
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={styles.safeArea}>
        {/* Logo Section */}
        <View style={styles.logoSection}>
          <View style={styles.logoContainer}>
            <Zap size={48} color={colors.accent} strokeWidth={2.5} />
          </View>
          <Text style={styles.appName}>Zync</Text>
          <Text style={styles.tagline}>Nền tảng kết nối developer</Text>
        </View>

        {/* Features */}
        <GlassPanel style={styles.featuresCard}>
          {FEATURES.map((feature, index) => (
            <View 
              key={feature.title} 
              style={[
                styles.featureItem,
                index < FEATURES.length - 1 && styles.featureItemBorder
              ]}
            >
              <View style={styles.featureIcon}>
                <feature.icon size={20} color={colors.accent} strokeWidth={2} />
              </View>
              <View style={styles.featureContent}>
                <Text style={styles.featureTitle}>{feature.title}</Text>
                <Text style={styles.featureDesc}>{feature.description}</Text>
              </View>
            </View>
          ))}
        </GlassPanel>

        {/* Action Buttons */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity 
            style={styles.loginButton}
            onPress={handleLoginPress}
            activeOpacity={0.8}
          >
            <Text style={styles.loginButtonText}>
              {isAuthenticated ? 'Tiếp tục' : 'Đăng nhập'}
            </Text>
            <ArrowRight size={20} color={colors.text} strokeWidth={2} />
          </TouchableOpacity>

          {!isAuthenticated && (
            <TouchableOpacity 
              style={styles.registerButton}
              onPress={() => router.push('/(auth)/register')}
              activeOpacity={0.8}
            >
              <Text style={styles.registerButtonText}>Tạo tài khoản mới</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Footer */}
        <Text style={styles.footerText}>
          Tiếp tục nghĩa là bạn đồng ý với{' '}
          <Text style={styles.footerLink}>Điều khoản sử dụng</Text>
          {' '}và{' '}
          <Text style={styles.footerLink}>Chính sách bảo mật</Text>
        </Text>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: 24,
  },
  logoSection: {
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 40,
  },
  logoContainer: {
    width: 96,
    height: 96,
    borderRadius: 28,
    backgroundColor: colors.glassPanel,
    borderWidth: 2,
    borderColor: colors.glassBorder,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: colors.glassGlow,
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  appName: {
    ...typography.h1,
    fontSize: 36,
    color: colors.text,
    marginBottom: 8,
    letterSpacing: 2,
  },
  tagline: {
    ...typography.body,
    color: colors.textSubtle,
    textAlign: 'center',
  },
  featuresCard: {
    padding: 24,
    marginBottom: 40,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 16,
  },
  featureItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.glassBorder,
  },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.glassPanel,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    ...typography.body,
    color: colors.text,
    fontFamily: 'BeVietnamPro_600SemiBold',
    marginBottom: 4,
  },
  featureDesc: {
    ...typography.caption,
    color: colors.textSubtle,
    lineHeight: 18,
  },
  buttonContainer: {
    gap: 12,
    marginBottom: 24,
  },
  loginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    backgroundColor: colors.accent,
    borderRadius: 16,
    gap: 8,
  },
  loginButtonText: {
    ...typography.body,
    color: colors.text,
    fontFamily: 'BeVietnamPro_600SemiBold',
  },
  registerButton: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    backgroundColor: 'transparent',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  registerButtonText: {
    ...typography.body,
    color: colors.text,
    fontFamily: 'BeVietnamPro_500Medium',
  },
  footerText: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    paddingBottom: 24,
    lineHeight: 18,
  },
  footerLink: {
    color: colors.accent,
  },
});

