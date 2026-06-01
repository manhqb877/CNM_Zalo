import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ─── Mock Redis ───────────────────────────────────────────────────────────────
const redisMock = {
  get: jest.fn<() => Promise<string | null>>(),
  set: jest.fn<() => Promise<'OK'>>(),
  del: jest.fn<() => Promise<number>>(),
};

jest.mock('../../src/infrastructure/redis', () => ({
  getRedis: () => redisMock,
}));

// ─── Mock sendOtp so we don't hit external services ──────────────────────────
jest.mock('../../src/modules/auth/otp.service', () => {
  const actual = jest.requireActual<typeof import('../../src/modules/auth/otp.service')>(
    '../../src/modules/auth/otp.service',
  );
  return {
    ...actual,
    sendOtp: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };
});

// ─── Mock UserModel & DeviceTokenModel ───────────────────────────────────────
const userFindOne = jest.fn();
const userCreate = jest.fn();

jest.mock('../../src/modules/users/user.model', () => ({
  UserModel: {
    findOne: (...args: unknown[]) => userFindOne(...args),
    create: (...args: unknown[]) => userCreate(...args),
    findById: jest.fn(),
  },
}));

jest.mock('../../src/modules/users/device-token.model', () => ({
  DeviceTokenModel: {
    findOneAndUpdate: jest.fn(),
  },
}));

import {
  register,
  verifyOtpAndLogin,
  refreshAccessToken,
  logout,
} from '../../src/modules/auth/auth.service';
import { storeOtp } from '../../src/modules/auth/otp.service';
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'test-secret';
const JWT_REFRESH_SECRET = 'test-refresh-secret';

beforeEach(() => {
  jest.clearAllMocks();
  process.env['JWT_SECRET'] = JWT_SECRET;
  process.env['JWT_REFRESH_SECRET'] = JWT_REFRESH_SECRET;
  process.env['OTP_HARDCODE'] = 'true';
  process.env['OTP_HARDCODE_VALUE'] = '123456';
});

// ─── register() ──────────────────────────────────────────────────────────────

describe('register()', () => {
  it('should skip Redis store when OTP_HARDCODE=true', async () => {
    await register('0901234567');
    expect(redisMock.set).not.toHaveBeenCalled();
  });
});

// ─── verifyOtpAndLogin() ──────────────────────────────────────────────────────

describe('verifyOtpAndLogin()', () => {
  const mockUser = {
    id: 'user123',
    displayName: 'Test User',
    phoneNumber: '0901234567',
    email: undefined,
    avatarUrl: undefined,
  };

  it('should throw when account already exists', async () => {
    redisMock.get.mockResolvedValue('123456' as never);
    redisMock.del.mockResolvedValue(1 as never);
    userFindOne.mockResolvedValue(mockUser as never);

    await expect(
      verifyOtpAndLogin('0901234567', '123456', undefined, 'Secret123!'),
    ).rejects.toThrow('Tài khoản đã tồn tại');
  });

  it('should throw UnauthorizedError for wrong OTP', async () => {
    redisMock.get.mockResolvedValue('123456' as never);
    await expect(verifyOtpAndLogin('0901234567', '000000')).rejects.toThrow(
      'Invalid or expired OTP',
    );
  });

  it('should throw UnauthorizedError when OTP not found in Redis', async () => {
    process.env['OTP_HARDCODE'] = 'false';
    redisMock.get.mockResolvedValue(null as never);
    await expect(verifyOtpAndLogin('0901234567', '123456')).rejects.toThrow(
      'Invalid or expired OTP',
    );
  });

  it('should create new user if not found', async () => {
    redisMock.get.mockResolvedValue('123456' as never);
    redisMock.del.mockResolvedValue(1 as never);
    userFindOne.mockResolvedValue(null as never);
    userCreate.mockResolvedValue({ ...mockUser, id: 'new-user', displayName: 'New User' } as never);

    const result = await verifyOtpAndLogin('0901234567', '123456', 'New User', 'Secret123!');

    expect(userCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        phoneNumber: '0901234567',
        displayName: 'New User',
        passwordHash: expect.any(String),
      }),
    );
    expect(result.user.id).toBe('new-user');
  });
});

// ─── refreshAccessToken() ─────────────────────────────────────────────────────

describe('refreshAccessToken()', () => {
  it('should return new access token for valid refresh token', async () => {
    const refreshToken = jwt.sign(
      { sub: 'user123', jti: 'refresh-jti-1' },
      JWT_REFRESH_SECRET,
      { expiresIn: '7d' },
    );
    redisMock.get.mockResolvedValue(null as never); // not blacklisted

    const newToken = await refreshAccessToken(refreshToken);
    expect(newToken).toBeTruthy();

    const decoded = jwt.verify(newToken, JWT_SECRET) as { sub: string };
    expect(decoded.sub).toBe('user123');
  });

  it('should throw if refresh token is blacklisted', async () => {
    const refreshToken = jwt.sign(
      { sub: 'user123', jti: 'blacklisted-jti' },
      JWT_REFRESH_SECRET,
      { expiresIn: '7d' },
    );
    redisMock.get.mockResolvedValue('1' as never); // blacklisted

    await expect(refreshAccessToken(refreshToken)).rejects.toThrow(
      'Refresh token has been revoked',
    );
  });

  it('should throw for invalid/expired refresh token', async () => {
    await expect(refreshAccessToken('totally-invalid')).rejects.toThrow(
      'Invalid or expired refresh token',
    );
  });
});

// ─── logout() ────────────────────────────────────────────────────────────────

describe('logout()', () => {
  it('should blacklist access token in Redis', async () => {
    redisMock.set.mockResolvedValue('OK' as never);

    const accessToken = jwt.sign(
      { sub: 'user123', jti: 'access-jti-1' },
      JWT_SECRET,
      { expiresIn: '15m' },
    );

    await logout(accessToken);
    expect(redisMock.set).toHaveBeenCalledWith(
      'blacklist:token:access-jti-1',
      '1',
      'EX',
      expect.any(Number),
    );
  });

  it('should also blacklist refresh token when provided', async () => {
    redisMock.set.mockResolvedValue('OK' as never);

    const accessToken = jwt.sign(
      { sub: 'user123', jti: 'access-jti-2' },
      JWT_SECRET,
      { expiresIn: '15m' },
    );
    const refreshToken = jwt.sign(
      { sub: 'user123', jti: 'refresh-jti-2' },
      JWT_REFRESH_SECRET,
      { expiresIn: '7d' },
    );

    await logout(accessToken, refreshToken);
    expect(redisMock.set).toHaveBeenCalledTimes(2);
    expect(redisMock.set).toHaveBeenCalledWith(
      'blacklist:token:access-jti-2',
      '1',
      'EX',
      expect.any(Number),
    );
    expect(redisMock.set).toHaveBeenCalledWith(
      'blacklist:token:refresh-jti-2',
      '1',
      'EX',
      expect.any(Number),
    );
  });
});

// Silence unused import warning (storeOtp is imported to ensure mock works)
void storeOtp;
