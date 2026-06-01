import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '../../../shared/logger';
import type { AIProvider, AIProviderResult } from './ai-provider.interface';

// Giữ nguyên logic hiện tại từ infrastructure/gemini.ts
let _genAI: GoogleGenerativeAI | null = null;

function getGenAI(): GoogleGenerativeAI {
  if (_genAI) return _genAI;

  const apiKey = process.env['GEMINI_API_KEY'];
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set. Add it to .env to enable AI features.');
  }

  _genAI = new GoogleGenerativeAI(apiKey);
  logger.info('[GeminiProvider] Client initialised');
  return _genAI;
}

function timeout(ms: number, reason: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(reason)), ms);
  });
}

/**
 * Provider dùng Google Gemini trực tiếp.
 * Sử dụng GEMINI_API_KEY từ environment.
 */
export class GeminiProvider implements AIProvider {
  readonly type = 'gemini' as const;
  readonly modelId: string;

  private readonly timeoutMs: number;

  constructor(modelId?: string, timeoutMs = 18_000) {
    this.modelId = modelId ?? process.env['AI_CATCHUP_MODEL'] ?? process.env['AI_MODEL_FALLBACK'] ?? 'gemini-2.5-flash';
    this.timeoutMs = timeoutMs;
  }

  async generateJson(prompt: string, repairRaw?: string): Promise<AIProviderResult> {
    const model = getGenAI().getGenerativeModel({ model: this.modelId });

    const promptToSend = repairRaw
      ? `${prompt}\n\nThe previous response was invalid JSON. Repair it and return valid JSON only:\n${repairRaw.slice(0, 6000)}`
      : prompt;

    const result = await Promise.race([
      model.generateContent(promptToSend),
      timeout(this.timeoutMs, `Gemini timeout after ${this.timeoutMs}ms`),
    ]);

    const raw = result.response.text().trim();
    return { text: raw, modelId: this.modelId };
  }
}
