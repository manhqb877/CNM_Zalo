import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import Cookies from 'js-cookie';
import { clearAccessToken } from '@/utils/auth-token';

function resolveApiBaseUrl(): string {
  const explicitUrl = process.env['NEXT_PUBLIC_API_URL'];
  if (explicitUrl && typeof window === 'undefined') {
    return explicitUrl;
  }

  if (typeof window !== 'undefined') {
    if (explicitUrl) {
      try {
        const explicit = new URL(explicitUrl);
        const currentHost = window.location.hostname;
        const isExplicitLocal = explicit.hostname === 'localhost' || explicit.hostname === '127.0.0.1';
        const isCurrentLocal = currentHost === 'localhost' || currentHost === '127.0.0.1';

        if (!isExplicitLocal || isCurrentLocal) {
          return explicitUrl;
        }

        const port = explicit.port || '3000';
        return `${window.location.protocol}//${currentHost}:${port}`;
      } catch {
        return explicitUrl;
      }
    }

    return `${window.location.protocol}//${window.location.hostname}:3000`;
  }

  return 'http://localhost:3000';
}

const apiBaseUrl = resolveApiBaseUrl();

const ACCESS_TOKEN_COOKIE_KEY = 'accessToken';
const AUTH_ROUTE = '/auth';

function shouldRedirectToAuth(): boolean {
  if (typeof window === 'undefined') return false;
  return !window.location.pathname.startsWith(AUTH_ROUTE);
}

function handleAuthFailure(): void {
  clearAccessToken();
  if (typeof window === 'undefined') return;
  if (shouldRedirectToAuth()) {
    window.location.replace(AUTH_ROUTE);
  }
}

export const apiClient = axios.create({
  baseURL: apiBaseUrl,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// Attach access token from httpOnly cookie (read via js-cookie)
apiClient.interceptors.request.use((config) => {
  const token = Cookies.get(ACCESS_TOKEN_COOKIE_KEY);
  if (token) config.headers['Authorization'] = `Bearer ${token}`;
  return config;
});

// Auto-refresh on 401
apiClient.interceptors.response.use(
  (res) => res,
  async (error: unknown) => {
    const err = error as AxiosError & { config?: InternalAxiosRequestConfig & { _retry?: boolean } };
    const requestConfig = err.config;
    const isRefreshRequest = requestConfig?.url?.includes('/auth/refresh');

    if (err.response?.status === 401 && isRefreshRequest) {
      handleAuthFailure();
      return Promise.reject(error);
    }

    if (err.response?.status === 401 && !requestConfig?._retry) {
      if (requestConfig) requestConfig._retry = true;
      try {
        const { data } = await axios.post<{ accessToken: string }>(
          `${apiBaseUrl}/api/auth/refresh`,
          {},
          { withCredentials: true },
        );
        // Set the client-readable access token cookie.
        // Note: js-cookie does NOT support httpOnly (it's browser-only). Use 'expires' (Date) instead of 'maxAge'.
        const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
        Cookies.set(ACCESS_TOKEN_COOKIE_KEY, data.accessToken, {
          secure: window.location.protocol === 'https:',
          sameSite: 'Lax',
          expires,
        });

        // Update socket auth token so reconnects use the new token
        try {
          const { updateSocketToken } = await import('@/services/socket');
          updateSocketToken(data.accessToken);
        } catch {
          // socket module may not be loaded yet – ignore
        }

        return apiClient(requestConfig ?? { url: '/' });
      } catch {
        handleAuthFailure();
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  },
);

