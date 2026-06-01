import type { AIProvider, AIProviderType } from './ai-provider.interface';
import { logger } from '../../../shared/logger';
import { GeminiProvider } from './gemini-provider';
import { OpenRouterProvider } from './openrouter-provider';

let _cachedProvider: AIProvider | null = null;

function getProviderType(): AIProviderType {
  const env = (process.env['AI_PROVIDER'] ?? 'gemini').toLowerCase().trim();
  if (env === 'openrouter') return 'openrouter';
  return 'gemini';
}

function isProviderEnabled(type: AIProviderType): boolean {
  if (type === 'gemini') {
    return Boolean(process.env['GEMINI_API_KEY']);
  }
  if (type === 'openrouter') {
    return Boolean(process.env['OPENROUTER_API_KEY']);
  }
  return false;
}

/**
 * Factory tạo AIProvider phù hợp với cấu hình env.
 *
 * Env:
 *   AI_PROVIDER=gemini|openrouter   (default: gemini)
 *   Gemini: GEMINI_API_KEY + AI_MODEL_FALLBACK (optional AI_CATCHUP_MODEL)
 *   OpenRouter: OPENROUTER_API_KEY + OPENROUTER_MODEL (optional OPENROUTER_BASE_URL)
 */
export function createAIProvider(): AIProvider {
  if (_cachedProvider) return _cachedProvider;

  const type = getProviderType();

  if (!isProviderEnabled(type)) {
    const fallback = type === 'gemini' ? 'openrouter' : 'gemini';
    if (isProviderEnabled(fallback)) {
      logger.warn(`[AIProviderFactory] Provider '${type}' is disabled (no API key), falling back to '${fallback}'`);
      const provider = createProviderForType(fallback);
      _cachedProvider = provider;
      return provider;
    }
    throw new Error(
      `No AI provider available. Set AI_PROVIDER=gemini and GEMINI_API_KEY, or AI_PROVIDER=openrouter and OPENROUTER_API_KEY.`,
    );
  }

  const provider = createProviderForType(type);
  _cachedProvider = provider;
  logger.info(`[AIProviderFactory] Initialised provider: ${type}`, { modelId: provider.modelId });
  return provider;
}

function createProviderForType(type: AIProviderType): AIProvider {
  switch (type) {
    case 'gemini':
      return new GeminiProvider();
    case 'openrouter':
      return new OpenRouterProvider();
    default:
      throw new Error(`Unknown AI provider type: ${type}`);
  }
}

/**
 * Reset cached provider – dùng cho testing hoặc khi cần reload config.
 */
export function resetAIProviderCache(): void {
  _cachedProvider = null;
}
