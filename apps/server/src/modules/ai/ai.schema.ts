import { z } from 'zod';

// ─── Request Schemas ──────────────────────────────────────────────────────────

export const AIChatRequestSchema = z.object({
  message: z.string().min(1).max(4000),
  conversationId: z.string().optional(),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'model']),
        parts: z.array(z.object({ text: z.string() })),
      }),
    )
    .max(50)
    .optional()
    .default([]),
});

export const SearchRequestSchema = z.object({
  q: z.string().min(1).max(500),
  type: z.enum(['messages', 'users', 'all']).default('all'),
  conversationId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

// ─── Response types ───────────────────────────────────────────────────────────

export interface AIChatResponse {
  success: true;
  data: {
    reply: string;
    modelUsed: string;
    fromCache: boolean;
  };
}

export interface SearchResponse {
  success: true;
  data: {
    messages: unknown[];
    users: unknown[];
    totalCount: number;
  };
}
