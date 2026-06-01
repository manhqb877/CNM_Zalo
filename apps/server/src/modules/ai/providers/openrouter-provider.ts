import { logger } from '../../../shared/logger';
import type { AIProvider, AIProviderResult } from './ai-provider.interface';

const OPENROUTER_DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';

interface OpenRouterChoice {
  message: {
    role: string;
    content: string;
  };
}

interface OpenRouterResponse {
  id?: string;
  choices?: OpenRouterChoice[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    message?: string;
    code?: string;
  };
}

/**
 * Provider dùng OpenRouter để gọi nhiều model AI khác nhau qua cùng một interface.
 * Hỗ trợ bất kỳ model nào có trên OpenRouter (Anthropic, OpenAI, Mistral, ...).
 *
 * Env vars cần thiết:
 *   OPENROUTER_API_KEY  – API key từ openrouter.ai
 *   OPENROUTER_BASE_URL – Base URL (mặc định: https://openrouter.ai/api/v1)
 *   OPENROUTER_MODEL    – Primary model (mặc định: google/gemini-2.5-flash-lite)
 *   OPENROUTER_FALLBACK_MODEL – Fallback model khi primary bị rate-limit liên tục
 *
 * Retry logic: Khi upstream trả 429, retry với exponential backoff tối đa MAX_RETRIES lần.
 * Retry-After header được tôn trọng nếu có.
 * Nếu primary model thất bại sau MAX_RETRIES, chuyển sang fallback model.
 */
export class OpenRouterProvider implements AIProvider {
  readonly type = 'openrouter' as const;
  readonly modelId: string;

  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly initialRetryDelayMs: number;
  private readonly fallbackModel: string | undefined;
  private primaryFailures = 0;
  private readonly maxPrimaryFailuresBeforeSwitch = 3;

  constructor(
    modelId?: string,
    baseUrl?: string,
    timeoutMs = 30_000,
    maxRetries = 4,
    initialRetryDelayMs = 2_000,
  ) {
    this.modelId = modelId ?? process.env['OPENROUTER_MODEL'] ?? 'google/gemini-2.5-flash-lite';
    this.maxRetries = parseInt(process.env['OPENROUTER_MAX_RETRIES'] ?? String(maxRetries), 10);
    this.initialRetryDelayMs = parseInt(process.env['OPENROUTER_RETRY_DELAY_MS'] ?? String(initialRetryDelayMs), 10);
    this.fallbackModel = process.env['OPENROUTER_FALLBACK_MODEL'];

    const configuredBaseUrl = process.env['OPENROUTER_BASE_URL'];
    this.baseUrl = baseUrl ?? (configuredBaseUrl && configuredBaseUrl.trim().length > 0 ? configuredBaseUrl : OPENROUTER_DEFAULT_BASE_URL);

    const configuredKey = process.env['OPENROUTER_API_KEY'];
    if (!configuredKey || configuredKey.trim().length === 0) {
      throw new Error('OPENROUTER_API_KEY is not set. Add it to .env to use OpenRouter provider.');
    }
    this.apiKey = configuredKey;
    this.timeoutMs = timeoutMs;

    logger.info('[OpenRouterProvider] Initialised', {
      modelId: this.modelId,
      fallbackModel: this.fallbackModel,
      baseUrl: this.baseUrl,
      maxRetries: this.maxRetries,
    });
  }

  private getActiveModel(): string {
    return this.modelId;
  }

  async generateJson(prompt: string, repairRaw?: string): Promise<AIProviderResult> {
    const systemInstruction = `You are summarizing unread chat messages for one user in a private chat app.
Return valid JSON only. No markdown. No explanation. No additional text.
JSON schema:
{
  "title": "short Vietnamese title, max 80 chars",
  "overview": "1-2 Vietnamese sentences",
  "bullets": ["3-6 concise Vietnamese bullets"],
  "mentionedUserIds": ["user ids explicitly mentioned or directly relevant"],
  "sourceMessageRefs": ["message refs used for the summary"],
  "futureSignals": {
    "decisions": ["clear decisions only, otherwise empty"],
    "questionsForUser": ["questions directed at current user, otherwise empty"],
    "actionItems": [
      { "text": "task text", "sourceMessageRefs": ["messageRef"] }
    ],
    "suggestedReplies": ["short reply suggestions, otherwise empty"]
  }
}`;

    const content = repairRaw
      ? `${prompt}\n\nThe previous response was invalid JSON. Repair it and return valid JSON only:\n${repairRaw.slice(0, 6000)}`
      : prompt;

    return this.requestWithRetry(content, systemInstruction);
  }

  private async requestWithRetry(
    content: string,
    systemInstruction: string,
    attempt = 0,
    usedFallback = false,
  ): Promise<AIProviderResult> {
    const model = this.getActiveModel();
    const isFallback = usedFallback || this.primaryFailures >= this.maxPrimaryFailuresBeforeSwitch;
    const activeModel = isFallback && this.fallbackModel ? this.fallbackModel : model;

    if (isFallback && this.fallbackModel) {
      logger.info(`[OpenRouterProvider] Switching to fallback model: ${this.fallbackModel}`);
    }

    const body: Record<string, unknown> = {
      model: activeModel,
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content },
      ],
      max_tokens: 2048,
      temperature: 0.2,
    };

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env['OPENROUTER_SITE_URL'] ?? 'https://zync.io',
          'X-Title': 'Zync Platform',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutHandle);
    }

    // 429 upstream – retry with backoff
    if (response.status === 429) {
      if (!isFallback && this.fallbackModel) {
        // Chuyển sang fallback model ngay thay vì retry primary
        logger.warn(`[OpenRouterProvider] Primary model 429, switching to fallback: ${this.fallbackModel}`);
        this.primaryFailures = this.maxPrimaryFailuresBeforeSwitch;
        return this.requestWithRetry(content, systemInstruction, 0, true);
      }

      if (attempt < this.maxRetries) {
        let delayMs = this.initialRetryDelayMs * Math.pow(2, attempt);
        const retryAfter = response.headers.get('Retry-After');
        if (retryAfter) {
          const parsed = parseInt(retryAfter, 10);
          if (!Number.isNaN(parsed)) {
            delayMs = Math.max(delayMs, parsed * 1000);
          }
        }

        logger.warn(`[OpenRouterProvider] Upstream 429, retrying in ${Math.round(delayMs / 1000)}s (attempt ${attempt + 1}/${this.maxRetries})`);
        await sleep(delayMs);
        return this.requestWithRetry(content, systemInstruction, attempt + 1, isFallback);
      }

      const errorBody = await response.text().catch(() => '');
      throw new Error(`OpenRouter HTTP 429 after ${this.maxRetries + 1} attempts: ${errorBody}`);
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`OpenRouter HTTP ${response.status}: ${errorBody}`);
    }

    const data = (await response.json()) as OpenRouterResponse;

    if (data.error) {
      throw new Error(`OpenRouter error: ${data.error.message ?? data.error.code}`);
    }

    const content2 = data.choices?.[0]?.message?.content;
    if (!content2) {
      throw new Error('OpenRouter returned empty response');
    }

    // Reset failure counter on success
    if (!isFallback) {
      this.primaryFailures = 0;
    }

    return {
      text: content2.trim(),
      modelId: activeModel,
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      } : undefined,
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
