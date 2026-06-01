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
import { Zap } from 'lucide-react-native';

export default function RegisterScreen() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{
    displayName?: string;
    email?: string;
    username?: string;
    password?: string;
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

  // Ham validate username
  const validateUsername = (usernameValue: string): boolean => {
    if (!usernameValue) {
      setErrors(prev => ({ ...prev, username: 'Vui lòng nhập username' }));
      return false;
    }
    if (usernameValue.length < 3) {
      setErrors(prev => ({ ...prev, username: 'Username phải có ít nhất 3 ký tự' }));
      return false;
    }
    if (!/^[a-zA-Z0-9._]+$/.test(usernameValue)) {
      setErrors(prev => ({ ...prev, username: 'Username chỉ chứa chữ, số, dấu chấm và gạch dưới' }));
      return false;
    }
    setErrors(prev => ({ ...prev, username: undefined }));
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

  // Ham validate display name
  const validateDisplayName = (nameValue: string): boolean => {
    if (!nameValue) {
      setErrors(prev => ({ ...prev, displayName: 'Vui lòng nhập tên hiển thị' }));
      return false;
    }
    if (nameValue.length < 2) {
      setErrors(prev => ({ ...prev, displayName: 'Tên phải có ít nhất 2 ký tự' }));
      return false;
    }
    setErrors(prev => ({ ...prev, displayName: undefined }));
    return true;
  };

  // Ham validate confirm password
  const validateConfirmPassword = (confirmValue: string): boolean => {
    if (!confirmValue) {
      setErrors(prev => ({ ...prev, confirmPassword: 'Vui lòng xác nhận mật khẩu' }));
      return false;
    }
    if (confirmValue !== password) {
      setErrors(prev => ({ ...prev, confirmPassword: 'Mật khẩu xác nhận không khớp' }));
      return false;
    }
    setErrors(prev => ({ ...prev, confirmPassword: undefined }));
    return true;
  };

  const handleRegister = async () => {
    // Reset errors
    setErrors({});
    
    // Validate all fields
    const isDisplayNameValid = validateDisplayName(displayName);
    const isEmailValid = validateEmail(email);
    const isUsernameValid = validateUsername(username);
    const isPasswordValid = validatePassword(password);
    const isConfirmValid = validateConfirmPassword(confirmPassword);
    
    if (!isDisplayNameValid || !isEmailValid || !isUsernameValid || !isPasswordValid || !isConfirmValid) {
      return;
    }

    try {
      setIsLoading(true);
      await api.post('/auth/register', { email, username });
      
      router.push({
        pathname: '/(auth)/verify-otp',
        params: { email, username, password, displayName, flow: 'register' },
      });
    } catch (error: any) {
      const message = error.response?.data?.message || 'Đăng ký thất bại';
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
              title="Đăng ký" 
              showBackButton={true}
            />

            {/* Logo & Welcome */}
            <View style={styles.logoSection}>
              <View style={styles.logoContainer}>
                <Zap size={40} color={colors.accent} strokeWidth={2.5} />
              </View>
              <Text style={styles.welcomeTitle}>Tạo tài khoản mới</Text>
              <Text style={styles.welcomeSubtitle}>
                Tham gia cộng đồng Zync ngay hôm nay
              </Text>
            </View>

            {/* Form */}
            <GlassPanel style={styles.formCard}>
              <Input
                label="Tên hiển thị"
                placeholder="Nhập tên của bạn"
                value={displayName}
                onChangeText={(text) => {
                  setDisplayName(text);
                  if (errors.displayName) validateDisplayName(text);
                }}
                onBlur={() => validateDisplayName(displayName)}
                error={errors.displayName}
              />

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
                label="@Username"
                placeholder="Ví dụ: zync.user"
                value={username}
                onChangeText={(text) => {
                  setUsername(text);
                  if (errors.username) validateUsername(text);
                }}
                onBlur={() => validateUsername(username)}
                autoCapitalize="none"
                error={errors.username}
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

              <Input
                label="Xác nhận mật khẩu"
                placeholder="Nhập lại mật khẩu"
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
                title="Bắt đầu xác thực"
                onPress={handleRegister} 
                isLoading={isLoading}
                style={styles.registerButton} 
              />

              {/* Terms */}
              <Text style={styles.termsText}>
                Bằng việc đăng ký, bạn đồng ý với{' '}
                <Text style={styles.termsLink}>Điều khoản sử dụng</Text>
                {' '}và{' '}
                <Text style={styles.termsLink}>Chính sách bảo mật</Text>
              </Text>
            </GlassPanel>

            {/* Login Link */}
            <View style={styles.loginContainer}>
              <Text style={styles.loginText}>
                Đã có tài khoản? 
              </Text>
              <TouchableOpacity 
                onPress={() => router.push('/(auth)/login')}
                activeOpacity={0.7}
              >
                <Text style={styles.loginLink}>Đăng nhập ngay</Text>
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
  registerButton: {
    marginTop: 8,
    marginBottom: 16,
  },
  termsText: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  termsLink: {
    color: colors.accent,
    fontFamily: 'BeVietnamPro_500Medium',
  },
  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 24,
  },
  loginText: {
    ...typography.body,
    color: colors.textSubtle,
  },
  loginLink: {
    ...typography.body,
    color: colors.accent,
    fontFamily: 'BeVietnamPro_600SemiBold',
    marginLeft: 4,
  },
});
