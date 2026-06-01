/**
 * Interface cho abstraction của AI provider.
 * Mỗi provider (Gemini, OpenRouter, ...) cần implement interface này.
 */
export interface AIProviderResult {
  text: string;
  modelId: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface AIProvider {
  readonly type: string;
  readonly modelId: string;

  generateJson(prompt: string, repairRaw?: string): Promise<AIProviderResult>;
}

export type AIProviderType = 'gemini' | 'openrouter';
