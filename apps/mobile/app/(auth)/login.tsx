import React, { useState } from 'react';
import { 
  View, 
  StyleSheet, 
  Text, 
  Alert, 
  KeyboardAvoidingView, 
  Platform, 
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Input } from '../../src/ui/Input';
import { Button } from '../../src/ui/Button';
import { GlassPanel } from '../../src/ui/GlassPanel';
import { AuthHeader } from '../../src/components/AuthHeader';
import { colors } from '../../src/theme/colors';
import { typography } from '../../src/theme/fonts';
import api from '../../src/services/api';
import { Zap, Mail, Lock, Eye, EyeOff } from 'lucide-react-native';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  // Ham validate email
  const validateEmail = (emailValue: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailValue) {
      setErrors(prev => ({ ...prev, email: 'Vui lòng nhập email' }));
      return false;
    }
    if (!emailRegex.test(emailValue)) {
      setErrors(prev => ({ ...prev, email: 'Email không hợp lệ' }));
      return false;
    }
    setErrors(prev => ({ ...prev, email: undefined }));
    return true;
  };

  // Ham validate password
  const validatePassword = (passwordValue: string): boolean => {
    if (!passwordValue) {
      setErrors(prev => ({ ...prev, password: 'Vui lòng nhập mật khẩu' }));
      return false;
    }
    if (passwordValue.length < 6) {
      setErrors(prev => ({ ...prev, password: 'Mật khẩu phải có ít nhất 6 ký tự' }));
      return false;
    }
    setErrors(prev => ({ ...prev, password: undefined }));
    return true;
  };

  const handleLogin = async () => {
    // Reset errors
    setErrors({});
    
    // Validate inputs
    const isEmailValid = validateEmail(email);
    const isPasswordValid = validatePassword(password);
    
    if (!isEmailValid || !isPasswordValid) {
      return;
    }

    try {
      setIsLoading(true);
      // Yeu cau OTP cho dang nhap
      await api.post('/auth/login-password/request-otp', { email, password });
      
      // Chuyen huong den man hinh xac thuc OTP
      router.push({
        pathname: '/(auth)/verify-otp',
        params: { email, password, flow: 'login' },
      });
    } catch (error: any) {
      const message = error.response?.data?.message || 'Đăng nhập thất bại';
      Alert.alert('Lỗi', message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    Alert.alert('Thông báo', 'Đăng nhập với Google đang được phát triển');
  };

  return (
    <LinearGradient
      colors={[colors.backgroundSoft, colors.backgroundMid, colors.backgroundDeep]}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView 
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView 
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Header */}
            <AuthHeader title="Đăng nhập" />

            {/* Logo & Welcome */}
            <View style={styles.logoSection}>
              <View style={styles.logoContainer}>
                <Zap size={40} color={colors.accent} strokeWidth={2.5} />
              </View>
              <Text style={styles.welcomeTitle}>Chào mừng bạn!</Text>
              <Text style={styles.welcomeSubtitle}>
                Đăng nhập để kết nối và trò chuyện thời gian thực
              </Text>
            </View>

            {/* Form */}
            <GlassPanel style={styles.formCard}>
              <Input
                label="Email"
                placeholder="Nhập email của bạn"
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  if (errors.email) validateEmail(text);
                }}
                onBlur={() => validateEmail(email)}
                keyboardType="email-address"
                autoCapitalize="none"
                error={errors.email}
              />

              <Input
                label="Mật khẩu"
                placeholder="Nhập mật khẩu"
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  if (errors.password) validatePassword(text);
                }}
                onBlur={() => validatePassword(password)}
                isPassword
                error={errors.password}
              />

              {/* Remember me & Forgot password */}
              <View style={styles.optionsRow}>
                <TouchableOpacity 
                  style={styles.rememberContainer}
                  onPress={() => setRememberMe(!rememberMe)}
                  activeOpacity={0.7}
                >
                  <View style={[
                    styles.checkbox,
                    rememberMe && styles.checkboxChecked
                  ]}>
                    {rememberMe && (
                      <Text style={styles.checkmark}>✓</Text>
                    )}
                  </View>
                  <Text style={styles.rememberText}>Ghi nhớ đăng nhập</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  onPress={() => router.push('/(auth)/forgot-password')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.forgotText}>Quên mật khẩu?</Text>
                </TouchableOpacity>
              </View>

              <Button 
                title="Đăng nhập"
                onPress={handleLogin} 
                isLoading={isLoading}
                style={styles.loginButton} 
              />
            </GlassPanel>

            {/* Google Login */}
            <View style={styles.dividerContainer}>
              <View style={styles.divider} />
              <Text style={styles.dividerText}>Hoặc đăng nhập với</Text>
              <View style={styles.divider} />
            </View>

            <TouchableOpacity 
              style={styles.googleButton}
              onPress={handleGoogleLogin}
              activeOpacity={0.8}
            >
              <Text style={styles.googleIcon}>G</Text>
              <Text style={styles.googleText}>Đăng nhập với Google</Text>
            </TouchableOpacity>

            {/* Register Link */}
            <View style={styles.registerContainer}>
              <Text style={styles.registerText}>
                Chưa có tài khoản? 
              </Text>
              <TouchableOpacity 
                onPress={() => router.push('/(auth)/register')}
                activeOpacity={0.7}
              >
                <Text style={styles.registerLink}>Đăng ký ngay</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
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
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 8,
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: colors.glassPanel,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: colors.glassGlow,
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  welcomeTitle: {
    ...typography.h2,
    color: colors.text,
    marginBottom: 8,
  },
  welcomeSubtitle: {
    ...typography.body,
    color: colors.textSubtle,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  formCard: {
    padding: 24,
    marginBottom: 24,
  },
  optionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  rememberContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.textSubtle,
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  checkmark: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  rememberText: {
    ...typography.caption,
    color: colors.textSubtle,
  },
  forgotText: {
    ...typography.caption,
    color: colors.accent,
    fontFamily: 'BeVietnamPro_600SemiBold',
  },
  loginButton: {
    marginTop: 8,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: colors.glassBorder,
  },
  dividerText: {
    ...typography.caption,
    color: colors.textMuted,
    marginHorizontal: 16,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    backgroundColor: colors.glassPanel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    marginBottom: 24,
  },
  googleIcon: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.accent,
    marginRight: 10,
  },
  googleText: {
    ...typography.body,
    color: colors.text,
    fontFamily: 'BeVietnamPro_600SemiBold',
  },
  registerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 24,
  },
  registerText: {
    ...typography.body,
    color: colors.textSubtle,
  },
  registerLink: {
    ...typography.body,
    color: colors.accent,
    fontFamily: 'BeVietnamPro_600SemiBold',
    marginLeft: 4,
  },
});
