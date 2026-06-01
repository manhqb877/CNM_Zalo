'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import type {
  AuthMode,
  AuthStep,
  LoginFormValues,
} from '@/components/auth/login/login.types';
import {
  loginWithGoogle,
  logout,
  requestForgotPasswordOtp,
  requestOtp,
  requestPasswordOtp,
  resetForgotPassword,
  verifyOtp,
  verifyPasswordOtp,
} from '@/services/auth';
import { clearAccessToken } from '@/utils/auth-token';

const DEFAULT_FORM: LoginFormValues = {
  identifier: '',
  username: '',
  displayName: '',
  password: '',
  otp: '',
};

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
          }) => void;
          prompt: () => void;
        };
      };
    };
  }
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeUsername(value: string): string {
  return value.trim().replace(/^@/, '').toLowerCase();
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim().toLowerCase());
}

function isValidUsername(value: string): boolean {
  return /^[a-z0-9._]{3,30}$/.test(normalizeUsername(value));
}

function resolveDeviceToken(): string {
  if (typeof window === 'undefined') {
    return 'web-device';
  }

  const store = window.localStorage;
  const key = 'zync_web_device_token';
  const existing = store.getItem(key);
  if (existing) {
    return existing;
  }

  const generated = `web-${Math.random().toString(36).slice(2, 12)}`;
  store.setItem(key, generated);
  return generated;
}

export function useLoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>('login');
  const [step, setStep] = useState<AuthStep>('input');
  const [isRecoveryFlow, setIsRecoveryFlow] = useState(false);
  const [pendingIdentifier, setPendingIdentifier] = useState<string | null>(null);
  const [values, setValues] = useState<LoginFormValues>(DEFAULT_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);

  // Toast state
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVariant, setToastVariant] = useState<'info' | 'success' | 'error'>('info');
  const [showLoadingModal, setShowLoadingModal] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Đang xử lý...');

  const showToast = (message: string, variant: 'info' | 'success' | 'error' = 'info') => {
    setToastMessage(message);
    setToastVariant(variant);
  };

  const dismissToast = () => {
    setToastMessage(null);
  };

  const showModal = (message: string) => {
    setLoadingMessage(message);
    setShowLoadingModal(true);
  };

  const hideModal = () => {
    setShowLoadingModal(false);
  };

  const canRequestOtp = useMemo(() => {
    const hasMinimumIdentifierLength = values.identifier.trim().length >= 5;
    const hasUsername = mode === 'register' ? isValidUsername(values.username) : true;
    const hasDisplayName = mode === 'register' ? values.displayName.trim().length >= 1 : true;
    const hasPassword = mode !== 'register' && isRecoveryFlow
      ? true
      : values.password.trim().length >= 8;
    const hasValidIdentifier = isEmail(values.identifier);

    return hasMinimumIdentifierLength && hasUsername && hasDisplayName && hasPassword && hasValidIdentifier;
  }, [isRecoveryFlow, mode, values.displayName, values.identifier, values.password, values.username]);

  const canVerifyOtp = useMemo(() => {
    const hasOtp = /^\d{6}$/.test(values.otp.trim());
    if (!hasOtp) {
      return false;
    }

    if (isRecoveryFlow) {
      return values.password.trim().length >= 8;
    }

    return true;
  }, [isRecoveryFlow, values.otp, values.password]);

  useEffect(() => {
    if (typeof window === 'undefined' || window.google) {
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);

    return () => {
      document.head.removeChild(script);
    };
  }, []);

  const onModeChange = (nextMode: AuthMode) => {
    setMode(nextMode);
    setIsRecoveryFlow(false);
    setPendingIdentifier(null);
    setStep('input');
    setValues((prev) => ({ ...prev, otp: '' }));
    setErrorMessage(null);
    setInfoMessage(null);
  };

  const onStartRecovery = () => {
    setMode('login');
    setIsRecoveryFlow(true);
    setPendingIdentifier(null);
    setStep('input');
    setValues((prev) => ({ ...prev, otp: '' }));
    setErrorMessage(null);
    setInfoMessage(null);
  };

  const onCancelRecovery = () => {
    setIsRecoveryFlow(false);
    setPendingIdentifier(null);
    setStep('input');
    setValues((prev) => ({ ...prev, otp: '' }));
    setErrorMessage(null);
    setInfoMessage(null);
  };

  const onIdentifierChange = (value: string) => {
    setValues((prev) => ({ ...prev, identifier: value }));
    setErrorMessage(null);
  };

  const onDisplayNameChange = (value: string) => {
    setValues((prev) => ({ ...prev, displayName: value }));
    setErrorMessage(null);
  };

  const onUsernameChange = (value: string) => {
    setValues((prev) => ({ ...prev, username: value }));
    setErrorMessage(null);
  };

  const onPasswordChange = (value: string) => {
    setValues((prev) => ({ ...prev, password: value }));
    setErrorMessage(null);
  };

  const onOtpChange = (value: string) => {
    const compact = value.replace(/\D/g, '').slice(0, 6);
    setValues((prev) => ({ ...prev, otp: compact }));
    setErrorMessage(null);
  };

  const onBackToInput = () => {
    setPendingIdentifier(null);
    setStep('input');
    setValues((prev) => ({ ...prev, otp: '' }));
    setErrorMessage(null);
    setInfoMessage(null);
  };

  const onRequestOtp = async () => {
    if (!canRequestOtp || isSubmitting) {
      setErrorMessage('Vui lòng nhập đầy đủ thông tin hợp lệ.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      const email = normalizeEmail(values.identifier);

      showModal('Đang gửi mã OTP...');

      if (mode === 'register') {
        await requestOtp({
          email,
          username: normalizeUsername(values.username),
        });
      } else if (isRecoveryFlow) {
        await requestForgotPasswordOtp({
          email,
        });
      } else {
        await requestPasswordOtp({
          email,
          password: values.password,
        });
      }

      hideModal();
      setStep('verify');
      setPendingIdentifier(email);
      setInfoMessage(
        isRecoveryFlow
          ? 'Mã OTP khôi phục đã được gửi. Vui lòng kiểm tra email của bạn.'
          : 'Mã OTP đã được gửi. Vui lòng kiểm tra email của bạn.',
      );
      setValues((prev) => ({ ...prev, identifier: email, otp: '' }));
    } catch (error: unknown) {
      hideModal();
      const fallbackMessage = 'Không thể gửi OTP. Vui lòng thử lại.';
      const message =
        typeof error === 'object' &&
        error !== null &&
        'response' in error &&
        typeof (error as { response?: { data?: { error?: string } } }).response?.data?.error === 'string'
          ? (error as { response: { data: { error: string } } }).response.data.error
          : fallbackMessage;
      showToast(message, 'error');
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const onVerifyOtp = async () => {
    if (!canVerifyOtp || isSubmitting) {
      setErrorMessage('Vui lòng nhập mã OTP gồm 6 chữ số.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      const verifyEmail = pendingIdentifier ?? normalizeEmail(values.identifier);

      showModal('Đang xác thực...');

      if (isRecoveryFlow) {
        await resetForgotPassword({
          email: verifyEmail,
          otp: values.otp,
          newPassword: values.password,
        });

        hideModal();
        setIsRecoveryFlow(false);
        setPendingIdentifier(null);
        setStep('input');
        setValues((prev) => ({ ...prev, otp: '' }));
        showToast('Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại bằng mật khẩu mới.', 'success');
        setInfoMessage('Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại bằng mật khẩu mới.');
        setErrorMessage(null);
        return;
      }

      const deviceToken = resolveDeviceToken();
      const response = mode === 'login'
        ? await verifyPasswordOtp({
            email: verifyEmail,
            password: values.password,
            otp: values.otp,
            deviceToken,
            platform: 'web',
          })
        : await verifyOtp({
            email: verifyEmail,
            username: normalizeUsername(values.username),
            otp: values.otp,
            displayName: values.displayName.trim(),
            password: values.password,
            deviceToken,
            platform: 'web',
          });

      hideModal();
      setCurrentUserName(response.user.displayName);
      showToast('Xác thực thành công! Đang chuyển hướng...', 'success');
      setInfoMessage('Xác thực thành công. Bạn đã đăng nhập vào hệ thống.');
      setErrorMessage(null);

      if (!response.user.onboardingCompleted) {
        router.push('/onboarding');
      } else {
        router.push('/home');
      }
    } catch (error: unknown) {
      hideModal();
      const fallbackMessage = 'Xác thực OTP thất bại. Vui lòng thử lại.';
      const message =
        typeof error === 'object' &&
        error !== null &&
        'response' in error &&
        typeof (error as { response?: { data?: { error?: string } } }).response?.data?.error === 'string'
          ? (error as { response: { data: { error: string } } }).response.data.error
          : fallbackMessage;
      if (message === 'Invalid or expired OTP' || message.includes('OTP không hợp lệ')) {
        showToast('OTP không hợp lệ hoặc đã hết hạn. Hãy bấm "Đổi thông tin" và gửi lại OTP mới.', 'error');
        setErrorMessage('OTP không hợp lệ hoặc đã hết hạn. Hãy bấm "Đổi thông tin" và gửi lại OTP mới.');
      } else {
        showToast(message, 'error');
        setErrorMessage(message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const onGoogleLogin = async () => {
    if (isSubmitting) {
      return;
    }

    const clientId = process.env['NEXT_PUBLIC_GOOGLE_CLIENT_ID'];
    if (!clientId) {
      showToast('Thiếu cấu hình NEXT_PUBLIC_GOOGLE_CLIENT_ID cho đăng nhập Google.', 'error');
      setErrorMessage('Thiếu cấu hình NEXT_PUBLIC_GOOGLE_CLIENT_ID cho đăng nhập Google.');
      return;
    }

    if (typeof window === 'undefined' || !window.google?.accounts?.id) {
      showToast('Google Identity chưa sẵn sàng. Vui lòng thử lại sau vài giây.', 'error');
      setErrorMessage('Google Identity chưa sẵn sàng. Vui lòng thử lại sau vài giây.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      showModal('Đang đăng nhập Google...');

      const credential = await new Promise<string>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          reject(new Error('TIMEOUT'));
        }, 15000);

        window.google?.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            window.clearTimeout(timeout);
            if (!response.credential) {
              reject(new Error('NO_CREDENTIAL'));
              return;
            }
            resolve(response.credential);
          },
        });

        window.google?.accounts.id.prompt();
      });

      const deviceToken = resolveDeviceToken();
      const response = await loginWithGoogle({
        idToken: credential,
        deviceToken,
        platform: 'web',
      });

      hideModal();
      setCurrentUserName(response.user.displayName);
      showToast('Đăng nhập Google thành công!', 'success');

      if (!response.user.onboardingCompleted) {
        router.push('/onboarding');
      } else {
        router.push('/home');
      }
    } catch (error: unknown) {
      hideModal();
      if (
        typeof error === 'object' &&
        error !== null &&
        'response' in error &&
        typeof (error as { response?: { data?: { code?: string } } }).response?.data?.code === 'string'
      ) {
        const code = (error as { response: { data: { code: string } } }).response.data.code;
        if (code === 'GOOGLE_TOKEN_INVALID') {
          showToast('Token Google không hợp lệ hoặc đã hết hạn. Vui lòng thử đăng nhập lại.', 'error');
          setErrorMessage('Token Google không hợp lệ hoặc đã hết hạn. Vui lòng thử đăng nhập lại.');
        } else if (code === 'GOOGLE_EMAIL_NOT_VERIFIED') {
          showToast('Email Google chưa được xác minh. Vui lòng xác minh email trong tài khoản Google trước.', 'error');
          setErrorMessage('Email Google chưa được xác minh. Vui lòng xác minh email trong tài khoản Google trước.');
        } else if (code === 'GOOGLE_CLIENT_NOT_CONFIGURED') {
          showToast('Dịch vụ đăng nhập Google đang gặp sự cố. Vui lòng thử lại sau.', 'error');
          setErrorMessage('Dịch vụ đăng nhập Google đang gặp sự cố. Vui lòng thử lại sau.');
        } else if (code === 'ACCOUNT_EXISTS_WITH_PASSWORD') {
          showToast('Tài khoản đã tồn tại với email này. Vui lòng đăng nhập bằng email + mật khẩu + OTP.', 'error');
          setErrorMessage('Tài khoản đã tồn tại với email này. Vui lòng đăng nhập bằng email + mật khẩu + OTP.');
        } else {
          showToast('Đăng nhập Google thất bại. Vui lòng thử lại.', 'error');
          setErrorMessage('Đăng nhập Google thất bại. Vui lòng thử lại.');
        }
      } else if (
        typeof error === 'object' &&
        error !== null &&
        'message' in error &&
        (error as { message?: string }).message === 'TIMEOUT'
      ) {
        showToast('Yêu cầu đăng nhập Google bị gián đoạn. Vui lòng thử lại.', 'error');
        setErrorMessage('Yêu cầu đăng nhập Google bị gián đoạn. Vui lòng thử lại.');
      } else if (
        typeof error === 'object' &&
        error !== null &&
        'message' in error &&
        (error as { message?: string }).message === 'NO_CREDENTIAL'
      ) {
        showToast('Không nhận được phản hồi từ Google. Vui lòng thử lại.', 'error');
        setErrorMessage('Không nhận được phản hồi từ Google. Vui lòng thử lại.');
      } else {
        showToast('Đăng nhập Google thất bại. Vui lòng thử lại.', 'error');
        setErrorMessage('Đăng nhập Google thất bại. Vui lòng thử lại.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const onLogout = async () => {
    try {
      setIsSubmitting(true);
      const deviceToken = resolveDeviceToken();
      showModal('Đang đăng xuất...');
      await logout({ deviceToken });
      clearAccessToken();
      hideModal();
      setCurrentUserName(null);
      setPendingIdentifier(null);
      setStep('input');
      setValues((prev) => ({ ...prev, otp: '' }));
      showToast('Bạn đã đăng xuất khỏi hệ thống.', 'success');
      setInfoMessage('Bạn đã đăng xuất khỏi hệ thống.');
      setErrorMessage(null);
      router.push('/auth');
    } catch {
      hideModal();
      setErrorMessage('Đăng xuất thất bại. Vui lòng thử lại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    mode,
    step,
    isRecoveryFlow,
    values,
    isSubmitting,
    infoMessage,
    errorMessage,
    currentUserName,
    onModeChange,
    onStartRecovery,
    onCancelRecovery,
    onIdentifierChange,
    onUsernameChange,
    onDisplayNameChange,
    onPasswordChange,
    onOtpChange,
    onRequestOtp,
    onVerifyOtp,
    onGoogleLogin,
    onBackToInput,
    onLogout,
    toastMessage,
    toastVariant,
    onToastDismiss: dismissToast,
    showLoadingModal,
    loadingMessage,
  };
}
