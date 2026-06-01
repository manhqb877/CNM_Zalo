import {
  moderateMessage,
} from '../../src/modules/ai/moderation/moderation.service';
import { runKeywordFilter } from '../../src/modules/ai/moderation/keyword-filter';
import { ModerationLogModel } from '../../src/modules/ai/moderation/moderation.model';
import mongoose from 'mongoose';

// Mock getModel and other Gemini infrastructures
jest.mock('../../src/infrastructure/gemini', () => ({
  getModel: jest.fn(),
  AI_MODELS: {
    FALLBACK: 'gemini-2.5-flash',
  },
  isAIEnabled: jest.fn().mockReturnValue(true),
}));

import { getModel } from '../../src/infrastructure/gemini';

const mockGetModel = getModel as jest.Mock;

describe('Moderation Pipeline Integration', () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI || (global as any).__MONGO_URI__);
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await ModerationLogModel.deleteMany({});
  });

  // 1. Keyword filter tests
  describe('Keyword Filter (Fallback)', () => {
    it('returns blocked for severe Vietnamese curse words', () => {
      const result = runKeywordFilter('Đmm m bực mình quá rồi đấy');
      expect(result.label).toBe('blocked');
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('returns warning for mildly offensive words', () => {
      const result = runKeywordFilter('Thằng ngu này');
      expect(result.label).toBe('warning');
      expect(result.confidence).toBeGreaterThanOrEqual(0.3);
    });

    it('returns safe for clean text', () => {
      const result = runKeywordFilter('Hôm nay thời tiết đẹp quá!');
      expect(result.label).toBe('safe');
      expect(result.confidence).toBeLessThan(0.3);
    });
  });

  // 2. Moderation Service tests
  describe('Moderation Service with DB logging', () => {
    const mockRequest = {
      messageId: new mongoose.Types.ObjectId().toHexString(),
      conversationId: new mongoose.Types.ObjectId().toHexString(),
      senderId: new mongoose.Types.ObjectId().toHexString(),
      contentType: 'text' as const,
      content: 'Hello world',
    };

    it('uses Gemini classification and saves to MongoDB as safe', async () => {
      mockGetModel.mockReturnValue({
        generateContent: jest.fn().mockResolvedValue({
          response: {
            text: () => JSON.stringify({ label: 'safe', confidence: 0.1, reason: 'Looks good' })
          }
        }),
      });

      const result = await moderateMessage(mockRequest);

      expect(result.label).toBe('safe');
      expect(result.action).toBe('pass');
      expect(result.source).toBe('gemini');

      // Wait a tick for async logging
      await new Promise(resolve => setTimeout(resolve, 100));

      const log = await ModerationLogModel.findOne({ messageId: mockRequest.messageId });
      expect(log).toBeDefined();
      expect(log?.action).toBe('pass');
      expect(log?.source).toBe('gemini');
    });

    it('escalates to flag on warning', async () => {
      mockGetModel.mockReturnValue({
        generateContent: jest.fn().mockResolvedValue({
          response: {
            text: () => JSON.stringify({ label: 'warning', confidence: 0.6, reason: 'Hate speech detected' })
          }
        }),
      });

      const req = { ...mockRequest, messageId: new mongoose.Types.ObjectId().toHexString() };
      const result = await moderateMessage(req);

      expect(result.label).toBe('warning');
      expect(result.action).toBe('flag');

      await new Promise(resolve => setTimeout(resolve, 100));
      const log = await ModerationLogModel.findOne({ messageId: req.messageId });
      expect(log?.action).toBe('flag');
    });

    it('escalates to block on blocked', async () => {
      mockGetModel.mockReturnValue({
        generateContent: jest.fn().mockResolvedValue({
          response: {
            text: () => JSON.stringify({ label: 'blocked', confidence: 0.9, reason: 'Severe context' })
          }
        }),
      });

      const req = { ...mockRequest, messageId: new mongoose.Types.ObjectId().toHexString() };
      const result = await moderateMessage(req);

      expect(result.label).toBe('blocked');
      expect(result.action).toBe('block');

      await new Promise(resolve => setTimeout(resolve, 100));
      const log = await ModerationLogModel.findOne({ messageId: req.messageId });
      expect(log?.action).toBe('block');
    });

    // 3. Fallback tests
    it('falls back to keyword filter if Gemini fails (Fail-open to safe)', async () => {
      mockGetModel.mockReturnValue({
        generateContent: jest.fn().mockRejectedValue(new Error('AI API Error')),
      });

      const req = { ...mockRequest, messageId: new mongoose.Types.ObjectId().toHexString(), content: 'Normal text here, no bad words' };
      const result = await moderateMessage(req);

      // Falls back to keyword filter
      expect(result.source).toBe('keyword_filter');
      expect(result.label).toBe('safe'); // clean text -> safe fallback
      expect(result.action).toBe('pass');

      await new Promise(resolve => setTimeout(resolve, 100));
      const log = await ModerationLogModel.findOne({ messageId: req.messageId });
      expect(log?.source).toBe('keyword_filter');
      expect(log?.label).toBe('safe'); // verified it fell back properly
    });
    
    it('falls back to keyword filter if Gemini fails (Catches bad word)', async () => {
      mockGetModel.mockReturnValue({
        generateContent: jest.fn().mockRejectedValue(new Error('AI API Error')),
      });

      const req = { ...mockRequest, messageId: new mongoose.Types.ObjectId().toHexString(), content: 'vkl may di ra ngoai' };
      const result = await moderateMessage(req);

      // Falls back to keyword filter
      expect(result.source).toBe('keyword_filter');
      expect(result.label).toBe('blocked'); // caught by filter
      expect(result.action).toBe('block');
    });
  });
});
