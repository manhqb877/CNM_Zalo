import { CheckCircle2, KeyRound } from 'lucide-react';

import type { LoginScreenProps } from '../login.types';
import { FormField } from '../atoms/form-field';
import { PrimaryButton } from '../atoms/primary-button';
import { SocialButton } from '../atoms/social-button';

interface LoginCardProps extends Pick<
  LoginScreenProps,
  | 'mode'
  | 'step'
  | 'isRecoveryFlow'
  | 'values'
  | 'isSubmitting'
  | 'infoMessage'
  | 'errorMessage'
  | 'currentUserName'
  | 'onModeChange'
  | 'onStartRecovery'
  | 'onCancelRecovery'
  | 'onIdentifierChange'
  | 'onUsernameChange'
  | 'onDisplayNameChange'
  | 'onPasswordChange'
  | 'onOtpChange'
  | 'onRequestOtp'
  | 'onVerifyOtp'
  | 'onGoogleLogin'
  | 'onBackToInput'
  | 'onLogout'
> {
  title: string;
  subtitle: string;
  loginTabLabel: string;
  registerTabLabel: string;
  socialTitle: string;
  registerHint: string;
  loginHint: string;
  loginHintAction: string;
  registerHintAction: string;
}

export function LoginCard({
  title,
  subtitle,
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
  loginTabLabel,
  registerTabLabel,
  socialTitle,
  registerHint,
  loginHint,
  loginHintAction,
  registerHintAction,
}: LoginCardProps) {
  const isRegister = mode === 'register';
  const isVerifyStep = step === 'verify';
  const isLogin = mode === 'login';
  const isPasswordOtpLogin = isLogin && !isRecoveryFlow;

  const submitLabel = isVerifyStep
    ? isRecoveryFlow
      ? 'Đặt lại mật khẩu'
      : 'Xác thực OTP'
    : isRegister
      ? 'Gửi OTP đăng ký'
      : isRecoveryFlow
        ? 'Gửi OTP khôi phục'
        : 'Gửi OTP đăng nhập';

  const displayTitle = isVerifyStep
    ? isRecoveryFlow
      ? 'Xác minh khôi phục'
      : 'Nhập mã OTP'
    : isRecoveryFlow
      ? 'Khôi phục mật khẩu'
      : isRegister
        ? 'Tạo tài khoản ZYNC'
        : title;

  const displaySubtitle = isVerifyStep
    ? 'Nhập mã 6 chữ số đã được gửi về email để tiếp tục.'
    : isRecoveryFlow
      ? 'Nhập email tài khoản, ZYNC sẽ gửi OTP để đặt lại mật khẩu.'
      : isRegister
        ? 'Tạo hồ sơ developer và xác thực email bằng OTP.'
        : subtitle;

  const onSubmit = async () => {
    if (isVerifyStep) {
      await onVerifyOtp();
      return;
    }
    await onRequestOtp();
  };

  return (
    <section className="zync-soft-card zync-soft-card-elevated relative z-10 w-full rounded-[var(--radius-card)] p-5 backdrop-blur-xl sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-[var(--accent-soft)] px-3 py-1.5 text-xs font-black uppercase tracking-[0.14em] text-accent-strong">
            <KeyRound size={14} aria-hidden />
            OTP secure
          </p>
          <h2 className="font-ui-title mt-4 text-[clamp(1.8rem,3vw,2.35rem)] leading-tight text-text-primary">
            {displayTitle}
          </h2>
          <p className="font-ui-content mt-2 text-sm leading-6 text-text-secondary">
            {displaySubtitle}
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 rounded-full border border-border-soft bg-[var(--surface-muted)] p-1">
        <button
          type="button"
          onClick={() => onModeChange('login')}
          className={`rounded-full px-4 py-2.5 text-sm font-black transition ${
            mode === 'login' && !isRecoveryFlow
              ? 'bg-[var(--surface)] text-text-primary shadow-sm'
              : 'text-text-tertiary hover:text-accent'
          }`}
          aria-pressed={mode === 'login' && !isRecoveryFlow}
        >
          {loginTabLabel}
        </button>
        <button
          type="button"
          onClick={() => onModeChange('register')}
          className={`rounded-full px-4 py-2.5 text-sm font-black transition ${
            mode === 'register'
              ? 'bg-[var(--surface)] text-text-primary shadow-sm'
              : 'text-text-tertiary hover:text-accent'
          }`}
          aria-pressed={mode === 'register'}
        >
          {registerTabLabel}
        </button>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2 text-xs font-bold text-slate-500">
        <StepPill active={!isVerifyStep} done={isVerifyStep} label="Thông tin" />
        <StepPill active={isVerifyStep} label="OTP" />
      </div>

      <form
        className="mt-6 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void onSubmit();
        }}
      >
        <FormField
          label="Email đăng nhập"
          type="text"
          placeholder="name@company.com"
          value={values.identifier}
          disabled={isVerifyStep}
          onChange={onIdentifierChange}
        />

        {isRegister && !isVerifyStep ? (
          <FormField
            label="@Username"
            type="text"
            placeholder="zync.dev"
            value={values.username}
            onChange={onUsernameChange}
          />
        ) : null}

        {isRegister && !isVerifyStep ? (
          <FormField
            label="Tên hiển thị"
            type="text"
            placeholder="Tên developer của bạn"
            value={values.displayName}
            onChange={onDisplayNameChange}
          />
        ) : null}

        {isRegister || isPasswordOtpLogin || (isRecoveryFlow && isVerifyStep) ? (
          <FormField
            label={isRecoveryFlow && isVerifyStep ? 'Mật khẩu mới' : 'Mật khẩu'}
            type="password"
            placeholder="Tối thiểu 8 ký tự"
            value={values.password}
            onChange={onPasswordChange}
          />
        ) : null}

        {isVerifyStep ? (
          <FormField
            label="Mã OTP"
            type="text"
            placeholder="Nhập 6 chữ số"
            value={values.otp}
            onChange={onOtpChange}
            rightNode={
              <button
                type="button"
                onClick={onBackToInput}
                className="text-xs font-black text-accent transition hover:text-accent-strong"
              >
                {isRecoveryFlow ? 'Hủy khôi phục' : 'Đổi thông tin'}
              </button>
            }
          />
        ) : null}

        {isLogin && !isVerifyStep ? (
          <button
            type="button"
            onClick={isRecoveryFlow ? onCancelRecovery : onStartRecovery}
            className="text-sm font-bold text-accent transition hover:text-accent-strong"
          >
            {isRecoveryFlow ? 'Quay lại đăng nhập' : 'Quên mật khẩu?'}
          </button>
        ) : null}

        {infoMessage ? (
          <p className="rounded-2xl border border-[var(--success-border)] bg-[var(--success-bg)] px-4 py-3 text-sm font-semibold leading-6 text-[var(--success-text)]">
            {infoMessage}
          </p>
        ) : null}

        {errorMessage ? (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold leading-6 text-red-700">
            {errorMessage}
          </p>
        ) : null}

        <PrimaryButton isSubmitting={isSubmitting} label={submitLabel} />

        {currentUserName ? (
          <div className="space-y-3 rounded-3xl border border-border-soft bg-[var(--accent-soft)] p-4">
            <p className="text-sm font-semibold leading-6 text-accent-strong">
              Đang đăng nhập với tài khoản <span className="font-black">{currentUserName}</span>.
            </p>
            <button
              type="button"
              onClick={() => {
                void onLogout();
              }}
              className="min-h-10 w-full rounded-full border border-border-soft bg-[var(--surface)] text-sm font-black text-accent transition hover:bg-[var(--accent-soft)]"
            >
              Đăng xuất
            </button>
          </div>
        ) : null}
      </form>

      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-slate-200" />
        <span className="text-[11px] font-black uppercase tracking-[0.13em] text-slate-400">
          {socialTitle}
        </span>
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      <SocialButton label="Google" onClick={onGoogleLogin} disabled={isSubmitting} />

      <p className="font-ui-content mt-6 text-center text-sm font-semibold text-slate-600">
        {isRegister ? loginHint : registerHint}{' '}
        <button
          type="button"
          onClick={() => onModeChange(isRegister ? 'login' : 'register')}
          className="font-black text-accent transition hover:text-accent-strong"
        >
          {isRegister ? loginHintAction : registerHintAction}
        </button>
      </p>
    </section>
  );
}

function StepPill({ active, done, label }: { active: boolean; done?: boolean; label: string }) {
  return (
    <div
      className={`flex items-center justify-center gap-2 rounded-full px-3 py-2 ${
        active || done ? 'bg-[var(--accent-soft)] text-accent' : 'bg-[var(--surface-muted)] text-text-tertiary'
      }`}
    >
      {done ? <CheckCircle2 size={14} aria-hidden /> : <span className={`h-2 w-2 rounded-full ${active ? 'bg-accent' : 'bg-border'}`} />}
      {label}
    </div>
  );
}
