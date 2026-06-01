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

// ─── Mock external send services ─────────────────────────────────────────────
jest.mock('twilio', () => jest.fn(() => ({
  messages: { create: jest.fn<() => Promise<void>>().mockResolvedValue(undefined) },
})));

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    sendMail: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  })),
}));

const resendSendMock = jest.fn<() => Promise<{ error: null }>>().mockResolvedValue({ error: null });
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: {
      send: resendSendMock,
    },
  })),
}));

import {
  generateOtp,
  storeOtp,
  verifyOtp,
  sendOtp,
} from '../../src/modules/auth/otp.service';

beforeEach(() => {
  jest.clearAllMocks();
  process.env['OTP_HARDCODE'] = 'false';
  process.env['OTP_HARDCODE_VALUE'] = '123456';
  delete process.env['OTP_EMAIL_PROVIDER'];
  delete process.env['RESEND_API_KEY'];
});

// ─── generateOtp() ────────────────────────────────────────────────────────────

describe('generateOtp()', () => {
  it('should return hardcoded OTP when OTP_HARDCODE=true', () => {
    process.env['OTP_HARDCODE'] = 'true';
    process.env['OTP_HARDCODE_VALUE'] = '999999';
    expect(generateOtp()).toBe('999999');
  });

  it('should return "123456" as default hardcode when OTP_HARDCODE_VALUE not set', () => {
    process.env['OTP_HARDCODE'] = 'true';
    delete process.env['OTP_HARDCODE_VALUE'];
    expect(generateOtp()).toBe('123456');
  });

  it('should return a 6-digit string when OTP_HARDCODE is false', () => {
    process.env['OTP_HARDCODE'] = 'false';
    const otp = generateOtp();
    expect(otp).toMatch(/^\d{6}$/);
  });
});

// ─── storeOtp() ──────────────────────────────────────────────────────────────

describe('storeOtp()', () => {
  it('should call Redis SET with correct key, value and TTL=300', async () => {
    process.env['OTP_HARDCODE'] = 'false';
    redisMock.set.mockResolvedValue('OK' as never);
    await storeOtp('0901234567', '123456');
    expect(redisMock.set).toHaveBeenCalledWith(
      'otp:0901234567',
      '123456',
      'EX',
      300,
    );
  });

  it('should skip Redis SET when OTP_HARDCODE=true', async () => {
    process.env['OTP_HARDCODE'] = 'true';
    await storeOtp('0901234567', '123456');
    expect(redisMock.set).not.toHaveBeenCalled();
  });
});

// ─── verifyOtp() ─────────────────────────────────────────────────────────────

describe('verifyOtp()', () => {
  it('should return true and delete key for correct OTP', async () => {
    redisMock.get.mockResolvedValue('123456' as never);
    redisMock.del.mockResolvedValue(1 as never);

    const result = await verifyOtp('0901234567', '123456');

    expect(result).toBe(true);
    expect(redisMock.del).toHaveBeenCalledWith('otp:0901234567');
  });

  it('should return false for wrong OTP', async () => {
    redisMock.get.mockResolvedValue('123456' as never);

    const result = await verifyOtp('0901234567', '000000');

    expect(result).toBe(false);
    expect(redisMock.del).not.toHaveBeenCalled();
  });

  it('should return false when OTP expired (null from Redis)', async () => {
    process.env['OTP_HARDCODE'] = 'false';
    redisMock.get.mockResolvedValue(null as never);

    const result = await verifyOtp('0901234567', '123456');

    expect(result).toBe(false);
  });

  it('should verify by hardcoded value when OTP_HARDCODE=true', async () => {
    process.env['OTP_HARDCODE'] = 'true';
    process.env['OTP_HARDCODE_VALUE'] = '123456';

    await expect(verifyOtp('any-identifier', '123456')).resolves.toBe(true);
    await expect(verifyOtp('any-identifier', '000000')).resolves.toBe(false);
    expect(redisMock.get).not.toHaveBeenCalled();
  });
});

// ─── sendOtp() ────────────────────────────────────────────────────────────────

describe('sendOtp()', () => {
  it('should not send anything when OTP_HARDCODE=true (just logs)', async () => {
    process.env['OTP_HARDCODE'] = 'true';
    // Should resolve without calling Twilio or Nodemailer
    await expect(sendOtp('0901234567', '123456')).resolves.toBeUndefined();
  });

  it('should attempt SMS send for phone number when OTP_HARDCODE=false', async () => {
    process.env['OTP_HARDCODE'] = 'false';
    process.env['TWILIO_ACCOUNT_SID'] = 'ACtest';
    process.env['TWILIO_AUTH_TOKEN'] = 'token';
    process.env['TWILIO_PHONE_NUMBER'] = '+84900000000';

    await expect(sendOtp('+84901234567', '123456')).resolves.toBeUndefined();
  });

  it('should attempt email send for email identifier when OTP_HARDCODE=false', async () => {
    process.env['OTP_HARDCODE'] = 'false';
    process.env['SMTP_HOST'] = 'smtp.resend.com';
    process.env['SMTP_PORT'] = '587';
    process.env['SMTP_USER'] = 'resend';
    process.env['SMTP_PASS'] = 'test-api-key';
    delete process.env['RESEND_API_KEY'];

    await expect(sendOtp('user@example.com', '123456')).resolves.toBeUndefined();
  });

  it('should use Resend API when RESEND_API_KEY exists', async () => {
    process.env['OTP_HARDCODE'] = 'false';
    process.env['OTP_EMAIL_PROVIDER'] = 'resend';
    process.env['RESEND_API_KEY'] = 're_test_api_key';
    process.env['RESEND_FROM'] = 'Zync <onboarding@resend.dev>';

    await expect(sendOtp('user@example.com', '123456')).resolves.toBeUndefined();
    expect(resendSendMock).toHaveBeenCalledTimes(1);
  });
});
