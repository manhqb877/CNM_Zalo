import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.middleware';
import { otpRateLimiter } from '../../shared/middleware/rate-limiter.middleware';
import { validateBody } from '../../shared/middleware/validate.middleware';
import {
  RegisterSchema,
  VerifyOtpSchema,
  LogoutSchema,
  LoginPasswordRequestOtpSchema,
  LoginPasswordVerifyOtpSchema,
  GoogleLoginSchema,
  ForgotPasswordRequestOtpSchema,
  ForgotPasswordResetSchema,
  ChangePasswordSchema,
} from './auth.schema';
import {
  registerHandler,
  verifyOtpHandler,
  loginPasswordRequestOtpHandler,
  loginPasswordVerifyOtpHandler,
  forgotPasswordRequestOtpHandler,
  forgotPasswordResetHandler,
  googleLoginHandler,
  refreshHandler,
  currentTokenHandler,
  logoutHandler,
  changePasswordHandler,
} from './auth.controller';

export const authRouter = Router();

// POST /api/auth/register – request OTP via email
authRouter.post('/register', otpRateLimiter, validateBody(RegisterSchema), registerHandler);

// POST /api/auth/verify-otp – verify OTP, receive JWT + refresh token cookie
authRouter.post('/verify-otp', validateBody(VerifyOtpSchema), verifyOtpHandler);

// POST /api/auth/login-password/request-otp – login step 1 with email/password
authRouter.post(
  '/login-password/request-otp',
  otpRateLimiter,
  validateBody(LoginPasswordRequestOtpSchema),
  loginPasswordRequestOtpHandler,
);

// POST /api/auth/login-password/verify-otp – login step 2 verify OTP + issue JWT
authRouter.post(
  '/login-password/verify-otp',
  validateBody(LoginPasswordVerifyOtpSchema),
  loginPasswordVerifyOtpHandler,
);

// POST /api/auth/forgot-password/request-otp – send OTP for password recovery
authRouter.post(
  '/forgot-password/request-otp',
  otpRateLimiter,
  validateBody(ForgotPasswordRequestOtpSchema),
  forgotPasswordRequestOtpHandler,
);

// POST /api/auth/forgot-password/reset – verify OTP and reset password
authRouter.post(
  '/forgot-password/reset',
  validateBody(ForgotPasswordResetSchema),
  forgotPasswordResetHandler,
);

// POST /api/auth/google – login with Google ID token
authRouter.post('/google', validateBody(GoogleLoginSchema), googleLoginHandler);

// POST /api/auth/refresh – refresh access token using http-only cookie
authRouter.post('/refresh', refreshHandler);

// GET /api/auth/current-token – lay access token tu httpOnly cookie (dung cho Socket.IO)
authRouter.get('/current-token', currentTokenHandler);

// POST /api/auth/logout – revoke token + clear cookie
authRouter.post('/logout', validateBody(LogoutSchema), logoutHandler);

// POST /api/auth/change-password – authenticated password change
authRouter.post('/change-password', authenticate, validateBody(ChangePasswordSchema), changePasswordHandler);
