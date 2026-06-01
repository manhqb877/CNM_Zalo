import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import { logger } from '../shared/logger';

// ─── Singleton Neon SQL client ────────────────────────────────────────────────
let _sql: NeonQueryFunction<false, false> | null = null;

export function getNeonClient(): NeonQueryFunction<false, false> {
  if (_sql) return _sql;

  const databaseUrl = process.env['NEON_DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error(
      'NEON_DATABASE_URL is not set. Register at https://neon.tech and add the connection string to .env.',
    );
  }

  _sql = neon(databaseUrl);
  logger.info('[Neon] PostgreSQL client initialised (pgvector)');
  return _sql;
}

/**
 * Returns true when Neon is configured (NEON_DATABASE_URL is present).
 */
export function isNeonAvailable(): boolean {
  return !!process.env['NEON_DATABASE_URL'];
}

/**
 * Run the one-time SQL migration to set up pgvector extension and all
 * vector-related tables needed by AI modules.
 *
 * Safe to call on every startup – uses CREATE IF NOT EXISTS semantics.
 */
export async function runPgvectorMigration(): Promise<void> {
  const sql = getNeonClient();

  logger.info('[Neon] Running pgvector migration…');

  // 1. Enable pgvector extension
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;

  // 2. message_embeddings – stores per-message vector for semantic search
  await sql`
    CREATE TABLE IF NOT EXISTS message_embeddings (
      id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
      message_id    TEXT          NOT NULL,          -- ref to MongoDB ObjectId (string)
      conversation_id TEXT        NOT NULL,
      content_text  TEXT          NOT NULL,
      embedding     vector(768)   NOT NULL,           -- Gemini embedding output normalized to 768 dims
      created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    )
  `;

  // 3. HNSW index for fast cosine similarity search
  await sql`
    CREATE INDEX IF NOT EXISTS idx_message_embeddings_hnsw
    ON message_embeddings
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64)
  `;

  // 4. Index for conversation-scoped search
  await sql`
    CREATE INDEX IF NOT EXISTS idx_message_embeddings_conv
    ON message_embeddings (conversation_id, created_at DESC)
  `;

  await sql`
    DELETE FROM message_embeddings a
    USING message_embeddings b
    WHERE a.message_id = b.message_id
      AND a.ctid < b.ctid
  `;

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_message_embeddings_message_id_unique
    ON message_embeddings (message_id)
  `;

  // 5. moderation_vectors – optional; stores embedding of flagged content
  await sql`
    CREATE TABLE IF NOT EXISTS moderation_vectors (
      id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
      message_id    TEXT          NOT NULL,
      embedding     vector(768),
      label         TEXT          NOT NULL,           -- safe | warning | blocked
      confidence    FLOAT         NOT NULL,
      created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    )
  `;

  // 6. user_profile_embeddings – for user semantic search (AI-2)
  await sql`
    CREATE TABLE IF NOT EXISTS user_profile_embeddings (
      id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       TEXT          NOT NULL UNIQUE,
      bio_text      TEXT          NOT NULL,
      embedding     vector(768)   NOT NULL,
      updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_user_profile_embeddings_hnsw
    ON user_profile_embeddings
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64)
  `;

  logger.info('[Neon] pgvector migration complete ✓');
}
