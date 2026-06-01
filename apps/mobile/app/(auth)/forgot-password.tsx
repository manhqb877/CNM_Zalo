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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Input } from '../../src/ui/Input';
import { Button } from '../../src/ui/Button';
import { GlassPanel } from '../../src/ui/GlassPanel';
import { AuthHeader } from '../../src/components/AuthHeader';
import { colors } from '../../src/theme/colors';
import { typography } from '../../src/theme/fonts';
import api from '../../src/services/api';
import { Zap, Mail } from 'lucide-react-native';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { step, email: paramEmail, otp: paramOtp } = useLocalSearchParams();
  
  const isResetStep = step === 'reset';

  const [email, setEmail] = useState((paramEmail as string) || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{
    email?: string;
    newPassword?: string;
    confirmPassword?: string;
  }>({});

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
      setErrors(prev => ({ ...prev, newPassword: 'Vui lòng nhập mật khẩu mới' }));
      return false;
    }
    if (passwordValue.length < 6) {
      setErrors(prev => ({ ...prev, newPassword: 'Mật khẩu phải có ít nhất 6 ký tự' }));
      return false;
    }
    setErrors(prev => ({ ...prev, newPassword: undefined }));
    return true;
  };

  // Ham validate confirm password
  const validateConfirmPassword = (confirmValue: string): boolean => {
    if (!confirmValue) {
      setErrors(prev => ({ ...prev, confirmPassword: 'Vui lòng xác nhận mật khẩu' }));
      return false;
    }
    if (confirmValue !== newPassword) {
      setErrors(prev => ({ ...prev, confirmPassword: 'Mật khẩu xác nhận không khớp' }));
      return false;
    }
    setErrors(prev => ({ ...prev, confirmPassword: undefined }));
    return true;
  };

  const handleRequestOtp = async () => {
    if (!validateEmail(email)) {
      return;
    }

    try {
      setIsLoading(true);
      await api.post('/auth/forgot-password/request-otp', { email });
      router.push({
        pathname: '/(auth)/verify-otp',
        params: { email, flow: 'forgot' },
      });
    } catch (error: any) {
      const message = error.response?.data?.message || 'Có lỗi xảy ra';
      Alert.alert('Lỗi', message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = async () => {
    const isPasswordValid = validatePassword(newPassword);
    const isConfirmValid = validateConfirmPassword(confirmPassword);
    
    if (!isPasswordValid || !isConfirmValid) {
      return;
    }

    try {
      setIsLoading(true);
      await api.post('/auth/forgot-password/reset', {
        email,
        otp: paramOtp,
        newPassword
      });
      Alert.alert('Thành công', 'Mật khẩu đã được thay đổi. Vui lòng đăng nhập lại.');
      router.replace('/(auth)/login');
    } catch (error: any) {
      const message = error.response?.data?.message || 'Có lỗi xảy ra';
      Alert.alert('Lỗi', message);
    } finally {
      setIsLoading(false);
    }
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
            <AuthHeader 
              title="Quên mật khẩu" 
              showBackButton={true}
            />

            {/* Logo & Description */}
            <View style={styles.logoSection}>
              <View style={styles.logoContainer}>
                <Mail size={40} color={colors.accent} strokeWidth={2.5} />
              </View>
              <Text style={styles.welcomeTitle}>
                {isResetStep ? 'Đặt lại mật khẩu' : 'Khôi phục tài khoản'}
              </Text>
              <Text style={styles.welcomeSubtitle}>
                {isResetStep 
                  ? 'Nhập mật khẩu mới cho tài khoản của bạn'
                  : 'Nhập email đã đăng ký để nhận mã xác thực'
                }
              </Text>
            </View>

            {/* Form */}
            <GlassPanel style={styles.formCard}>
              {!isResetStep ? (
                <>
                  <Input
                    label="Email"
                    placeholder="Nhập email khôi phục"
                    value={email}
                    onChangeText={(text) => {
                      setEmail(text);
                      if (errors.email) validateEmail(text);
                    }}
                    onBlur={() => validateEmail(email)}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    error={errors.email}
                  />
                  <Button 
                    title="Gửi mã OTP"
                    onPress={handleRequestOtp} 
                    isLoading={isLoading}
                    style={styles.submitButton}
                  />
                </>
              ) : (
                <>
                  <Input
                    label="Mật khẩu mới"
                    placeholder="Nhập mật khẩu mới"
                    value={newPassword}
                    onChangeText={(text) => {
                      setNewPassword(text);
                      if (errors.newPassword) validatePassword(text);
                    }}
                    onBlur={() => validatePassword(newPassword)}
                    isPassword
                    error={errors.newPassword}
                  />
                  <Input
                    label="Xác nhận mật khẩu"
                    placeholder="Nhập lại mật khẩu mới"
                    value={confirmPassword}
                    onChangeText={(text) => {
                      setConfirmPassword(text);
                      if (errors.confirmPassword) validateConfirmPassword(text);
                    }}
                    onBlur={() => validateConfirmPassword(confirmPassword)}
                    isPassword
                    error={errors.confirmPassword}
                  />
                  <Button 
                    title="Cập nhật mật khẩu"
                    onPress={handleReset} 
                    isLoading={isLoading}
                    style={styles.submitButton}
                  />
                </>
              )}
            </GlassPanel>

            {/* Login Link */}
            <View style={styles.loginContainer}>
              <TouchableOpacity 
                onPress={() => router.replace('/(auth)/login')}
                activeOpacity={0.7}
              >
                <Text style={styles.loginLink}>Quay về trang đăng nhập</Text>
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
  submitButton: {
    marginTop: 8,
  },
  loginContainer: {
    alignItems: 'center',
    paddingBottom: 24,
  },
  loginLink: {
    ...typography.caption,
    color: colors.accent,
    fontFamily: 'BeVietnamPro_600SemiBold',
  },
});
