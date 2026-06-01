import type { IConversationMember } from '../../conversations/conversation-member.model';

export const PENALTY_WARNING_PERCENT = 2;
export const PENALTY_BLOCK_PERCENT = 5;
export const PENALTY_MUTE_DURATION_MS = 5 * 60 * 1000;
export const PENALTY_RESET_WINDOW_MS = 12 * 60 * 60 * 1000;

type PenaltyMemberState = Pick<IConversationMember, 'penaltyScore' | 'mutedUntil' | 'penaltyWindowStartedAt'>;

export function refreshPenaltyWindow(member: PenaltyMemberState, now: Date = new Date()): boolean {
  let changed = false;
  const currentScore = typeof member.penaltyScore === 'number' ? member.penaltyScore : 0;

  if (member.mutedUntil && member.mutedUntil <= now) {
    member.mutedUntil = undefined;
    changed = true;
  }

  if (member.penaltyWindowStartedAt) {
    const elapsedMs = now.getTime() - member.penaltyWindowStartedAt.getTime();
    if (elapsedMs >= PENALTY_RESET_WINDOW_MS) {
      if (currentScore !== 0) {
        member.penaltyScore = 0;
        changed = true;
      }
      if (member.mutedUntil) {
        member.mutedUntil = undefined;
        changed = true;
      }
      member.penaltyWindowStartedAt = undefined;
      changed = true;
    }
  }

  if ((member.penaltyScore ?? 0) > 0 && !member.penaltyWindowStartedAt) {
    member.penaltyWindowStartedAt = now;
    changed = true;
  }

  if ((member.penaltyScore ?? 0) <= 0 && member.penaltyWindowStartedAt && !member.mutedUntil) {
    member.penaltyWindowStartedAt = undefined;
    changed = true;
  }

  return changed;
}

export function applyPenaltyScore(
  member: PenaltyMemberState,
  amount: number,
  now: Date = new Date(),
): { mutedUntil: Date | null; becameMuted: boolean } {
  refreshPenaltyWindow(member, now);

  if (amount <= 0) {
    return { mutedUntil: member.mutedUntil ?? null, becameMuted: false };
  }

  if (!member.penaltyWindowStartedAt) {
    member.penaltyWindowStartedAt = now;
  }

  const currentScore = typeof member.penaltyScore === 'number' ? member.penaltyScore : 0;
  member.penaltyScore = Math.min(100, Math.max(0, currentScore + amount));

  let becameMuted = false;
  if (member.penaltyScore >= 100) {
    const mutedUntil = new Date(now.getTime() + PENALTY_MUTE_DURATION_MS);
    becameMuted = !member.mutedUntil || member.mutedUntil.getTime() < mutedUntil.getTime();
    member.mutedUntil = mutedUntil;
  }

  return {
    mutedUntil: member.mutedUntil ?? null,
    becameMuted,
  };
}