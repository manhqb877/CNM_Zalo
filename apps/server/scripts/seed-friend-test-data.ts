import dotenv from 'dotenv';
import path from 'path';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { connectDatabase } from '../src/infrastructure/database';
import { UserModel } from '../src/modules/users/user.model';
import { FriendshipModel } from '../src/modules/friends/friendship.model';
import { ConversationModel } from '../src/modules/conversations/conversation.model';
import { ConversationMemberModel } from '../src/modules/conversations/conversation-member.model';
import { MessageModel } from '../src/modules/messages/message.model';
import { MessageStatusModel } from '../src/modules/messages/message-status.model';
import { logger } from '../src/shared/logger';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const DEFAULT_PASSWORD = 'anhnalanhat';

const USERS = {
  owner: {
    email: 'anhnalanhat1@gmail.com',
    phoneNumber: '+84900000001',
    displayName: 'TK1 Group Test',
    bio: 'Tai khoan test nhom 1',
  },
  friendA: {
    email: 'anhnalanhat2@gmail.com',
    phoneNumber: '+84900000002',
    displayName: 'TK2 Group Test',
    bio: 'Tai khoan test nhom 2',
  },
  friendB: {
    email: 'friend3.group.test@example.com',
    phoneNumber: '+84900000003',
    displayName: 'Friend 3',
    bio: 'Ban test so 3',
  },
  friendC: {
    email: 'friend4.group.test@example.com',
    phoneNumber: '+84900000004',
    displayName: 'Friend 4',
    bio: 'Ban test so 4',
  },
  incomingRequest: {
    email: 'friend5.group.test@example.com',
    phoneNumber: '+84900000005',
    displayName: 'Friend 5',
    bio: 'Ban test so 5',
  },
  blockedUser: {
    email: 'friend6.group.test@example.com',
    phoneNumber: '+84900000006',
    displayName: 'Friend 6',
    bio: 'Ban test so 6',
  },
};

type SeededUser = { _id: string; email: string; displayName: string };

async function upsertTestUser(
  payload: { email: string; phoneNumber: string; displayName: string; bio: string },
  passwordHash: string,
): Promise<SeededUser> {
  const user = await UserModel.findOneAndUpdate(
    { email: payload.email },
    {
      ...payload,
      passwordHash,
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    },
  );

  return {
    _id: user._id.toString(),
    email: user.email as string,
    displayName: user.displayName,
  };
}

async function clearScopedData(userIds: string[]): Promise<void> {
  await FriendshipModel.deleteMany({
    $or: [
      { userId: { $in: userIds } },
      { friendId: { $in: userIds } },
    ],
  });

  const scopedMembers = await ConversationMemberModel.find(
    { userId: { $in: userIds } },
    { conversationId: 1, _id: 0 },
  ).lean();

  const conversationIds = [...new Set(scopedMembers.map((item) => item.conversationId))];

  if (conversationIds.length > 0) {
    const scopedMessages = await MessageModel.find(
      { conversationId: { $in: conversationIds } },
      { _id: 1 },
    ).lean();

    const messageIds = scopedMessages.map((message) => message._id.toString());

    if (messageIds.length > 0) {
      await MessageStatusModel.deleteMany({ messageId: { $in: messageIds } });
    }

    await MessageModel.deleteMany({ conversationId: { $in: conversationIds } });
    await ConversationMemberModel.deleteMany({ conversationId: { $in: conversationIds } });
    await ConversationModel.deleteMany({ _id: { $in: conversationIds } });
  }
}

async function createDirectConversation(
  owner: SeededUser,
  friend: SeededUser,
  messages: Array<{ senderId: string; content: string; minutesAgo: number; statusForOwner?: 'sent' | 'delivered' | 'read' }>,
): Promise<void> {
  const sortedMessages = [...messages].sort((a, b) => b.minutesAgo - a.minutesAgo);
  const lastMessagePayload = sortedMessages[sortedMessages.length - 1];

  const conversation = await ConversationModel.create({
    type: 'direct',
    adminIds: [],
    lastMessage: {
      content: lastMessagePayload.content,
      senderId: lastMessagePayload.senderId,
      sentAt: new Date(Date.now() - lastMessagePayload.minutesAgo * 60 * 1000),
    },
    unreadCounts: {
      [owner._id]: messages.filter((item) => item.senderId === friend._id && item.statusForOwner !== 'read').length,
      [friend._id]: 0,
    },
  });

  const conversationId = conversation._id.toString();

  await ConversationMemberModel.insertMany([
    { conversationId, userId: owner._id, role: 'member' },
    { conversationId, userId: friend._id, role: 'member' },
  ]);

  const insertedMessages = await MessageModel.insertMany(
    sortedMessages.map((item) => ({
      conversationId,
      senderId: item.senderId,
      content: item.content,
      type: 'text',
      idempotencyKey: uuidv4(),
      createdAt: new Date(Date.now() - item.minutesAgo * 60 * 1000),
      updatedAt: new Date(Date.now() - item.minutesAgo * 60 * 1000),
    })),
  );

  const statuses = insertedMessages.flatMap((message, index) => {
    const source = sortedMessages[index];
    const statusForOwner = source.statusForOwner ?? 'read';
    const result = [
      { messageId: message._id.toString(), userId: friend._id, status: 'read' as const },
      { messageId: message._id.toString(), userId: owner._id, status: statusForOwner },
    ];
    return result;
  });

  await MessageStatusModel.insertMany(statuses);
}

async function createGroupConversation(
  owner: SeededUser,
  friendA: SeededUser,
  friendB: SeededUser,
  friendC: SeededUser,
): Promise<void> {
  const messageBlueprint = [
    { senderId: owner._id, content: 'Chao ca nha, toi vua tao nhom test.' },
    { senderId: friendA._id, content: 'Oke, toi vao day roi.' },
    { senderId: friendC._id, content: 'Toi se kiem tra luong notification.' },
    { senderId: friendB._id, content: 'Toi test gui tin nhan media tiep nha.' },
  ];

  const conversation = await ConversationModel.create({
    type: 'group',
    name: 'Nhom test chuc nang chat',
    avatarUrl: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61',
    createdBy: owner._id,
    adminIds: [owner._id, friendA._id],
    lastMessage: {
      content: messageBlueprint[messageBlueprint.length - 1].content,
      senderId: messageBlueprint[messageBlueprint.length - 1].senderId,
      sentAt: new Date(),
    },
    unreadCounts: {
      [owner._id]: 2,
      [friendA._id]: 1,
      [friendB._id]: 0,
      [friendC._id]: 0,
    },
  });

  const conversationId = conversation._id.toString();

  await ConversationMemberModel.insertMany([
    { conversationId, userId: owner._id, role: 'admin' },
    { conversationId, userId: friendA._id, role: 'admin' },
    { conversationId, userId: friendB._id, role: 'member' },
    { conversationId, userId: friendC._id, role: 'member' },
  ]);

  const insertedMessages = await MessageModel.insertMany(
    messageBlueprint.map((item, index) => ({
      conversationId,
      senderId: item.senderId,
      content: item.content,
      type: 'text',
      idempotencyKey: uuidv4(),
      createdAt: new Date(Date.now() - (messageBlueprint.length - index) * 60 * 1000),
      updatedAt: new Date(Date.now() - (messageBlueprint.length - index) * 60 * 1000),
    })),
  );

  await MessageStatusModel.insertMany(
    insertedMessages.flatMap((message) => [
      { messageId: message._id.toString(), userId: owner._id, status: 'read' as const },
      { messageId: message._id.toString(), userId: friendA._id, status: 'delivered' as const },
      { messageId: message._id.toString(), userId: friendB._id, status: 'read' as const },
      { messageId: message._id.toString(), userId: friendC._id, status: 'delivered' as const },
    ]),
  );
}

async function seedFriendTestData(): Promise<void> {
  try {
    await connectDatabase();
    logger.info('Connected to DB for friend test seeding...');

    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

    const [owner, friendA, friendB, friendC, incomingRequest, blockedUser] = await Promise.all([
      upsertTestUser(USERS.owner, passwordHash),
      upsertTestUser(USERS.friendA, passwordHash),
      upsertTestUser(USERS.friendB, passwordHash),
      upsertTestUser(USERS.friendC, passwordHash),
      upsertTestUser(USERS.incomingRequest, passwordHash),
      upsertTestUser(USERS.blockedUser, passwordHash),
    ]);

    const scopedUserIds = [
      owner._id,
      friendA._id,
      friendB._id,
      friendC._id,
      incomingRequest._id,
      blockedUser._id,
    ];

    await clearScopedData(scopedUserIds);

    await FriendshipModel.insertMany([
      { userId: owner._id, friendId: friendA._id, status: 'accepted' },
      { userId: friendA._id, friendId: owner._id, status: 'accepted' },
      { userId: owner._id, friendId: friendB._id, status: 'accepted' },
      { userId: friendB._id, friendId: owner._id, status: 'accepted' },
      { userId: owner._id, friendId: friendC._id, status: 'accepted' },
      { userId: friendC._id, friendId: owner._id, status: 'accepted' },
      { userId: incomingRequest._id, friendId: owner._id, status: 'pending' },
      { userId: owner._id, friendId: blockedUser._id, status: 'blocked' },
    ]);

    await createDirectConversation(owner, friendA, [
      {
        senderId: owner._id,
        content: 'Chao ban, minh dang test tin nhan 1-1',
        minutesAgo: 18,
        statusForOwner: 'read',
      },
      {
        senderId: friendA._id,
        content: 'OK, minh nhan duoc roi',
        minutesAgo: 15,
        statusForOwner: 'read',
      },
      {
        senderId: friendA._id,
        content: 'Toi se gui them 1 tin de test unread',
        minutesAgo: 4,
        statusForOwner: 'delivered',
      },
    ]);

    await createDirectConversation(owner, friendB, [
      {
        senderId: owner._id,
        content: 'Lich hop toi da gui trong file docs',
        minutesAgo: 28,
        statusForOwner: 'read',
      },
      {
        senderId: friendB._id,
        content: 'Da ro, de toi review',
        minutesAgo: 21,
        statusForOwner: 'read',
      },
      {
        senderId: owner._id,
        content: 'Cam on ban',
        minutesAgo: 5,
        statusForOwner: 'read',
      },
    ]);

    await createGroupConversation(owner, friendA, friendB, friendC);

    logger.info('Seed friend test data completed successfully');
    logger.info(`Tai khoan chinh: ${USERS.owner.email} | password: ${DEFAULT_PASSWORD}`);
    logger.info('Du lieu da tao: accepted/pending/blocked friendships, 2 direct convos, 1 group convo, message status.');
  } catch (error) {
    logger.error('Seed friend test data failed', error);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
}

void seedFriendTestData();
