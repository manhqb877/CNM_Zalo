// Module: auth | Component: LoginScreen | Type: presentational
// Depends: login.types
'use client';

import Link from 'next/link';

import type { LoginScreenProps } from './login.types';
import { LoginCard } from './organisms/login-card';
import { LoginHero } from './organisms/login-hero';
import { LoginLoadingModal } from './atoms/login-loading-modal';
import { LoginSubmitToast } from './atoms/login-submit-toast';
import { ZyncLogo } from '@/components/shared/zync-logo';

export function LoginScreen({
  mockData,
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
  loadingMessage,
  showLoadingModal,
  toastMessage,
  toastVariant,
  onToastDismiss,
}: LoginScreenProps) {
  return (
    <main className="zync-auth-shell relative min-h-screen overflow-hidden text-text-primary">
      <div className="absolute inset-x-0 top-0 h-[560px] bg-[linear-gradient(180deg,var(--accent-soft)_0%,var(--bg-primary)_76%,transparent_100%)]" aria-hidden />
      <div className="absolute inset-0 bg-[linear-gradient(var(--accent-soft)_1px,transparent_1px),linear-gradient(90deg,var(--accent-soft)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:linear-gradient(180deg,black,transparent_72%)]" aria-hidden />

      <header className="relative z-20">
        <div className="zync-page-container flex items-center justify-between py-5">
          <Link href="/" aria-label="Về trang chủ ZYNC">
            <ZyncLogo size="sm" />
          </Link>
          <Link href="/" className="rounded-full border border-border-soft bg-[var(--surface-glass)] px-4 py-2 text-sm font-bold text-text-secondary shadow-sm backdrop-blur transition hover:border-border-strong hover:text-accent">
            Trang chủ
          </Link>
        </div>
      </header>

      <div className="zync-page-container relative z-10 grid min-h-[calc(100vh-5.5rem)] items-center gap-10 pb-10 lg:grid-cols-[1fr_440px] lg:gap-16">
        <LoginHero data={mockData} />

        <div className="zync-reveal-up zync-reveal-delay-1">
          <LoginCard
            title={mockData.cardTitle}
            subtitle={mockData.cardSubtitle}
            mode={mode}
            step={step}
            isRecoveryFlow={isRecoveryFlow}
            values={values}
            isSubmitting={isSubmitting}
            infoMessage={infoMessage}
            errorMessage={errorMessage}
            currentUserName={currentUserName}
            onModeChange={onModeChange}
            onStartRecovery={onStartRecovery}
            onCancelRecovery={onCancelRecovery}
            onIdentifierChange={onIdentifierChange}
            onUsernameChange={onUsernameChange}
            onDisplayNameChange={onDisplayNameChange}
            onPasswordChange={onPasswordChange}
            onOtpChange={onOtpChange}
            onRequestOtp={onRequestOtp}
            onVerifyOtp={onVerifyOtp}
            onGoogleLogin={onGoogleLogin}
            onBackToInput={onBackToInput}
            onLogout={onLogout}
            loginTabLabel={mockData.loginTabLabel}
            registerTabLabel={mockData.registerTabLabel}
            socialTitle={mockData.socialTitle}
            registerHint={mockData.registerHint}
            loginHint={mockData.loginHint}
            loginHintAction={mockData.loginHintAction}
            registerHintAction={mockData.registerHintAction}
          />
        </div>
      </div>

      <LoginSubmitToast
        message={toastMessage ?? null}
        variant={toastVariant ?? 'info'}
        onDismiss={onToastDismiss ?? (() => {})}
      />
      <LoginLoadingModal open={Boolean(showLoadingModal)} message={loadingMessage} />
    </main>
  );
}
