import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockSetVapidDetails = jest.fn<(subject: unknown, pub: unknown, priv: unknown) => void>();
const mockSendNotification = jest.fn<(sub: unknown, payload: unknown, opts: unknown) => Promise<{ statusCode: number }>>();

jest.mock('web-push', () => ({
  default: {
    setVapidDetails: (subject: unknown, pub: unknown, priv: unknown) => mockSetVapidDetails(subject, pub, priv),
    sendNotification: (sub: unknown, payload: unknown, opts: unknown) => mockSendNotification(sub, payload, opts),
  },
  __esModule: true,
}));

jest.mock('../../src/shared/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const SUBSCRIPTION = {
  endpoint: 'https://push.example.com/sub/abc123',
  keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
};

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env['VAPID_PUBLIC_KEY'];
  delete process.env['VAPID_PRIVATE_KEY'];
  delete process.env['VAPID_SUBJECT'];
});

describe('Web Push module', () => {
  it('should not crash when VAPID keys are missing', async () => {
    jest.resetModules();
    const { sendWebPush, isWebPushConfigured } = await import('../../src/infrastructure/web-push');

    expect(isWebPushConfigured()).toBe(false);

    const result = await sendWebPush(SUBSCRIPTION, JSON.stringify({ title: 'Test' }));
    expect(result.success).toBe(false);
    expect(result.expired).toBe(false);
  });

  it('should initialize when VAPID keys are provided', async () => {
    jest.resetModules();
    process.env['VAPID_PUBLIC_KEY'] = 'BNsomefakepublickey';
    process.env['VAPID_PRIVATE_KEY'] = 'somefakeprivatekey';
    process.env['VAPID_SUBJECT'] = 'mailto:test@zync.io';

    const { isWebPushConfigured, getVapidPublicKey } = await import('../../src/infrastructure/web-push');

    expect(isWebPushConfigured()).toBe(true);
    expect(getVapidPublicKey()).toBe('BNsomefakepublickey');
    expect(mockSetVapidDetails).toHaveBeenCalledWith(
      'mailto:test@zync.io',
      'BNsomefakepublickey',
      'somefakeprivatekey',
    );
  });

  it('should return success:true on successful send', async () => {
    jest.resetModules();
    process.env['VAPID_PUBLIC_KEY'] = 'BNsomefakepublickey';
    process.env['VAPID_PRIVATE_KEY'] = 'somefakeprivatekey';

    mockSendNotification.mockResolvedValue({ statusCode: 201 });

    const { sendWebPush } = await import('../../src/infrastructure/web-push');
    const result = await sendWebPush(SUBSCRIPTION, JSON.stringify({ title: 'Hello' }));

    expect(result.success).toBe(true);
    expect(result.expired).toBe(false);
  });

  it('should detect 410 as expired subscription', async () => {
    jest.resetModules();
    process.env['VAPID_PUBLIC_KEY'] = 'BNsomefakepublickey';
    process.env['VAPID_PRIVATE_KEY'] = 'somefakeprivatekey';

    mockSendNotification.mockRejectedValue({ statusCode: 410 });

    const { sendWebPush } = await import('../../src/infrastructure/web-push');
    const result = await sendWebPush(SUBSCRIPTION, JSON.stringify({ title: 'Hello' }));

    expect(result.success).toBe(false);
    expect(result.expired).toBe(true);
  });

  it('should detect 404 as expired subscription', async () => {
    jest.resetModules();
    process.env['VAPID_PUBLIC_KEY'] = 'BNsomefakepublickey';
    process.env['VAPID_PRIVATE_KEY'] = 'somefakeprivatekey';

    mockSendNotification.mockRejectedValue({ statusCode: 404 });

    const { sendWebPush } = await import('../../src/infrastructure/web-push');
    const result = await sendWebPush(SUBSCRIPTION, JSON.stringify({ title: 'Hello' }));

    expect(result.success).toBe(false);
    expect(result.expired).toBe(true);
  });

  it('should handle generic send failure without marking expired', async () => {
    jest.resetModules();
    process.env['VAPID_PUBLIC_KEY'] = 'BNsomefakepublickey';
    process.env['VAPID_PRIVATE_KEY'] = 'somefakeprivatekey';

    mockSendNotification.mockRejectedValue(new Error('Network error'));

    const { sendWebPush } = await import('../../src/infrastructure/web-push');
    const result = await sendWebPush(SUBSCRIPTION, JSON.stringify({ title: 'Hello' }));

    expect(result.success).toBe(false);
    expect(result.expired).toBe(false);
  });
});
