'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LoginScreen } from '@/components/auth/login/login-screen';
import { LOGIN_SCREEN_MOCK_DATA } from '@/components/auth/login/mockData';
import { useLoginForm } from '@/hooks/use-login-form';
import { PageLoading } from '@/components/shared/page-loading';
import { profileStore } from '@/stores/profile-store';
import { clearAccessToken, getAccessToken } from '@/utils/auth-token';

type BootstrapPhase = 'checking' | 'ready' | 'error';

function AuthPageContent() {
  const loginForm = useLoginForm();
  return <LoginScreen {...loginForm} mockData={LOGIN_SCREEN_MOCK_DATA} />;
}

export default function AuthPage() {
  const router = useRouter();
  const [bootstrapPhase, setBootstrapPhase] = useState<BootstrapPhase>('checking');
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const runBootstrap = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      if (!isMountedRef.current) return;
      setBootstrapError(null);
      setBootstrapPhase('ready');
      return;
    }

    setBootstrapError(null);
    setBootstrapPhase('checking');
    await profileStore.load(true);

    if (!isMountedRef.current) return;

    if (profileStore.profile) {
      router.replace('/home');
      return;
    }

    if (profileStore.error) {
      setBootstrapError(profileStore.error);
      setBootstrapPhase('error');
      return;
    }

    setBootstrapPhase('ready');
  }, [router]);

  useEffect(() => {
    void runBootstrap();
  }, [runBootstrap]);

  const handleRetry = () => {
    void runBootstrap();
  };

  const handleContinueLogin = () => {
    clearAccessToken();
    profileStore.reset();
    setBootstrapError(null);
    setBootstrapPhase('ready');
  };

  if (bootstrapPhase === 'checking') {
    return (
      <PageLoading
        mode="page"
        message="Đang kiểm tra phiên đăng nhập..."
        description="Vui lòng chờ trong giây lát."
      />
    );
  }

  if (bootstrapPhase === 'error') {
    return (
      <main className="zync-page-shell flex min-h-screen items-center justify-center px-4 py-8 text-text-primary">
        <div className="zync-soft-card zync-soft-card-elevated w-full max-w-md rounded-[2rem] p-6 text-center">
          <h1 className="font-ui-title text-xl text-text-primary">Không thể kiểm tra phiên đăng nhập</h1>
          <p className="font-ui-content mt-2 text-sm text-text-secondary">
            {bootstrapError ?? 'Không thể tải hồ sơ người dùng. Vui lòng thử lại.'}
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button type="button" onClick={handleRetry} className="zync-soft-button inline-flex justify-center">
              Thử lại
            </button>
            <button type="button" onClick={handleContinueLogin} className="zync-soft-button-secondary inline-flex justify-center">
              Tiếp tục đăng nhập
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <Suspense fallback={<PageLoading minDurationMs={650} />}>
      <AuthPageContent />
    </Suspense>
  );
}
