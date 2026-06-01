/**
 * Keyword Filter – Fallback for when Gemini is unavailable.
 *
 * Covers common Vietnamese + English offensive patterns.
 * Designed to be fast (pure regex, no async) and fail-open (pass when uncertain).
 *
 * IMPORTANT: These patterns are intentionally conservative to minimize false-positives.
 * The AI model (Gemini) is the primary classifier; this is an emergency backup only.
 */

import type { ModerationLabel } from './moderation.model';

// ─── Pattern lists ────────────────────────────────────────────────────────────

/** Score thresholds matching AI-1 spec: < 0.3 safe, 0.3–0.7 warning, > 0.7 blocked */
interface KeywordRule {
  pattern: RegExp;
  label: ModerationLabel;
  confidence: number;
  reason: string;
}

const KEYWORD_RULES: KeywordRule[] = [
  // ── Blocked (high confidence, clear violations) ──────────────────────────

  // Tiếng Việt – nặng (Bao gồm không dấu, biến thể, viết tắt)
  {
    pattern: /\b(?:dị+t|đị+t|đ[.]ị[.]t|đ i t|đụ|d[ụu]|đ[.]ụ|l[ồoòỏõó]n|l[o0]z|l[.]o[.]z|cặ+c|cẹ+c|c[.]ặ[.]c|bu[ồo]i|b[.]u[.]ồ[.]i|chị+ch|đé+o|d[eé]o|đ[.]é[.]o|chó\s*chết|mẹ\s*mày|đm+|đmm|vkl|vcl|v[.]c[.]l|clgt|cc)\b/i,
    label: 'blocked',
    confidence: 0.85,
    reason: 'Vietnamese offensive language (tier-1)',
  },
  {
    pattern: /\b(?:giết|chém|đâm|bắn|gi[eế]t\s*ch[êế]t|gi[eế]t\s*m[àa]y|d[aạ]o\s*b[aầ]u)\b/i,
    label: 'blocked',
    confidence: 0.80,
    reason: 'Violent threat (Vietnamese)',
  },

  // English – blocked
  {
    pattern: /\b(?:fuck(?:ing|er|ers)?|shit|bitch|cunt|nigger|faggot|kys|kill\s*yourself)\b/i,
    label: 'blocked',
    confidence: 0.82,
    reason: 'English offensive language (tier-1)',
  },
  {
    pattern: /\b(?:bomb|terrorist|rape|molest(?:ed|ing)?|child\s*porn|cp)\b/i,
    label: 'blocked',
    confidence: 0.95,
    reason: 'Extremely harmful content',
  },

  // Spam / scam signals
  {
    pattern: /(?:click\s*here\s*now|free\s*money|win\s*\$|you(?:'ve|\s*have)\s*won|bank\s*account|send\s*me\s*your)/i,
    label: 'blocked',
    confidence: 0.75,
    reason: 'Potential spam or scam content',
  },

  // ── Warning (moderate, context-dependent) ─────────────────────────────────

  // Tiếng Việt – vừa (Bao gồm lóng)
  {
    pattern: /\b(?:ngu|khùng|điên|thằng|con\s*đĩ|mất\s*dạy|súc\s*vật|đồ\s*chó|óc\s*chó|trẻ\s*trâu|óc\s*c[ặa]c)\b/i,
    label: 'warning',
    confidence: 0.55,
    reason: 'Mildly offensive Vietnamese language',
  },

  // English – warning
  {
    pattern: /\b(?:damn|ass(?:hole)?|bastard|jerk|idiot|moron|loser|dumb(?:ass)?)\b/i,
    label: 'warning',
    confidence: 0.45,
    reason: 'Mildly offensive English language',
  },

  // Self-harm signals (flag for admin review, not block)
  {
    pattern: /\b(?:suicide|self.?harm|cut\s*myself|want\s*to\s*die|end\s*my\s*life|tự\s*tử|chết\s*đi)\b/i,
    label: 'warning',
    confidence: 0.65,
    reason: 'Potential self-harm signal — requires human review',
  },

  // Hate speech
  {
    pattern: /\b(?:hate\s*(?:you|all|every)|racist|homophobic|transphobic|phản\s*động)\b/i,
    label: 'warning',
    confidence: 0.50,
    reason: 'Potential hate speech',
  },
];

// ─── Public API ───────────────────────────────────────────────────────────────

export interface KeywordFilterResult {
  label: ModerationLabel;
  confidence: number;
  reason: string;
  matchedPattern?: string;
}

/**
 * Run keyword filter against provided text.
 * Returns the highest-severity match found, or 'safe' if none match.
 */
export function runKeywordFilter(text: string): KeywordFilterResult {
  if (!text || text.trim().length === 0) {
    return { label: 'safe', confidence: 0.1, reason: 'Empty content' };
  }

  // Cap to first 2000 chars for performance on very long messages
  const sample = text.slice(0, 2000);

  // Collect all matches, then pick highest severity
  const matches: KeywordFilterResult[] = [];

  for (const rule of KEYWORD_RULES) {
    if (rule.pattern.test(sample)) {
      matches.push({
        label: rule.label,
        confidence: rule.confidence,
        reason: rule.reason,
        matchedPattern: rule.pattern.source,
      });
    }
  }

  if (matches.length === 0) {
    return { label: 'safe', confidence: 0.1, reason: 'No violations detected (keyword filter)' };
  }

  // Pick highest severity: blocked > warning > safe, then highest confidence
  const labelOrder: Record<ModerationLabel, number> = { blocked: 2, warning: 1, safe: 0 };
  matches.sort((a, b) => {
    const labelDiff = labelOrder[b.label] - labelOrder[a.label];
    return labelDiff !== 0 ? labelDiff : b.confidence - a.confidence;
  });

  return matches[0]!;
}
