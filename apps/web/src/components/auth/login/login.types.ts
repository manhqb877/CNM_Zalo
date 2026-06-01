// Module: auth | Component: LoginScreen | Type: types
// Depends: none
export interface LoginFormValues {
  identifier: string;
  username: string;
  displayName: string;
  password: string;
  otp: string;
}

export type AuthMode = 'login' | 'register';
export type AuthStep = 'input' | 'verify';

export interface CommunityMember {
  id: string;
  name: string;
  initials: string;
  tone: string;
}

export interface LoginScreenMockData {
  brand: string;
  headline: [string, string];
  subtitle: string;
  members: CommunityMember[];
  extraMembersLabel: string;
  bottomCaption: string;
  cardTitle: string;
  cardSubtitle: string;
  loginTabLabel: string;
  registerTabLabel: string;
  socialTitle: string;
  registerHint: string;
  loginHint: string;
  loginHintAction: string;
  registerHintAction: string;
  footer: {
    copyright: string;
    links: string[];
    statusLabel: string;
  };
}

export interface LoginScreenProps {
  mockData: LoginScreenMockData;
  mode: AuthMode;
  step: AuthStep;
  isRecoveryFlow: boolean;
  values: LoginFormValues;
  isSubmitting: boolean;
  infoMessage: string | null;
  errorMessage: string | null;
  currentUserName: string | null;
  onModeChange: (mode: AuthMode) => void;
  onStartRecovery: () => void;
  onCancelRecovery: () => void;
  onIdentifierChange: (value: string) => void;
  onUsernameChange: (value: string) => void;
  onDisplayNameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onOtpChange: (value: string) => void;
  onRequestOtp: () => Promise<void>;
  onVerifyOtp: () => Promise<void>;
  onGoogleLogin: () => Promise<void>;
  onBackToInput: () => void;
  onLogout: () => Promise<void>;
  loadingMessage?: string;
  showLoadingModal?: boolean;
  toastMessage?: string | null;
  toastVariant?: 'info' | 'success' | 'error';
  onToastDismiss?: () => void;
}
