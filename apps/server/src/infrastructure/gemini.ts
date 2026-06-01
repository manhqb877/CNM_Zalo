import { GoogleGenerativeAI, type GenerativeModel } from '@google/generative-ai';
import { logger } from '../shared/logger';

// ─── Model IDs ───────────────────────────────────────────────────────────────
export const AI_MODELS = {
  PRIMARY: process.env['AI_MODEL_PRIMARY'] ?? 'gemini-2.5-pro',
  FALLBACK: process.env['AI_MODEL_FALLBACK'] ?? 'gemini-2.5-flash',
  EMBEDDING: process.env['AI_EMBEDDING_MODEL'] ?? 'gemini-embedding-001',
} as const;

// ─── Singleton Gemini client ──────────────────────────────────────────────────
let _genAI: GoogleGenerativeAI | null = null;

export function getGeminiClient(): GoogleGenerativeAI {
  if (_genAI) return _genAI;

  const apiKey = process.env['GEMINI_API_KEY'];
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set. Add it to .env to enable AI features.');
  }

  _genAI = new GoogleGenerativeAI(apiKey);
  logger.info('[Gemini] Client initialised', { primary: AI_MODELS.PRIMARY, fallback: AI_MODELS.FALLBACK });
  return _genAI;
}

/**
 * Get a GenerativeModel instance for a given model ID.
 * @param modelId – one of AI_MODELS.PRIMARY | AI_MODELS.FALLBACK
 */
export function getModel(modelId: string): GenerativeModel {
  return getGeminiClient().getGenerativeModel({ model: modelId });
}

/**
 * Returns true when AI features are enabled and the API key is present.
 */
export function isAIEnabled(): boolean {
  return (
    process.env['AI_ASSISTANT_ENABLED'] !== 'false' &&
    process.env['AI_MODERATION_ENABLED'] !== 'false' &&
    !!process.env['GEMINI_API_KEY']
  );
}
