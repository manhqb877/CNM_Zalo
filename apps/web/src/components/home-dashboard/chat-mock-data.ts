import type { Message } from '@zync/shared-types';

// Mock data for exam scores conversation
// Scenario: Students discussing exam results

export const EXAM_SCORES_MOCK_MESSAGES: Message[] = [
  // Older messages - Yesterday
  {
    _id: 'msg-1',
    idempotencyKey: 'msg-1',
    conversationId: 'conv-1',
    senderId: 'user-linh',
    content: 'Mọi người ơi, điểm thi cuối kỳ đã có rồi!',
    type: 'text',
    status: 'read',
    createdAt: new Date(Date.now() - 86400000 + 3600000).toISOString(), // Yesterday 13:00
    replyTo: undefined,
    reactionSummary: undefined,
    readBy: [],
    sentTo: [],
    readByPreview: [],
  },
  {
    _id: 'msg-2',
    idempotencyKey: 'msg-2',
    conversationId: 'conv-1',
    senderId: 'user-minh',
    content: 'Thiệt hả? Để mình check thử...',
    type: 'text',
    status: 'read',
    createdAt: new Date(Date.now() - 86400000 + 3700000).toISOString(), // Yesterday 13:02
    replyTo: undefined,
    reactionSummary: undefined,
    readBy: [],
    sentTo: [],
    readByPreview: [],
  },
  {
    _id: 'msg-3',
    idempotencyKey: 'msg-3',
    conversationId: 'conv-1',
    senderId: 'user-minh',
    content: 'Ôi không! Mình được có 6 điểm thôi 😭',
    type: 'text',
    status: 'read',
    createdAt: new Date(Date.now() - 86400000 + 3900000).toISOString(), // Yesterday 13:05
    replyTo: {
      messageRef: 'msg-1',
      senderDisplayName: 'Linh',
      contentPreview: 'Mọi người ơi, điểm thi cuối kỳ đã có rồi!',
    },
    reactionSummary: {
      emojiCounts: { '😭': 2 },
      totalCount: 2,
    },
    readBy: [],
    sentTo: [],
    readByPreview: [],
  },
  {
    _id: 'msg-4',
    idempotencyKey: 'msg-4',
    conversationId: 'conv-1',
    senderId: 'user-linh',
    content: 'Ủa sao thấp vậy? Câu 1-5 dễ mà, mình được 9.5',
    type: 'text',
    status: 'read',
    createdAt: new Date(Date.now() - 86400000 + 4000000).toISOString(), // Yesterday 13:07
    replyTo: {
      messageRef: 'msg-3',
      senderDisplayName: 'Minh',
      contentPreview: 'Ôi không! Mình được có 6 điểm thôi 😭',
    },
    reactionSummary: {
      emojiCounts: { '😮': 1 },
      totalCount: 1,
    },
    readBy: [],
    sentTo: [],
    readByPreview: [],
  },
  {
    _id: 'msg-5',
    idempotencyKey: 'msg-5',
    conversationId: 'conv-1',
    senderId: 'user-hoa',
    content: 'Chia buồn Minh ơi, mình cũng chỉ được 7 điểm thôi',
    type: 'text',
    status: 'read',
    createdAt: new Date(Date.now() - 86400000 + 4200000).toISOString(), // Yesterday 13:10
    replyTo: {
      messageRef: 'msg-3',
      senderDisplayName: 'Minh',
      contentPreview: 'Ôi không! Mình được có 6 điểm thôi 😭',
    },
    reactionSummary: undefined,
    readBy: [],
    sentTo: [],
    readByPreview: [],
  },

  // Today's messages
  {
    _id: 'msg-6',
    idempotencyKey: 'msg-6',
    conversationId: 'conv-1',
    senderId: 'user-khanh',
    content: 'Mình được 8.5 nè! May quá 😌',
    type: 'text',
    status: 'read',
    createdAt: new Date(Date.now() - 3600000).toISOString(), // Today 13:00
    replyTo: {
      messageRef: 'msg-1',
      senderDisplayName: 'Linh',
      contentPreview: 'Mọi người ơi, điểm thi cuối kỳ đã có rồi!',
    },
    reactionSummary: {
      emojiCounts: { '🌐': 1, '❤️': 1 },
      totalCount: 2,
    },
    readBy: [],
    sentTo: [],
    readByPreview: [],
  },
  {
    _id: 'msg-7',
    idempotencyKey: 'msg-7',
    conversationId: 'conv-1',
    senderId: 'user-linh',
    content: 'Khanh giỏi quá! Phần logic mình sai hết, may mà phần lý thuyết cứu',
    type: 'text',
    status: 'read',
    createdAt: new Date(Date.now() - 3500000).toISOString(), // Today 13:05
    replyTo: {
      messageRef: 'msg-6',
      senderDisplayName: 'Khanh',
      contentPreview: 'Mình được 8.5 nè! May quá 😌',
    },
    reactionSummary: {
      emojiCounts: { '👍': 1 },
      totalCount: 1,
    },
    readBy: [],
    sentTo: [],
    readByPreview: [],
  },
  {
    _id: 'msg-8',
    idempotencyKey: 'msg-8',
    conversationId: 'conv-1',
    senderId: 'user-minh',
    content: 'Thầy có cho phúc khảo không vậy mọi người?',
    type: 'text',
    status: 'read',
    createdAt: new Date(Date.now() - 3400000).toISOString(), // Today 13:06
    reactionSummary: undefined,
    readBy: [],
    sentTo: [],
    readByPreview: [],
  },
  {
    _id: 'msg-9',
    idempotencyKey: 'msg-9',
    conversationId: 'conv-1',
    senderId: 'user-hoa',
    content: 'Có chứ! Hạn phúc khảo đến hết tuần này. Thầy bảo nếu sai ở phần trắc nghiệm thì sẽ được xem lại',
    type: 'text',
    status: 'read',
    createdAt: new Date(Date.now() - 3300000).toISOString(), // Today 13:07
    replyTo: {
      messageRef: 'msg-8',
      senderDisplayName: 'Minh',
      contentPreview: 'Thầy có cho phúc khảo không vậy mọi người?',
    },
    reactionSummary: {
      emojiCounts: { '🌐': 1 },
      totalCount: 1,
    },
    readBy: [],
    sentTo: [],
    readByPreview: [],
  },
  {
    _id: 'msg-10',
    idempotencyKey: 'msg-10',
    conversationId: 'conv-1',
    senderId: 'user-minh',
    content: 'Thế thì mình phải đi phúc khảo! Câu 12 mình chắc chắn đúng mà',
    type: 'text',
    status: 'read',
    createdAt: new Date(Date.now() - 3200000).toISOString(), // Today 13:08
    replyTo: {
      messageRef: 'msg-9',
      senderDisplayName: 'Hoa',
      contentPreview: 'Có chứ! Hạn phúc khảo đến hết tuần này...',
    },
    reactionSummary: {
      emojiCounts: { '👍': 1 },
      totalCount: 1,
    },
    readBy: [],
    sentTo: [],
    readByPreview: [],
  },
  {
    _id: 'msg-11',
    idempotencyKey: 'msg-11',
    conversationId: 'conv-1',
    senderId: 'user-khanh',
    content: 'Ai đi phúc khảo thì inbox mình, mình cũng muốn xem lại mấy câu tự luận',
    type: 'text',
    status: 'read',
    createdAt: new Date(Date.now() - 3100000).toISOString(), // Today 13:09
    reactionSummary: undefined,
    readBy: [],
    sentTo: [],
    readByPreview: [],
  },
  {
    _id: 'msg-12',
    idempotencyKey: 'msg-12',
    conversationId: 'conv-1',
    senderId: 'user-linh',
    content: 'Mình đi với! Lúc 3h chiều nay ở cổng khoa nhé',
    type: 'text',
    status: 'delivered',
    createdAt: new Date(Date.now() - 3000000).toISOString(), // Today 13:10
    replyTo: {
      messageRef: 'msg-11',
      senderDisplayName: 'Khanh',
      contentPreview: 'Ai đi phúc khảo thì inbox mình...',
    },
    reactionSummary: {
      emojiCounts: { '👍': 3, '❤️': 1 },
      totalCount: 4,
    },
    readBy: [],
    sentTo: [],
    readByPreview: [],
  },
  {
    _id: 'msg-13',
    idempotencyKey: 'msg-13',
    conversationId: 'conv-1',
    senderId: 'user-hoa',
    content: 'Okieee, mình cũng đi!',
    type: 'text',
    status: 'sent',
    createdAt: new Date(Date.now() - 2900000).toISOString(), // Today 13:11
    reactionSummary: undefined,
    readBy: [],
    sentTo: [],
    readByPreview: [],
  },
  {
    _id: 'msg-14',
    idempotencyKey: 'msg-14',
    conversationId: 'conv-1',
    senderId: 'user-minh',
    content: 'Perfect! Mình sẽ mang theo đề thi để đối chứng',
    type: 'text',
    status: 'sent',
    createdAt: new Date(Date.now() - 2800000).toISOString(), // Today 13:12
    replyTo: {
      messageRef: 'msg-12',
      senderDisplayName: 'Linh',
      contentPreview: 'Mình đi với! Lúc 3h chiều nay ở cổng khoa nhé',
    },
    reactionSummary: {
      emojiCounts: { '🌐': 1 },
      totalCount: 1,
    },
    readBy: [],
    sentTo: [],
    readByPreview: [],
  },
  // Current user's messages
  {
    _id: 'msg-15',
    idempotencyKey: 'msg-15',
    conversationId: 'conv-1',
    senderId: 'current-user',
    content: 'Mình được 8 điểm nè mọi người! 😊',
    type: 'text',
    status: 'read',
    createdAt: new Date(Date.now() - 2700000).toISOString(), // Today 13:13
    replyTo: {
      messageRef: 'msg-1',
      senderDisplayName: 'Linh',
      contentPreview: 'Mọi người ơi, điểm thi cuối kỳ đã có rồi!',
    },
    reactionSummary: {
      emojiCounts: { '👏': 2, '🌐': 1 },
      totalCount: 3,
    },
    readBy: [],
    sentTo: [],
    readByPreview: [],
  },
  {
    _id: 'msg-16',
    idempotencyKey: 'msg-16',
    conversationId: 'conv-1',
    senderId: 'current-user',
    content: 'Chỗ nào mình sai vậy?',
    type: 'text',
    status: 'read',
    createdAt: new Date(Date.now() - 2600000).toISOString(), // Today 13:14
    replyTo: {
      messageRef: 'msg-15',
      senderDisplayName: 'Minh',
      contentPreview: 'Mình được 8 điểm nè mọi người! 😊',
    },
    reactionSummary: undefined,
    readBy: [],
    sentTo: [],
    readByPreview: [],
  },
  {
    _id: 'msg-17',
    idempotencyKey: 'msg-17',
    conversationId: 'conv-1',
    senderId: 'user-linh',
    content: 'Câu 15 với câu 18 bạn sai rồi, mình nhớ là 2 câu đó mình cũng làm giống bạn',
    type: 'text',
    status: 'read',
    createdAt: new Date(Date.now() - 2500000).toISOString(), // Today 13:15
    replyTo: {
      messageRef: 'msg-16',
      senderDisplayName: 'Minh',
      contentPreview: 'Chỗ nào mình sai vậy?',
    },
    reactionSummary: {
      emojiCounts: { '😮': 1 },
      totalCount: 1,
    },
    readBy: [],
    sentTo: [],
    readByPreview: [],
  },
  {
    _id: 'msg-18',
    idempotencyKey: 'msg-18',
    conversationId: 'conv-1',
    senderId: 'current-user',
    content: 'Thiệt à? Thế mình cũng phải đi phúc khảo thôi 😅',
    type: 'text',
    status: 'delivered',
    createdAt: new Date(Date.now() - 2400000).toISOString(), // Today 13:16
    replyTo: {
      messageRef: 'msg-17',
      senderDisplayName: 'Linh',
      contentPreview: 'Câu 15 với câu 18 bạn sai rồi...',
    },
    reactionSummary: {
      emojiCounts: { '😂': 1 },
      totalCount: 1,
    },
    readBy: [],
    sentTo: [],
    readByPreview: [],
  },
  {
    _id: 'msg-19',
    idempotencyKey: 'msg-19',
    conversationId: 'conv-1',
    senderId: 'current-user',
    content: 'Gặp nhau lúc 3h nha mọi người!',
    type: 'text',
    status: 'sent',
    createdAt: new Date(Date.now() - 60000).toISOString(), // Just now
    reactionSummary: undefined,
    readBy: [],
    sentTo: [],
    readByPreview: [],
  },
];

// Mock user data for the conversation
export const EXAM_CONVERSATION_USERS = {
  'user-linh': {
    _id: 'user-linh',
    displayName: 'Linh',
    avatar: undefined,
    avatarUrl: undefined,
  },
  'user-minh': {
    _id: 'user-minh',
    displayName: 'Minh',
    avatar: undefined,
    avatarUrl: undefined,
  },
  'user-hoa': {
    _id: 'user-hoa',
    displayName: 'Hoa',
    avatar: undefined,
    avatarUrl: undefined,
  },
  'user-khanh': {
    _id: 'user-khanh',
    displayName: 'Khanh',
    avatar: undefined,
    avatarUrl: undefined,
  },
  'current-user': {
    _id: 'current-user',
    displayName: 'Bạn',
    avatar: undefined,
    avatarUrl: undefined,
  },
};
