import { getModel, AI_MODELS } from '../../../infrastructure/gemini';
import { logger } from '../../../shared/logger';

export interface ChatMessage {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

export interface FallbackResult {
  text: string;
  modelUsed: string;
  fromCache: boolean;
}

// Simple in-process LRU-like cache keyed by prompt hash (up to 100 entries)
const responseCache = new Map<string, string>();
const MAX_CACHE = 100;

function cacheKey(prompt: string): string {
  // Lightweight hash – good enough for emergency cache
  let h = 0;
  for (let i = 0; i < prompt.length; i++) {
    h = Math.imul(31, h) + prompt.charCodeAt(i) | 0;
  }
  return `cache_${h}`;
}

function putCache(key: string, value: string): void {
  if (responseCache.size >= MAX_CACHE) {
    const first = responseCache.keys().next().value;
    if (first !== undefined) responseCache.delete(first);
  }
  responseCache.set(key, value);
}

/**
 * AI_RATE_LIMIT_PER_MINUTE governs how many Gemini calls a single user
 * can make.  The model fallback chain handles *API errors* (quota, timeout),
 * not per-user rate limits (that is handled by rate-limiter.ts).
 *
 * Chain:  Gemini Pro  →  Gemini Flash  →  in-process cached response
 */
export async function generateWithFallback(
  prompt: string,
  history: ChatMessage[] = [],
  systemInstruction?: string,
): Promise<FallbackResult> {
  const key = cacheKey(prompt);

  // ── Try PRIMARY (Pro) ─────────────────────────────────────────────────────
  try {
    const model = getModel(AI_MODELS.PRIMARY);
    const chat = model.startChat({
      history,
      systemInstruction: systemInstruction ?? undefined,
    });
    const result = await Promise.race([
      chat.sendMessage(prompt),
      timeout(15_000, 'Primary model timeout'),
    ]);
    const text = result.response.text();
    putCache(key, text);
    return { text, modelUsed: AI_MODELS.PRIMARY, fromCache: false };
  } catch (err) {
    logger.warn('[ModelFallback] Primary model failed, trying fallback', { err: String(err) });
  }

  // ── Try FALLBACK (Flash) ──────────────────────────────────────────────────
  try {
    const model = getModel(AI_MODELS.FALLBACK);
    const chat = model.startChat({ history });
    const result = await Promise.race([
      chat.sendMessage(prompt),
      timeout(10_000, 'Fallback model timeout'),
    ]);
    const text = result.response.text();
    putCache(key, text);
    return { text, modelUsed: AI_MODELS.FALLBACK, fromCache: false };
  } catch (err) {
    logger.warn('[ModelFallback] Fallback model failed, using cache', { err: String(err) });
  }

  // ── Use cached response (emergency) ──────────────────────────────────────
  const cached = responseCache.get(key);
  if (cached) {
    logger.info('[ModelFallback] Serving cached response');
    return { text: cached, modelUsed: 'cache', fromCache: true };
  }

  return {
    text: 'Hiện tại mình không thể trả lời, thử lại sau nhé 🙏',
    modelUsed: 'fallback-default',
    fromCache: false,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

interface GenerateContentResult {
  response: { text: () => string };
}

function timeout(ms: number, reason: string): Promise<GenerateContentResult> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(reason)), ms),
  );
}
