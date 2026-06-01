import React, { useState, useRef, useEffect } from 'react';
import { 
  View, 
  StyleSheet, 
  Text, 
  Alert, 
  KeyboardAvoidingView, 
  Platform, 
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Button } from '../../src/ui/Button';
import { GlassPanel } from '../../src/ui/GlassPanel';
import { AuthHeader } from '../../src/components/AuthHeader';
import { colors } from '../../src/theme/colors';
import { typography } from '../../src/theme/fonts';
import api from '../../src/services/api';
import { useAuthStore } from '../../src/store/useAuthStore';
import Constants from 'expo-constants';
import { ShieldCheck, Smartphone } from 'lucide-react-native';
import { getPostAuthRoute } from '../../src/utils/onboarding';

export default function VerifyOtpScreen() {
  const router = useRouter();
  const login = useAuthStore(state => state.login);
  const { email, username, password, displayName, flow } = useLocalSearchParams();
  
  const [otp, setOtp] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [canResend, setCanResend] = useState(false);
  const inputRef = useRef<TextInput>(null);

  // Dem nguoc thoi gian gui lai OTP
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      setCanResend(true);
    }
  }, [countdown]);

  const handleResendOtp = async () => {
    if (!canResend) return;
    
    try {
      setIsLoading(true);
      await api.post('/auth/resend-otp', { email });
      setCountdown(60);
      setCanResend(false);
      Alert.alert('Thành công', 'Mã OTP mới đã được gửi đến email của bạn');
    } catch (error: any) {
      const message = error.response?.data?.message || 'Có lỗi xảy ra';
      Alert.alert('Lỗi', message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!otp || otp.length < 6) {
      Alert.alert('Lỗi', 'Vui lòng nhập đầy đủ mã OTP (6 chữ số)');
      return;
    }

    try {
      setIsLoading(true);
      
      // Lay device push token cho notifications
      let deviceToken = undefined;
      try {
        const isExpoGo = Constants.appOwnership === 'expo';
        if (!isExpoGo) {
          const Notifications = require('expo-notifications');
          const { status } = await Notifications.getPermissionsAsync();
          if (status === 'granted') {
            deviceToken = (await Notifications.getExpoPushTokenAsync()).data;
          }
        }
      } catch (e) {
        console.log('Khong lay duoc device token', e);
      }

      if (flow === 'login') {
        const res = await api.post('/auth/login-password/verify-otp', {
          email,
          password: password,
          otp,
          deviceToken,
          platform: Platform.OS
        });
        
        if (res.data.success) {
          await login(res.data.accessToken, res.data.user, res.data.refreshToken);
          router.replace(getPostAuthRoute(res.data.user));
        }
      } else if (flow === 'register') {
        const res = await api.post('/auth/verify-otp', {
          email,
          username,
          password: password,
          displayName,
          otp,
          deviceToken,
          platform: Platform.OS
        });
        
        if (res.data.success) {
          await login(res.data.accessToken, res.data.user, res.data.refreshToken);
          router.replace(getPostAuthRoute(res.data.user));
        }
      } else if (flow === 'forgot') {
        router.replace({
          pathname: '/(auth)/forgot-password',
          params: { step: 'reset', email, otp }
        });
      }
    } catch (error: any) {
      const message = error.response?.data?.message || 'Mã OTP không hợp lệ hoặc đã hết hạn';
      Alert.alert('Lỗi', message);
    } finally {
      setIsLoading(false);
    }
  };

  const getFlowTitle = () => {
    switch (flow) {
      case 'login':
        return 'Xác thực đăng nhập';
      case 'register':
        return 'Xác thực tài khoản';
      case 'forgot':
        return 'Xác thực khôi phục';
      default:
        return 'Nhập mã OTP';
    }
  };

  const getFlowDescription = () => {
    switch (flow) {
      case 'login':
        return 'Nhập mã OTP đã được gửi đến email của bạn để xác thực đăng nhập';
      case 'register':
        return 'Nhập mã OTP đã được gửi đến email để hoàn tất đăng ký tài khoản';
      case 'forgot':
        return 'Nhập mã OTP để xác thực yêu cầu khôi phục mật khẩu';
      default:
        return 'Mã gồm 6 chữ số đã được gửi tới email của bạn';
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
          <View style={styles.content}>
            {/* Header */}
            <AuthHeader 
              title={getFlowTitle()} 
              showBackButton={true}
            />

            {/* Icon & Description */}
            <View style={styles.logoSection}>
              <View style={styles.logoContainer}>
                <ShieldCheck size={40} color={colors.accent} strokeWidth={2.5} />
              </View>
              <Text style={styles.welcomeTitle}>Nhập mã xác thực</Text>
              <Text style={styles.welcomeSubtitle}>
                {getFlowDescription()}
              </Text>
              <Text style={styles.emailText}>{email}</Text>
            </View>

            {/* OTP Form */}
            <GlassPanel style={styles.formCard}>
              <View style={styles.otpContainer}>
                <Smartphone size={20} color={colors.textSubtle} style={styles.otpIcon} />
                <TextInput
                  ref={inputRef}
                  style={styles.otpInput}
                  placeholder="------"
                  placeholderTextColor={colors.textMuted}
                  value={otp}
                  onChangeText={(text) => {
                    // Chi cho phep nhap so
                    const numericText = text.replace(/[^0-9]/g, '').slice(0, 6);
                    setOtp(numericText);
                  }}
                  keyboardType="numeric"
                  maxLength={6}
                  textAlign="center"
                  autoFocus
                />
              </View>

              <Button 
                title="Xác thực"
                onPress={handleVerify} 
                isLoading={isLoading}
                disabled={otp.length < 6}
                style={styles.verifyButton} 
              />

              {/* Resend OTP */}
              <View style={styles.resendContainer}>
                {canResend ? (
                  <TouchableOpacity 
                    onPress={handleResendOtp}
                    disabled={isLoading}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.resendLink}>Gửi lại mã OTP</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.countdownText}>
                    Gửi lại mã sau {countdown}s
                  </Text>
                )}
              </View>
            </GlassPanel>

            {/* Help Text */}
            <Text style={styles.helpText}>
              Không nhận được mã? Kiểm tra hộp thư spam hoặc nhấn "Gửi lại mã OTP"
            </Text>
          </View>
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
  content: {
    flex: 1,
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
    marginBottom: 8,
  },
  emailText: {
    ...typography.caption,
    color: colors.accent,
    fontFamily: 'BeVietnamPro_600SemiBold',
  },
  formCard: {
    padding: 24,
    marginBottom: 24,
  },
  otpContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.glassPanel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.glassBorderSoft,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 20,
  },
  otpIcon: {
    marginRight: 12,
  },
  otpInput: {
    flex: 1,
    fontSize: 24,
    fontFamily: 'BeVietnamPro_600SemiBold',
    color: colors.text,
    letterSpacing: 8,
    height: 48,
  },
  verifyButton: {
    marginBottom: 16,
  },
  resendContainer: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  resendLink: {
    ...typography.caption,
    color: colors.accent,
    fontFamily: 'BeVietnamPro_600SemiBold',
  },
  countdownText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  helpText: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: 24,
    lineHeight: 20,
  },
});

