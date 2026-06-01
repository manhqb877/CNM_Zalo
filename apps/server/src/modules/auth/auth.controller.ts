import { type Request, type Response, type NextFunction } from 'express';
import {
  register,
  verifyOtpAndLogin,
  requestLoginOtpWithPassword,
  verifyLoginWithPasswordAndOtp,
  requestForgotPasswordOtp,
  resetForgotPassword,
  changePassword,
  loginWithGoogle,
  refreshAccessToken,
  logout,
} from './auth.service';
import { type AuthRequest } from '../../shared/middleware/auth.middleware';
import { logger } from '../../shared/logger';

const REFRESH_TOKEN_COOKIE = 'refreshToken';
const ACCESS_TOKEN_COOKIE = 'accessToken';
const ACCESS_TOKEN_CLIENT_COOKIE = 'accessToken_client'; // non-httpOnly side-channel for Socket.IO client
const REFRESH_TOKEN_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 ngày (ms)

/**
 * Resolve cookie SameSite attribute based on environment.
 * - Development: 'strict' (same-origin only, safest for localhost)
 * - Production: configurable via COOKIE_SAME_SITE env, default 'lax'
 *   Use 'none' when API domain ≠ web domain (cross-site), requires secure=true
 *   Use 'lax' when API and web share the same site (e.g. api.zync.io + app.zync.io)
 */
function resolveCookieSameSite(): 'strict' | 'lax' | 'none' {
  if (process.env['NODE_ENV'] !== 'production') return 'strict';
  const configured = process.env['COOKIE_SAME_SITE'];
  if (configured === 'none') return 'none';
  if (configured === 'strict') return 'strict';
  return 'lax';
}

function cookieSecure(): boolean {
  // Must be true when sameSite is 'none', and generally true in production
  return process.env['NODE_ENV'] === 'production';
}

function setAccessTokenCookie(res: Response, accessToken: string): void {
  const sameSite = resolveCookieSameSite();
  const secure = cookieSecure();

  // httpOnly cookie for REST API auth (cannot be read by JS)
  res.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    secure,
    sameSite,
    path: '/',
    maxAge: 15 * 60 * 1000, // 15 phút, matching ACCESS_TOKEN_TTL
  });

  // non-httpOnly side-channel cookie so Socket.IO client can read the token.
  // accessToken is short-lived (15m) so this is acceptable for Socket.IO only.
  res.cookie(ACCESS_TOKEN_CLIENT_COOKIE, accessToken, {
    httpOnly: false,
    secure,
    sameSite,
    path: '/',
    maxAge: 15 * 60 * 1000,
  });
}

function clearAccessTokenCookie(res: Response): void {
  const sameSite = resolveCookieSameSite();
  const secure = cookieSecure();

  res.clearCookie(ACCESS_TOKEN_COOKIE, {
    httpOnly: true,
    secure,
    sameSite,
    path: '/',
  });
  res.clearCookie(ACCESS_TOKEN_CLIENT_COOKIE, {
    secure,
    sameSite,
    path: '/',
  });
}

// ─── POST /api/auth/register ─────────────────────────────────────────────────

export async function registerHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email, username } = req.body as { email: string; username: string };
    await register(email, username);
    res.json({ success: true, message: 'OTP sent. Check your email.' });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/auth/verify-otp ───────────────────────────────────────────────

export async function verifyOtpHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email, otp, username, displayName, password, deviceToken, platform } = req.body as {
      email: string;
      otp: string;
      username: string;
      displayName?: string;
      password?: string;
      deviceToken?: string;
      platform?: 'ios' | 'android' | 'web';
    };

    const result = await verifyOtpAndLogin(email, otp, username, displayName, password, {
      deviceToken,
      platform,
    });

    setAccessTokenCookie(res, result.accessToken);

    // Lưu refresh token vào http-only cookie
    res.cookie(REFRESH_TOKEN_COOKIE, result.refreshToken, {
      httpOnly: true,
      secure: cookieSecure(),
      sameSite: resolveCookieSameSite(),
      path: '/',
      maxAge: REFRESH_TOKEN_COOKIE_MAX_AGE,
    });

    const responsePayload: any = {
      success: true,
      accessToken: result.accessToken,
      user: result.user,
    };

    // Return refreshToken in payload strictly for mobile apps
    if (platform === 'ios' || platform === 'android') {
      responsePayload.refreshToken = result.refreshToken;
    }

    res.json(responsePayload);
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/auth/login-password/request-otp ──────────────────────────────

export async function loginPasswordRequestOtpHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email, password } = req.body as { email: string; password: string };
    await requestLoginOtpWithPassword(email, password);
    res.json({ success: true, message: 'OTP sent. Check your email.' });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/auth/login-password/verify-otp ───────────────────────────────

export async function loginPasswordVerifyOtpHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email, password, otp, deviceToken, platform } = req.body as {
      email: string;
      password: string;
      otp: string;
      deviceToken?: string;
      platform?: 'ios' | 'android' | 'web';
    };

    const result = await verifyLoginWithPasswordAndOtp(email, password, otp, {
      deviceToken,
      platform,
    });

    setAccessTokenCookie(res, result.accessToken);

    res.cookie(REFRESH_TOKEN_COOKIE, result.refreshToken, {
      httpOnly: true,
      secure: cookieSecure(),
      sameSite: resolveCookieSameSite(),
      path: '/',
      maxAge: REFRESH_TOKEN_COOKIE_MAX_AGE,
    });

    const responsePayload: any = {
      success: true,
      accessToken: result.accessToken,
      user: result.user,
    };

    // Return refreshToken in payload strictly for mobile apps
    if (platform === 'ios' || platform === 'android') {
      responsePayload.refreshToken = result.refreshToken;
    }

    res.json(responsePayload);
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/auth/forgot-password/request-otp ─────────────────────────────

export async function forgotPasswordRequestOtpHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email } = req.body as { email: string };
    await requestForgotPasswordOtp(email);
    res.json({ success: true, message: 'OTP sent. Check your email.' });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/auth/forgot-password/reset ───────────────────────────────────

export async function forgotPasswordResetHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email, otp, newPassword } = req.body as {
      email: string;
      otp: string;
      newPassword: string;
    };

    await resetForgotPassword(email, otp, newPassword);
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/auth/google ───────────────────────────────────────────────────

export async function googleLoginHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { idToken, deviceToken, platform } = req.body as {
      idToken: string;
      deviceToken?: string;
      platform?: 'ios' | 'android' | 'web';
    };

    const result = await loginWithGoogle(idToken, { deviceToken, platform });

    setAccessTokenCookie(res, result.accessToken);

    res.cookie(REFRESH_TOKEN_COOKIE, result.refreshToken, {
      httpOnly: true,
      secure: cookieSecure(),
      sameSite: resolveCookieSameSite(),
      path: '/',
      maxAge: REFRESH_TOKEN_COOKIE_MAX_AGE,
    });

    const responsePayload: any = {
      success: true,
      accessToken: result.accessToken,
      user: result.user,
    };

    // Return refreshToken in payload strictly for mobile apps
    if (platform === 'ios' || platform === 'android') {
      responsePayload.refreshToken = result.refreshToken;
    }

    res.json(responsePayload);
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/auth/refresh ───────────────────────────────────────────────────

export async function refreshHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const bodyRefreshToken = (req.body as { refreshToken?: unknown } | undefined)?.refreshToken;
    const refreshToken = (req.cookies[REFRESH_TOKEN_COOKIE] as string | undefined)
      ?? (typeof bodyRefreshToken === 'string' ? bodyRefreshToken : undefined);
    if (!refreshToken) {
      logger.warn('[Auth] Refresh failed: no refresh token in cookie or body');
      res.status(401).json({ success: false, error: 'Refresh token not found' });
      return;
    }

    const accessToken = await refreshAccessToken(refreshToken);

    setAccessTokenCookie(res, accessToken);

    res.json({ success: true, accessToken });
  } catch (err) {
    logger.warn('[Auth] Refresh token verification failed', err instanceof Error ? err.message : err);
    next(err);
  }
}

// ─── GET /api/auth/current-token ────────────────────────────────────────────

/**
 * Tra ve access token hien tai tu httpOnly cookie.
 * Dung cho Socket.IO client de lay token ma khong can access token truoc do.
 * Client goi endpoint nay de lay token moi moi khi socket disconnect/reconnect.
 */
export async function currentTokenHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const accessToken = req.cookies[ACCESS_TOKEN_COOKIE] as string | undefined;
    if (!accessToken) {
      res.status(401).json({ success: false, error: 'Access token not found' });
      return;
    }
    res.json({ success: true, accessToken });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/auth/logout ────────────────────────────────────────────────────

export async function logoutHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization ?? '';
    const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const refreshToken = req.cookies[REFRESH_TOKEN_COOKIE] as string | undefined;
    const { deviceToken } = req.body as { deviceToken?: string };

    await logout(accessToken, refreshToken, deviceToken);

    clearAccessTokenCookie(res);

    // Xóa refresh token cookie
    res.clearCookie(REFRESH_TOKEN_COOKIE, {
      httpOnly: true,
      secure: cookieSecure(),
      sameSite: resolveCookieSameSite(),
      path: '/',
    });

    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
}

export async function changePasswordHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    const { currentPassword, newPassword } = req.body as {
      currentPassword: string;
      newPassword: string;
      confirmNewPassword: string;
    };
    await changePassword(userId, currentPassword, newPassword);
    res.json({ success: true, message: 'Đổi mật khẩu thành công' });
  } catch (err) {
    next(err);
  }
}

// Re-export để dùng trong routes (tránh phải gọi lại module auth.service trong routes)
export { AuthRequest };
