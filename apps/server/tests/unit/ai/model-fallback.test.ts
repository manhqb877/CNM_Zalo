/**
 * Unit tests for model-fallback.ts
 *
 * Strategy: mock getModel() to simulate:
 *   - Primary success
 *   - Primary timeout → fallback success
 *   - Primary timeout → fallback quota exceeded → cache hit
 *   - All fail → default message
 */

// ── Mock Gemini infrastructure before importing the module ────────────────────
jest.mock('../../../src/infrastructure/gemini', () => ({
  getGeminiClient: jest.fn(),
  getModel: jest.fn(),
  AI_MODELS: {
    PRIMARY: 'gemini-2.5-pro',
    FALLBACK: 'gemini-2.5-flash',
    EMBEDDING: 'gemini-embedding-001',
  },
  isAIEnabled: jest.fn().mockReturnValue(true),
}));

import { getModel } from '../../../src/infrastructure/gemini';
import { generateWithFallback } from '../../../src/modules/ai/fallback/model-fallback';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSuccessModel(text: string) {
  return {
    startChat: jest.fn().mockReturnValue({
      sendMessage: jest.fn().mockResolvedValue({
        response: { text: () => text },
      }),
    }),
  };
}

function makeTimeoutModel(ms = 0) {
  return {
    startChat: jest.fn().mockReturnValue({
      sendMessage: jest.fn().mockImplementation(
        () => new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms)),
      ),
    }),
  };
}

function makeErrorModel(message: string) {
  return {
    startChat: jest.fn().mockReturnValue({
      sendMessage: jest.fn().mockRejectedValue(new Error(message)),
    }),
  };
}

const mockGetModel = getModel as jest.Mock;

// ─────────────────────────────────────────────────────────────────────────────

describe('ModelFallback – generateWithFallback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Happy paths ──────────────────────────────────────────────────────────

  it('returns reply from primary model on success', async () => {
    mockGetModel.mockReturnValue(makeSuccessModel('Primary reply'));

    const result = await generateWithFallback('Hello');

    expect(result.text).toBe('Primary reply');
    expect(result.modelUsed).toBe('gemini-2.5-pro');
    expect(result.fromCache).toBe(false);
  });

  it('falls back to Flash when Pro throws immediately', async () => {
    mockGetModel
      .mockReturnValueOnce(makeErrorModel('Quota exceeded')) // Primary fails
      .mockReturnValueOnce(makeSuccessModel('Flash reply'));  // Fallback succeeds

    const result = await generateWithFallback('Hello fallback test');

    expect(result.text).toBe('Flash reply');
    expect(result.modelUsed).toBe('gemini-2.5-flash');
    expect(result.fromCache).toBe(false);
  });

  // ── Error paths ──────────────────────────────────────────────────────────

  it('falls back to Flash when Pro returns a timeout', async () => {
    // Primary resolves after 20s (effectively a timeout for our 15s guard)
    // We simulate this as an immediate rejection with a timeout label
    mockGetModel
      .mockReturnValueOnce(makeErrorModel('Primary model timeout')) // Primary times out
      .mockReturnValueOnce(makeSuccessModel('Flash fallback ok'));   // Fallback ok

    const result = await generateWithFallback('timeout test');

    expect(result.text).toBe('Flash fallback ok');
    expect(result.modelUsed).toBe('gemini-2.5-flash');
  });

  it('returns default message when both Pro and Flash fail', async () => {
    mockGetModel
      .mockReturnValueOnce(makeErrorModel('Pro down'))
      .mockReturnValueOnce(makeErrorModel('Flash quota exceeded'));

    const result = await generateWithFallback('Unique prompt that has no cache: ' + Date.now());

    expect(result.text).toContain('Hiện tại');
    expect(result.fromCache).toBe(false);
  });

  it('returns cached response when both models fail but cache exists', async () => {
    const cachedPrompt = 'Cached prompt unique ' + Math.random();

    // First call: primary succeeds → populates cache
    mockGetModel.mockReturnValue(makeSuccessModel('Cached value'));
    const first = await generateWithFallback(cachedPrompt);
    expect(first.text).toBe('Cached value');
    expect(first.fromCache).toBe(false);

    // Second call: both fail → should serve from cache
    mockGetModel
      .mockReturnValueOnce(makeErrorModel('Pro down'))
      .mockReturnValueOnce(makeErrorModel('Flash down'));

    const second = await generateWithFallback(cachedPrompt);
    expect(second.text).toBe('Cached value');
    expect(second.fromCache).toBe(true);
    expect(second.modelUsed).toBe('cache');
  });

  // ── Quota exceeded ───────────────────────────────────────────────────────

  it('handles quota exceeded on primary gracefully', async () => {
    mockGetModel
      .mockReturnValueOnce(makeErrorModel('429 RESOURCE_EXHAUSTED: Quota exceeded'))
      .mockReturnValueOnce(makeSuccessModel('Flash handled quota'));

    const result = await generateWithFallback('quota test request');

    expect(result.text).toBe('Flash handled quota');
    expect(result.modelUsed).toBe('gemini-2.5-flash');
  });

  // ── Empty history ────────────────────────────────────────────────────────

  it('works correctly with empty history', async () => {
    mockGetModel.mockReturnValue(makeSuccessModel('No history reply'));

    const result = await generateWithFallback('Test with no history', []);

    expect(result.text).toBe('No history reply');
  });

  // ── System instruction ───────────────────────────────────────────────────

  it('passes systemInstruction to the primary model call', async () => {
    const startChatMock = jest.fn().mockReturnValue({
      sendMessage: jest.fn().mockResolvedValue({ response: { text: () => 'ok' } }),
    });
    mockGetModel.mockReturnValue({ startChat: startChatMock });

    await generateWithFallback('test', [], 'You are a helpful assistant.');

    expect(startChatMock).toHaveBeenCalledWith(
      expect.objectContaining({ systemInstruction: 'You are a helpful assistant.' }),
    );
  });
});
