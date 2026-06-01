import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockSendEachForMulticast = jest.fn<() => Promise<{
  successCount: number;
  failureCount: number;
  responses: Array<{ success: boolean; error?: { code: string } }>;
}>>();

jest.mock('firebase-admin', () => {
  const apps: unknown[] = [];
  return {
    apps,
    initializeApp: jest.fn(() => {
      apps.push({});
    }),
    credential: {
      cert: jest.fn(() => ({})),
      applicationDefault: jest.fn(() => ({})),
    },
    messaging: () => ({
      sendEachForMulticast: mockSendEachForMulticast,
    }),
  };
});

jest.mock('../../src/shared/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env['GOOGLE_APPLICATION_CREDENTIALS'];
  delete process.env['FCM_SERVICE_ACCOUNT_JSON'];
});

describe('FCM module', () => {
  it('should not crash when FCM is not configured', async () => {
    jest.resetModules();
    const { sendFCMNotification, isFCMConfigured } = await import('../../src/infrastructure/fcm');

    const result = await sendFCMNotification(
      ['token1'],
      { title: 'Test', body: 'Body' },
    );

    expect(result.successCount).toBe(0);
    expect(result.expiredTokens).toEqual([]);
    expect(isFCMConfigured()).toBe(false);
  });

  it('should return empty result for empty tokens array', async () => {
    jest.resetModules();
    const { sendFCMNotification } = await import('../../src/infrastructure/fcm');

    const result = await sendFCMNotification([], { title: 'T', body: 'B' });
    expect(result.successCount).toBe(0);
    expect(result.expiredTokens).toEqual([]);
  });

  it('should initialize from FCM_SERVICE_ACCOUNT_JSON when provided', async () => {
    jest.resetModules();
    process.env['FCM_SERVICE_ACCOUNT_JSON'] = JSON.stringify({
      project_id: 'test',
      client_email: 'test@test.iam.gserviceaccount.com',
      private_key: '-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----\n',
    });

    const { isFCMConfigured } = await import('../../src/infrastructure/fcm');
    expect(isFCMConfigured()).toBe(true);
  });

  it('should detect expired tokens from FCM response', async () => {
    jest.resetModules();
    process.env['FCM_SERVICE_ACCOUNT_JSON'] = JSON.stringify({
      project_id: 'test',
      client_email: 'test@test.iam.gserviceaccount.com',
      private_key: '-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----\n',
    });

    mockSendEachForMulticast.mockResolvedValue({
      successCount: 1,
      failureCount: 1,
      responses: [
        { success: true },
        { success: false, error: { code: 'messaging/registration-token-not-registered' } },
      ],
    });

    const { sendFCMNotification } = await import('../../src/infrastructure/fcm');
    const result = await sendFCMNotification(
      ['good-token', 'expired-token'],
      { title: 'Test', body: 'Body' },
    );

    expect(result.successCount).toBe(1);
    expect(result.expiredTokens).toEqual(['expired-token']);
  });

  it('should handle FCM sendEachForMulticast throwing error', async () => {
    jest.resetModules();
    process.env['FCM_SERVICE_ACCOUNT_JSON'] = JSON.stringify({
      project_id: 'test',
      client_email: 'test@test.iam.gserviceaccount.com',
      private_key: '-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----\n',
    });

    mockSendEachForMulticast.mockRejectedValue(new Error('Network error'));

    const { sendFCMNotification } = await import('../../src/infrastructure/fcm');
    const result = await sendFCMNotification(
      ['token1'],
      { title: 'Test', body: 'Body' },
    );

    expect(result.successCount).toBe(0);
    expect(result.expiredTokens).toEqual([]);
  });
});
