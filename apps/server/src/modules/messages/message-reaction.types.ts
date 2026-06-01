export const REACTION_EMOJIS = ['👍', '❤️', '🤣', '😳', '😭', '😡'] as const;

export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export const REACTION_ACTION_SOURCES = ['picker-select', 'trigger-click'] as const;

export type ReactionActionSource = (typeof REACTION_ACTION_SOURCES)[number];

export type ReactionAction = 'upsert' | 'remove_all_mine';

export const REACTION_CONTRACT_VERSION = 'reaction-v1' as const;
