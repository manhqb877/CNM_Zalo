/**
 * Embedding Service – wraps Gemini embeddings.
 *
 * Produces 768-dimension float vectors for semantic search and RAG context.
 * Uses the Gemini embedding API via @google/generative-ai.
 */

import { getGeminiClient, AI_MODELS } from '../../../infrastructure/gemini';
import { getRedis } from '../../../infrastructure/redis';
import { logger } from '../../../shared/logger';

const EMBEDDING_CACHE_TTL = 30 * 60; // 30 minutes
const EMBEDDING_DIMENSIONS = 768;
const FALLBACK_EMBEDDING_MODELS = ['gemini-embedding-001', 'text-embedding-004', 'embedding-001'];

export type EmbeddingVector = number[]; // 768 floats

/**
 * Compute a 768-dimension embedding for a single text.
 * Results are cached in Redis for 30 minutes to avoid redundant API calls.
 *
 * @param text    – the text to embed (max ~8K tokens)
 * @param taskType – Gemini task type hint (default: RETRIEVAL_DOCUMENT)
 */
export async function embedText(
  text: string,
  taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' | 'SEMANTIC_SIMILARITY' = 'RETRIEVAL_DOCUMENT',
): Promise<EmbeddingVector> {
  const normalizedText = text.trim();
  const candidateModels = getEmbeddingModelCandidates();
  const cacheKey = buildCacheKey(normalizedText, taskType, candidateModels[0] ?? AI_MODELS.EMBEDDING);

  // ── Cache hit ──────────────────────────────────────────────────────────────
  const cached = await tryGetCache(cacheKey);
  if (cached) return cached;

  const genAI = getGeminiClient();
  let lastError: unknown;

  for (const modelId of candidateModels) {
    try {
      const model = genAI.getGenerativeModel({ model: modelId });
      const result = await model.embedContent({
        content: { parts: [{ text: normalizedText }], role: 'user' },
        taskType,
        outputDimensionality: EMBEDDING_DIMENSIONS,
      } as unknown as Parameters<typeof model.embedContent>[0]);

      const vector = normalizeEmbeddingDimensions(result.embedding.values);
      await trySetCache(cacheKey, vector);

      if (modelId !== AI_MODELS.EMBEDDING) {
        logger.warn('[EmbeddingService] Used fallback embedding model', {
          configuredModel: AI_MODELS.EMBEDDING,
          modelId,
        });
      }

      return vector;
    } catch (err) {
      lastError = err;
      logger.warn('[EmbeddingService] Embedding model failed', {
        modelId,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Embedding provider failed');
}

function normalizeEmbeddingDimensions(vector: EmbeddingVector): EmbeddingVector {
  if (vector.length === EMBEDDING_DIMENSIONS) {
    return vector;
  }

  logger.warn('[EmbeddingService] Normalizing embedding dimension for pgvector schema', {
    dimension: vector.length,
    targetDimension: EMBEDDING_DIMENSIONS,
  });

  if (vector.length > EMBEDDING_DIMENSIONS) {
    return vector.slice(0, EMBEDDING_DIMENSIONS);
  }

  return [...vector, ...Array(EMBEDDING_DIMENSIONS - vector.length).fill(0)];
}

/**
 * Batch-embed multiple texts.
 * Processes sequentially to respect Gemini free-tier rate limits (15 RPM).
 * Inserts a 200ms delay between requests when > 5 items.
 */
export async function embedBatch(
  texts: string[],
  taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' = 'RETRIEVAL_DOCUMENT',
): Promise<EmbeddingVector[]> {
  const results: EmbeddingVector[] = [];

  for (let i = 0; i < texts.length; i++) {
    const text = texts[i];
    if (!text) continue;
    results.push(await embedText(text, taskType));

    // Gentle rate-limit guard for batch operations
    if (texts.length > 5 && i < texts.length - 1) {
      await sleep(200);
    }
  }

  return results;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getEmbeddingModelCandidates(): string[] {
  return Array.from(new Set([
    AI_MODELS.EMBEDDING,
    ...FALLBACK_EMBEDDING_MODELS,
  ].filter(Boolean)));
}

function buildCacheKey(text: string, taskType: string, modelId: string): string {
  // Simple key using first 200 chars + task type (good enough for cache hit)
  const slug = text.slice(0, 200).replace(/\s+/g, '_');
  return `embed:${modelId}:${taskType}:${EMBEDDING_DIMENSIONS}:${slug}`;
}

async function tryGetCache(key: string): Promise<EmbeddingVector | null> {
  try {
    const redis = getRedis();
    const raw = await redis.get(key);
    if (raw) {
      return JSON.parse(raw) as EmbeddingVector;
    }
  } catch (err) {
    logger.debug('[EmbeddingService] Cache get failed', { err: String(err) });
  }
  return null;
}

async function trySetCache(key: string, vector: EmbeddingVector): Promise<void> {
  try {
    const redis = getRedis();
    await redis.setex(key, EMBEDDING_CACHE_TTL, JSON.stringify(vector));
  } catch (err) {
    logger.debug('[EmbeddingService] Cache set failed', { err: String(err) });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
