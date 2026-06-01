import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { getRedis } from '../../infrastructure/redis';
import { UserModel, type IUser } from '../users/user.model';
import { DeviceTokenModel } from '../users/device-token.model';
import { removeDeviceToken } from '../users/users.service';
import { generateOtp, storeOtp, sendOtp, verifyOtp as verifyOtpRedis } from './otp.service';
import { BadRequestError, UnauthorizedError } from '../../shared/errors';
import { logger } from '../../shared/logger';

const ACCESS_TOKEN_TTL = '15m';     // 15 phút
const REFRESH_TOKEN_TTL = '7d';     // 7 ngày
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface JwtPayload {
  sub: string;     // userId
  jti: string;     // JWT ID (dùng cho blacklist)
  iat?: number;
  exp?: number;
}

function getJwtSecret(): string {
  const secret = process.env['JWT_SECRET'];
  if (!secret) throw new Error('JWT_SECRET not configured');
  return secret;
}

function getRefreshSecret(): string {
  const secret = process.env['JWT_REFRESH_SECRET'];
  if (!secret) throw new Error('JWT_REFRESH_SECRET not configured');
  return secret;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeUsername(username: string): string {
  return username.trim().replace(/^@/, '').toLowerCase();
}

function isValidUsername(username: string): boolean {
  return /^[a-z0-9._]{3,30}$/.test(username);
}

function sanitizeUsernameBase(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, '.')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.+|\.+$/g, '');

  if (cleaned.length >= 3) {
    return cleaned.slice(0, 20);
  }

  return `user${Date.now().toString().slice(-6)}`;
}

async function findUserIncludingPassword(query: { email?: string; username?: string }): Promise<IUser | null> {
  const result = UserModel.findOne(query) as unknown as Promise<IUser | null> & {
    select?: (projection: string) => Promise<IUser | null>;
  };

  if (typeof result.select === 'function') {
    return result.select('+passwordHash');
  }

  return result;
}

async function ensureUsernameAvailable(username: string, excludeUserId?: string): Promise<void> {
  const query: { username: string; _id?: { $ne: string } } = { username };
  if (excludeUserId) {
    query._id = { $ne: excludeUserId };
  }

  const existing = await UserModel.findOne(query).select('_id').lean();
  if (existing) {
    throw new BadRequestError('Username đã tồn tại');
  }
}

async function generateUniqueUsername(base: string, excludeUserId?: string): Promise<string> {
  const baseUsername = sanitizeUsernameBase(base);
  const candidates = [
    baseUsername,
    `${baseUsername}${Math.floor(1000 + Math.random() * 9000)}`,
    `${baseUsername}${Math.floor(1000 + Math.random() * 9000)}`,
    `${baseUsername}${Math.floor(1000 + Math.random() * 9000)}`,
  ];

  for (const candidate of candidates) {
    const query: { username: string; _id?: { $ne: string } } = { username: candidate };
    if (excludeUserId) {
      query._id = { $ne: excludeUserId };
    }

    const exists = await UserModel.findOne(query).select('_id').lean();
    if (!exists) {
      return candidate;
    }
  }

  return `${baseUsername}${Date.now().toString().slice(-6)}`;
}

async function upsertDeviceToken(
  userId: string,
  deviceInfo?: { deviceToken?: string; platform?: 'ios' | 'android' | 'web' },
): Promise<void> {
  if (!deviceInfo?.deviceToken || !deviceInfo.platform) {
    return;
  }

  await DeviceTokenModel.findOneAndUpdate(
    { deviceToken: deviceInfo.deviceToken },
    { userId, deviceToken: deviceInfo.deviceToken, platform: deviceInfo.platform },
    { upsert: true, new: true },
  );
}

export interface VerifyOtpResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    username?: string;
    displayName: string;
    email?: string;
    avatarUrl?: string;
    onboardingCompleted: boolean;
  };
}

/**
 * Trả về user info cho login response, bao gồm onboardingCompleted
 * de client redirect dung sau khi dang nhap.
 */
function buildLoginUser(user: { id: string; username?: string; displayName: string; email?: string; avatarUrl?: string; onboardingCompleted?: boolean }): VerifyOtpResult['user'] {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    avatarUrl: user.avatarUrl,
    onboardingCompleted: user.onboardingCompleted ?? false,
  };
}

function toVerifyOtpResult(user: {
  id: string;
  username?: string;
  displayName: string;
  email?: string;
  avatarUrl?: string;
  onboardingCompleted?: boolean;
}): VerifyOtpResult {
  const { accessToken, refreshToken } = issueTokenPair(user.id);

  return {
    accessToken,
    refreshToken,
    user: buildLoginUser(user),
  };
}

/** Phát hành cặp access + refresh token cho một userId */
function issueTokenPair(userId: string): TokenPair {
  const accessJti = uuidv4();
  const refreshJti = uuidv4();

  const accessToken = jwt.sign({ sub: userId, jti: accessJti }, getJwtSecret(), {
    expiresIn: ACCESS_TOKEN_TTL,
  });

  const refreshToken = jwt.sign({ sub: userId, jti: refreshJti }, getRefreshSecret(), {
    expiresIn: REFRESH_TOKEN_TTL,
  });

  return { accessToken, refreshToken };
}

// ─── Register ────────────────────────────────────────────────────────────────

/** Tạo và gửi OTP đăng ký theo email */
export async function register(email: string, username: string): Promise<void> {
  const normalizedEmail = normalizeEmail(email);
  const normalizedUsername = normalizeUsername(username);

  if (!isValidUsername(normalizedUsername)) {
    throw new BadRequestError('Username không hợp lệ. Chỉ dùng chữ thường, số, dấu chấm và gạch dưới (3-30 ký tự).');
  }

  const existedUser = await UserModel.findOne({
    $or: [{ email: normalizedEmail }, { username: normalizedUsername }],
  }).select('email username').lean();

  if (existedUser) {
    if ((existedUser.email as string | undefined) === normalizedEmail) {
      throw new UnauthorizedError('Tài khoản đã tồn tại. Vui lòng đăng nhập bằng email + mật khẩu + OTP');
    }

    throw new BadRequestError('Username đã tồn tại');
  }

  const otp = generateOtp();
  await storeOtp(normalizedEmail, otp);
  await sendOtp(normalizedEmail, otp);
  logger.info(`OTP issued for ${normalizedEmail}`);
}

// ─── Verify OTP ──────────────────────────────────────────────────────────────

/**
 * Xác thực OTP và upsert user. Nếu user chưa tồn tại, tạo mới.
 * Trả về JWT pair.
 */
export async function verifyOtpAndLogin(
  email: string,
  otp: string,
  username: string,
  displayName?: string,
  password?: string,
  deviceInfo?: { deviceToken?: string; platform?: 'ios' | 'android' | 'web' },
): Promise<VerifyOtpResult> {
  const normalizedEmail = normalizeEmail(email);
  const normalizedUsername = normalizeUsername(username);

  if (!isValidUsername(normalizedUsername)) {
    throw new BadRequestError('Username không hợp lệ. Chỉ dùng chữ thường, số, dấu chấm và gạch dưới (3-30 ký tự).');
  }

  const valid = await verifyOtpRedis(normalizedEmail, otp);
  if (!valid) throw new UnauthorizedError('Invalid or expired OTP');

  const existingByEmail = await findUserIncludingPassword({ email: normalizedEmail });
  if (existingByEmail) {
    throw new UnauthorizedError('Tài khoản đã tồn tại. Vui lòng đăng nhập bằng email + mật khẩu + OTP');
  }

  await ensureUsernameAvailable(normalizedUsername);

  const normalizedDisplayName = displayName?.trim() || normalizedUsername;
  const passwordHash = password ? await bcrypt.hash(password, 10) : undefined;

  const user = await UserModel.create({
    email: normalizedEmail,
    username: normalizedUsername,
    displayName: normalizedDisplayName,
    passwordHash,
  });
  logger.info(`New user created: ${user.id}`);

  await upsertDeviceToken(user.id as string, deviceInfo);

  return toVerifyOtpResult({
    id: user.id as string,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    avatarUrl: user.avatarUrl,
    onboardingCompleted: user.onboardingCompleted,
  });
}

// ─── Email + Password + OTP Login ───────────────────────────────────────────

export async function requestLoginOtpWithPassword(email: string, password: string): Promise<void> {
  const normalizedEmail = normalizeEmail(email);
  const user = await findUserIncludingPassword({ email: normalizedEmail });

  if (!user?.passwordHash) {
    throw new UnauthorizedError('Email hoặc mật khẩu không đúng');
  }

  const isMatched = await bcrypt.compare(password, user.passwordHash);
  if (!isMatched) {
    throw new UnauthorizedError('Email hoặc mật khẩu không đúng');
  }

  const otp = generateOtp();
  await storeOtp(normalizedEmail, otp);
  await sendOtp(normalizedEmail, otp);
  logger.info(`Password OTP issued for ${normalizedEmail}`);
}

export async function verifyLoginWithPasswordAndOtp(
  email: string,
  password: string,
  otp: string,
  deviceInfo?: { deviceToken?: string; platform?: 'ios' | 'android' | 'web' },
): Promise<VerifyOtpResult> {
  const normalizedEmail = normalizeEmail(email);
  const user = await findUserIncludingPassword({ email: normalizedEmail });

  if (!user?.passwordHash) {
    throw new UnauthorizedError('Email hoặc mật khẩu không đúng');
  }

  const isMatched = await bcrypt.compare(password, user.passwordHash);
  if (!isMatched) {
    throw new UnauthorizedError('Email hoặc mật khẩu không đúng');
  }

  const validOtp = await verifyOtpRedis(normalizedEmail, otp);
  if (!validOtp) {
    throw new UnauthorizedError('OTP không hợp lệ hoặc đã hết hạn');
  }

  await upsertDeviceToken(user.id as string, deviceInfo);

  return toVerifyOtpResult({
    id: user.id as string,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    avatarUrl: user.avatarUrl,
    onboardingCompleted: user.onboardingCompleted,
  });
}

// ─── Forgot Password ────────────────────────────────────────────────────────

export async function requestForgotPasswordOtp(email: string): Promise<void> {
  const normalizedEmail = normalizeEmail(email);
  const user = await findUserIncludingPassword({ email: normalizedEmail });

  if (!user) {
    throw new UnauthorizedError('Tài khoản không tồn tại trong hệ thống');
  }

  const otp = generateOtp();
  await storeOtp(normalizedEmail, otp);
  await sendOtp(normalizedEmail, otp);
  logger.info(`Forgot password OTP issued for ${normalizedEmail}`);
}

export async function resetForgotPassword(email: string, otp: string, newPassword: string): Promise<void> {
  const normalizedEmail = normalizeEmail(email);
  const user = await findUserIncludingPassword({ email: normalizedEmail });

  if (!user) {
    throw new UnauthorizedError('Tài khoản không tồn tại trong hệ thống');
  }

  const validOtp = await verifyOtpRedis(normalizedEmail, otp);
  if (!validOtp) {
    throw new UnauthorizedError('OTP không hợp lệ hoặc đã hết hạn');
  }

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  await user.save();
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await UserModel.findById(userId).select('+passwordHash');
  if (!user?.passwordHash) {
    throw new UnauthorizedError('Tài khoản chưa thiết lập mật khẩu');
  }

  const matched = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!matched) {
    throw new UnauthorizedError('Mật khẩu hiện tại không đúng');
  }

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  await user.save();
}

// ─── Google Login ────────────────────────────────────────────────────────────

export async function loginWithGoogle(
  idToken: string,
  deviceInfo?: { deviceToken?: string; platform?: 'ios' | 'android' | 'web' },
): Promise<VerifyOtpResult> {
  const webClientId = process.env['GOOGLE_CLIENT_ID'];
  const mobileClientId = process.env['GOOGLE_CLIENT_ID_MOBILE'];

  if (!webClientId) {
    throw new BadRequestError('GOOGLE_CLIENT_ID chưa được cấu hình', 'GOOGLE_CLIENT_NOT_CONFIGURED');
  }

  // Build audience array: web client ID + optional mobile client ID
  const audience = [webClientId];
  if (mobileClientId && mobileClientId !== webClientId) {
    audience.push(mobileClientId);
  }

  let ticket: { getPayload: () => { email?: string; email_verified?: boolean; name?: string; picture?: string } | undefined };
  try {
    const { OAuth2Client } = await import('google-auth-library');
    const googleClient = new OAuth2Client();
    ticket = await googleClient.verifyIdToken({
      idToken,
      audience,
    });
  } catch (err) {
    logger.warn('[Auth] Google token verification failed', {
      error: err instanceof Error ? err.message : err,
      audienceCount: audience.length,
    });
    throw new UnauthorizedError('Google token không hợp lệ', 'GOOGLE_TOKEN_INVALID');
  }

  const payload = ticket.getPayload();
  const email = payload?.email?.trim().toLowerCase();
  const emailVerified = payload?.email_verified;

  if (!email || !emailVerified) {
    throw new UnauthorizedError('Tài khoản Google chưa xác thực email', 'GOOGLE_EMAIL_NOT_VERIFIED');
  }

  const displayName = payload?.name?.trim() || email.split('@')[0] || 'Google User';
  const avatarUrl = payload?.picture;

  const existingUser = await UserModel.findOne({ email });

  let user: InstanceType<typeof UserModel>;

  if (existingUser?.passwordHash) {
    throw new UnauthorizedError(
      'Tài khoản đã tồn tại với email này. Vui lòng đăng nhập bằng email + mật khẩu + OTP.',
      'ACCOUNT_EXISTS_WITH_PASSWORD',
    );
  }

  if (!existingUser) {
    const username = await generateUniqueUsername(email.split('@')[0] || displayName);
    user = await UserModel.create({
      email,
      username,
      displayName,
      avatarUrl,
    });
  } else {
    existingUser.displayName = displayName;
    existingUser.avatarUrl = avatarUrl;

    if (!existingUser.username) {
      existingUser.username = await generateUniqueUsername(email.split('@')[0] || displayName, existingUser.id as string);
    }

    user = await existingUser.save();
  }

  await upsertDeviceToken(user.id as string, deviceInfo);

  return toVerifyOtpResult({
    id: user.id as string,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    avatarUrl: user.avatarUrl,
    onboardingCompleted: user.onboardingCompleted,
  });
}

// ─── Refresh ─────────────────────────────────────────────────────────────────

/** Refresh access token bằng refresh token hợp lệ */
export async function refreshAccessToken(refreshToken: string): Promise<string> {
  let payload: JwtPayload;
  try {
    payload = jwt.verify(refreshToken, getRefreshSecret()) as JwtPayload;
  } catch {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  // Kiểm tra refresh token không bị blacklist
  const redis = getRedis();
  const blacklisted = await redis.get(`blacklist:token:${payload.jti}`);
  if (blacklisted) throw new UnauthorizedError('Refresh token has been revoked');

  // Phát hành access token mới
  const newAccessJti = uuidv4();
  const newAccessToken = jwt.sign(
    { sub: payload.sub, jti: newAccessJti },
    getJwtSecret(),
    { expiresIn: ACCESS_TOKEN_TTL },
  );

  return newAccessToken;
}

// ─── Logout ──────────────────────────────────────────────────────────────────

/**
 * Blacklist access token (và refresh token nếu có) trong Redis.
 * TTL = thời gian còn lại của token (hoặc max 15m).
 */
export async function logout(
  accessToken: string,
  refreshToken?: string,
  deviceToken?: string,
): Promise<void> {
  const redis = getRedis();
  let accessPayload: JwtPayload | null = null;

  // Blacklist access token
  try {
    accessPayload = jwt.decode(accessToken) as JwtPayload | null;
    if (accessPayload?.jti && accessPayload?.exp) {
      const ttl = Math.max(accessPayload.exp - Math.floor(Date.now() / 1000), 1);
      await redis.set(`blacklist:token:${accessPayload.jti}`, '1', 'EX', ttl);
    }
  } catch {
    // Nếu decode lỗi, bỏ qua
  }

  // Blacklist refresh token nếu có
  if (refreshToken) {
    try {
      const payload = jwt.decode(refreshToken) as JwtPayload | null;
      if (payload?.jti) {
        await redis.set(
          `blacklist:token:${payload.jti}`,
          '1',
          'EX',
          REFRESH_TOKEN_TTL_SECONDS,
        );
      }
    } catch {
      // Bỏ qua nếu không decode được
    }
  }

  // Thu hồi device token hiện tại để ngừng nhận push từ thiết bị vừa logout
  if (deviceToken && accessPayload?.sub) {
    await removeDeviceToken(accessPayload.sub, deviceToken);
  }

  logger.info('User logged out – tokens blacklisted');
}
