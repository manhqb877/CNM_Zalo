import { apiClient } from './api';

interface RegisterResponse {
  success: boolean;
  message: string;
}

interface VerifyOtpResponse {
  success: boolean;
  accessToken: string;
  user: {
    id: string;
    username?: string;
    displayName: string;
    email?: string;
    avatarUrl?: string;
    onboardingCompleted?: boolean;
  };
}

export async function requestOtp(payload: {
  email: string;
  username: string;
}): Promise<RegisterResponse> {
  const { data } = await apiClient.post<RegisterResponse>('/api/auth/register', {
    email: payload.email,
    username: payload.username,
  });
  return data;
}

export async function verifyOtp(payload: {
  email: string;
  username: string;
  otp: string;
  displayName?: string;
  password?: string;
  deviceToken?: string;
  platform?: 'web';
}): Promise<VerifyOtpResponse> {
  const { data } = await apiClient.post<VerifyOtpResponse>('/api/auth/verify-otp', payload);
  return data;
}

export async function requestPasswordOtp(payload: {
  email: string;
  password: string;
}): Promise<RegisterResponse> {
  const { data } = await apiClient.post<RegisterResponse>('/api/auth/login-password/request-otp', payload);
  return data;
}

export async function verifyPasswordOtp(payload: {
  email: string;
  password: string;
  otp: string;
  deviceToken?: string;
  platform?: 'web';
}): Promise<VerifyOtpResponse> {
  const { data } = await apiClient.post<VerifyOtpResponse>('/api/auth/login-password/verify-otp', payload);
  return data;
}

export async function requestForgotPasswordOtp(payload: {
  email: string;
}): Promise<RegisterResponse> {
  const { data } = await apiClient.post<RegisterResponse>('/api/auth/forgot-password/request-otp', payload);
  return data;
}

export async function resetForgotPassword(payload: {
  email: string;
  otp: string;
  newPassword: string;
}): Promise<RegisterResponse> {
  const { data } = await apiClient.post<RegisterResponse>('/api/auth/forgot-password/reset', payload);
  return data;
}

export async function loginWithGoogle(payload: {
  idToken: string;
  deviceToken?: string;
  platform?: 'web';
}): Promise<VerifyOtpResponse> {
  const { data } = await apiClient.post<VerifyOtpResponse>('/api/auth/google', payload);
  return data;
}

export async function logout(payload: { deviceToken?: string }): Promise<void> {
  await apiClient.post('/api/auth/logout', payload);
}

export async function changePassword(payload: {
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
}): Promise<{ success: boolean; message: string }> {
  const { data } = await apiClient.post<{ success: boolean; message: string }>('/api/auth/change-password', payload);
  return data;
}
