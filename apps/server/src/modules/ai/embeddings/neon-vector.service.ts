/**
 * Neon Vector Service – pgvector CRUD for AI modules
 *
 * Handles: insert, cosine similarity search, and delete operations
 * for message_embeddings and user_profile_embeddings tables.
 */

import { getNeonClient } from '../../../infrastructure/neon';
import { logger } from '../../../shared/logger';
import type { EmbeddingVector } from './embedding.service';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MessageEmbeddingRecord {
  id: string;
  messageId: string;
  conversationId: string;
  contentText: string;
  similarity: number;
  createdAt: Date;
}

export interface UserProfileEmbeddingRecord {
  id: string;
  userId: string;
  bioText: string;
  similarity: number;
}

// ─── Message Embeddings ───────────────────────────────────────────────────────

/**
 * Insert a message embedding into Neon pgvector.
 * Uses ON CONFLICT DO NOTHING (idempotent — safe to call twice for the same messageId).
 */
export async function insertMessageEmbedding(params: {
  messageId: string;
  conversationId: string;
  contentText: string;
  embedding: EmbeddingVector;
}): Promise<void> {
  const sql = getNeonClient();
  const { messageId, conversationId, contentText, embedding } = params;

  // pgvector expects a vector literal: '[1.2, 0.3, ...]'
  const vectorLiteral = `[${embedding.join(',')}]`;

  await sql`
    INSERT INTO message_embeddings (message_id, conversation_id, content_text, embedding)
    VALUES (${messageId}, ${conversationId}, ${contentText}, ${vectorLiteral}::vector)
    ON CONFLICT (message_id)
    DO UPDATE SET
      conversation_id = EXCLUDED.conversation_id,
      content_text = EXCLUDED.content_text,
      embedding = EXCLUDED.embedding,
      created_at = NOW()
  `;

  logger.debug('[NeonVector] Inserted message embedding', { messageId });
}

/**
 * Semantic search within a conversation using cosine similarity.
 * Returns top-K most similar messages.
 *
 * @param queryEmbedding – 768-dim vector from embedText()
 * @param conversationId – limit search to this conversation
 * @param topK           – how many results to return (default 10)
 * @param minSimilarity  – minimum similarity threshold 0–1 (default 0.5)
 */
export async function searchSimilarMessages(params: {
  queryEmbedding: EmbeddingVector;
  conversationId: string;
  topK?: number;
  minSimilarity?: number;
}): Promise<MessageEmbeddingRecord[]> {
  const sql = getNeonClient();
  const { queryEmbedding, conversationId, topK = 10, minSimilarity = 0.5 } = params;

  const vectorLiteral = `[${queryEmbedding.join(',')}]`;

  const rows = await sql`
    SELECT
      id,
      message_id        AS "messageId",
      conversation_id   AS "conversationId",
      content_text      AS "contentText",
      created_at        AS "createdAt",
      1 - (embedding <=> ${vectorLiteral}::vector) AS similarity
    FROM message_embeddings
    WHERE conversation_id = ${conversationId}
      AND 1 - (embedding <=> ${vectorLiteral}::vector) >= ${minSimilarity}
    ORDER BY embedding <=> ${vectorLiteral}::vector
    LIMIT ${topK}
  `;

  return rows as MessageEmbeddingRecord[];
}

/**
 * Semantic search across multiple conversations.
 */
export async function searchSimilarMessagesInConversations(params: {
  queryEmbedding: EmbeddingVector;
  conversationIds: string[];
  topK?: number;
  minSimilarity?: number;
}): Promise<MessageEmbeddingRecord[]> {
  const sql = getNeonClient();
  const { queryEmbedding, conversationIds, topK = 20, minSimilarity = 0.4 } = params;
  const scopedConversationIds = conversationIds
    .map((conversationId) => conversationId.trim())
    .filter(Boolean);

  if (scopedConversationIds.length === 0) {
    return [];
  }

  const vectorLiteral = `[${queryEmbedding.join(',')}]`;
  const conversationList = scopedConversationIds.join(',');

  const rows = await sql`
    SELECT
      id,
      message_id        AS "messageId",
      conversation_id   AS "conversationId",
      content_text      AS "contentText",
      created_at        AS "createdAt",
      1 - (embedding <=> ${vectorLiteral}::vector) AS similarity
    FROM message_embeddings
    WHERE conversation_id = ANY(string_to_array(${conversationList}, ','))
      AND 1 - (embedding <=> ${vectorLiteral}::vector) >= ${minSimilarity}
    ORDER BY embedding <=> ${vectorLiteral}::vector
    LIMIT ${topK}
  `;

  return rows as MessageEmbeddingRecord[];
}

export async function countMessageEmbeddings(conversationIds?: string[]): Promise<number> {
  const sql = getNeonClient();
  const scopedConversationIds = conversationIds
    ?.map((conversationId) => conversationId.trim())
    .filter(Boolean);

  if (scopedConversationIds && scopedConversationIds.length > 0) {
    const conversationList = scopedConversationIds.join(',');
    const rows = await sql`
      SELECT COUNT(*)::int AS count
      FROM message_embeddings
      WHERE conversation_id = ANY(string_to_array(${conversationList}, ','))
    `;
    return Number(rows[0]?.count ?? 0);
  }

  const rows = await sql`SELECT COUNT(*)::int AS count FROM message_embeddings`;
  return Number(rows[0]?.count ?? 0);
}

/**
 * Delete message embedding by MongoDB message ID.
 * Called when a message is deleted/recalled.
 */
export async function deleteMessageEmbedding(messageId: string): Promise<void> {
  const sql = getNeonClient();
  await sql`DELETE FROM message_embeddings WHERE message_id = ${messageId}`;
  logger.debug('[NeonVector] Deleted message embedding', { messageId });
}

/**
 * Bulk delete all embeddings for a conversation.
 * Called when a conversation is deleted.
 */
export async function deleteConversationEmbeddings(conversationId: string): Promise<void> {
  const sql = getNeonClient();
  const result = await sql`
    DELETE FROM message_embeddings WHERE conversation_id = ${conversationId}
  `;
  logger.info('[NeonVector] Deleted conversation embeddings', { conversationId, deleted: result });
}

// ─── User Profile Embeddings ──────────────────────────────────────────────────

/**
 * Upsert a user profile embedding (bio/description text).
 * Used for semantic user search.
 */
export async function upsertUserProfileEmbedding(params: {
  userId: string;
  bioText: string;
  embedding: EmbeddingVector;
}): Promise<void> {
  const sql = getNeonClient();
  const { userId, bioText, embedding } = params;
  const vectorLiteral = `[${embedding.join(',')}]`;

  await sql`
    INSERT INTO user_profile_embeddings (user_id, bio_text, embedding)
    VALUES (${userId}, ${bioText}, ${vectorLiteral}::vector)
    ON CONFLICT (user_id)
    DO UPDATE SET
      bio_text   = EXCLUDED.bio_text,
      embedding  = EXCLUDED.embedding,
      updated_at = NOW()
  `;

  logger.debug('[NeonVector] Upserted user profile embedding', { userId });
}

/**
 * Search for similar users by semantic similarity (e.g., for ZyncAI search_friends).
 */
export async function searchSimilarUsers(params: {
  queryEmbedding: EmbeddingVector;
  topK?: number;
  minSimilarity?: number;
}): Promise<UserProfileEmbeddingRecord[]> {
  const sql = getNeonClient();
  const { queryEmbedding, topK = 5, minSimilarity = 0.4 } = params;
  const vectorLiteral = `[${queryEmbedding.join(',')}]`;

  const rows = await sql`
    SELECT
      id,
      user_id  AS "userId",
      bio_text AS "bioText",
      1 - (embedding <=> ${vectorLiteral}::vector) AS similarity
    FROM user_profile_embeddings
    WHERE 1 - (embedding <=> ${vectorLiteral}::vector) >= ${minSimilarity}
    ORDER BY embedding <=> ${vectorLiteral}::vector
    LIMIT ${topK}
  `;

  return rows as UserProfileEmbeddingRecord[];
}
