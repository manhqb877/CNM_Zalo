/**
 * Auth token utilities – reads from httpOnly cookie set by server.
 * Access token is stored in httpOnly cookie 'accessToken'.
 * A non-httpOnly side-channel cookie 'accessToken_client' is also set
 * so that the Socket.IO client can read it (httpOnly cookies are invisible to JS).
 * This file provides client-side read access.
 */
import Cookies from 'js-cookie';

const ACCESS_TOKEN_COOKIE_KEY = 'accessToken';
// Non-httpOnly side-channel for Socket.IO client (can be read by JS)
const ACCESS_TOKEN_CLIENT_COOKIE_KEY = 'accessToken_client';

/**
 * Lay access token hien tai tu httpOnly cookie hoac side-channel cookie.
 * Tra ve null neu chua dang nhap hoac cookie da het han.
 */
export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  // Prefer the httpOnly cookie if available (same value, just for consistency),
  // fall back to the client-readable side-channel.
  return Cookies.get(ACCESS_TOKEN_COOKIE_KEY) ?? Cookies.get(ACCESS_TOKEN_CLIENT_COOKIE_KEY) ?? null;
}

/**
 * Xoa access token cookie (goi khi logout).
 */
export function clearAccessToken(): void {
  Cookies.remove(ACCESS_TOKEN_COOKIE_KEY);
  Cookies.remove(ACCESS_TOKEN_CLIENT_COOKIE_KEY);
  Cookies.remove('refreshToken');
}
