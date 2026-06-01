import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { connectDatabase } from '../src/infrastructure/database';
import { UserModel } from '../src/modules/users/user.model';
import { FriendshipModel } from '../src/modules/friends/friendship.model';
import { ConversationModel } from '../src/modules/conversations/conversation.model';
import { ConversationMemberModel } from '../src/modules/conversations/conversation-member.model';
import { MessageModel, type MessageType } from '../src/modules/messages/message.model';
import { MessageStatusModel, type MessageStatusValue } from '../src/modules/messages/message-status.model';
import { logger } from '../src/shared/logger';

type SeedUserInput = {
  displayName: string;
  username: string;
  email: string;
};

const DEFAULT_PASSWORD = '12345678';

const SEED_USERS: SeedUserInput[] = [
  {
    displayName: 'Nguyễn Thanh Bình',
    username: 'binhdev',
    email: 'thanhbinhfit2004@gmail.com',
  },
  {
    displayName: 'Nguyễn Minh Du',
    username: 'minhdu',
    email: 'mock',
  },
  {
    displayName: 'Bùi Quang Minh',
    username: 'quangminh',
    email: 'mock',
  },
  {
    displayName: 'Dương Nhật Anh',
    username: 'nhatanh',
    email: 'mock',
  },
  {
    displayName: 'Lê Thu Linh',
    username: 'thulinh',
    email: 'mock',
  },
];

type SeededUser = {
  id: string;
  displayName: string;
  username: string;
  email: string;
};

type DirectSeedMessage = {
  senderId: string;
  content?: string;
  type?: MessageType;
  mediaUrl?: string;
  minutesAgo: number;
  receiverStatus?: Exclude<MessageStatusValue, 'sent'>;
};

type GroupSeedMessage = {
  senderId: string;
  content?: string;
  type?: MessageType;
  mediaUrl?: string;
  minutesAgo: number;
  readByUserIds?: string[];
};

function normalizeUsername(rawUsername: string): string {
  return rawUsername.trim().replace(/^@/, '').toLowerCase();
}

function resolveEmail(rawEmail: string, normalizedUsername: string): string {
  const email = rawEmail.trim().toLowerCase();
  if (email === 'mock') {
    return `${normalizedUsername}@zync.dev`;
  }

  return email;
}

async function clearScopedData(userIds: string[]): Promise<void> {
  await FriendshipModel.deleteMany({
    $or: [{ userId: { $in: userIds } }, { friendId: { $in: userIds } }],
  });

  const memberships = await ConversationMemberModel.find(
    { userId: { $in: userIds } },
    { conversationId: 1, _id: 0 },
  ).lean();

  const conversationIds = [...new Set(memberships.map((item) => item.conversationId))];
  if (conversationIds.length === 0) {
    return;
  }

  const messages = await MessageModel.find(
    { conversationId: { $in: conversationIds } },
    { _id: 1 },
  ).lean();

  const messageIds = messages.map((message) => message._id.toString());
  if (messageIds.length > 0) {
    await MessageStatusModel.deleteMany({ messageId: { $in: messageIds } });
  }

  await MessageModel.deleteMany({ conversationId: { $in: conversationIds } });
  await ConversationMemberModel.deleteMany({ conversationId: { $in: conversationIds } });
  await ConversationModel.deleteMany({ _id: { $in: conversationIds } });
}

async function deleteSeedUsers(userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;
  await UserModel.deleteMany({ _id: { $in: userIds } });
  logger.info(`Deleted ${userIds.length} seed users`);
}

async function createDirectConversation(
  userA: SeededUser,
  userB: SeededUser,
  messages: DirectSeedMessage[],
): Promise<void> {
  const sortedMessages = [...messages].sort((a, b) => b.minutesAgo - a.minutesAgo);
  const latestMessage = sortedMessages[sortedMessages.length - 1];

  const unreadForA = sortedMessages.filter(
    (message) => message.senderId === userB.id && (message.receiverStatus ?? 'read') !== 'read',
  ).length;
  const unreadForB = sortedMessages.filter(
    (message) => message.senderId === userA.id && (message.receiverStatus ?? 'read') !== 'read',
  ).length;

  const conversation = await ConversationModel.create({
    type: 'direct',
    adminIds: [],
    lastMessage: {
      content: latestMessage.content ?? '',
      senderId: latestMessage.senderId,
      sentAt: new Date(Date.now() - latestMessage.minutesAgo * 60 * 1000),
    },
    unreadCounts: {
      [userA.id]: unreadForA,
      [userB.id]: unreadForB,
    },
  });

  const conversationId = conversation._id.toString();
  await ConversationMemberModel.insertMany([
    { conversationId, userId: userA.id, role: 'member' },
    { conversationId, userId: userB.id, role: 'member' },
  ]);

  const insertedMessages = await MessageModel.insertMany(
    sortedMessages.map((message) => ({
      conversationId,
      senderId: message.senderId,
      content: message.content,
      type: message.type ?? 'text',
      mediaUrl: message.mediaUrl,
      idempotencyKey: uuidv4(),
      createdAt: new Date(Date.now() - message.minutesAgo * 60 * 1000),
      updatedAt: new Date(Date.now() - message.minutesAgo * 60 * 1000),
    })),
  );

  const statuses = insertedMessages.flatMap((message, index) => {
    const source = sortedMessages[index];
    const senderId = source.senderId;
    const receiverId = senderId === userA.id ? userB.id : userA.id;
    const receiverStatus = source.receiverStatus ?? 'read';

    return [
      { messageId: message._id.toString(), userId: senderId, status: 'read' as const },
      { messageId: message._id.toString(), userId: receiverId, status: receiverStatus },
    ];
  });

  await MessageStatusModel.insertMany(statuses);
}

async function createGroupConversation(
  owner: SeededUser,
  members: SeededUser[],
  messages: GroupSeedMessage[],
): Promise<void> {
  const sortedMessages = [...messages].sort((a, b) => b.minutesAgo - a.minutesAgo);
  const latestMessage = sortedMessages[sortedMessages.length - 1];
  const participantIds = [owner.id, ...members.map((member) => member.id)];

  const unreadCounts = participantIds.reduce<Record<string, number>>((acc, participantId) => {
    const unreadCount = sortedMessages.filter((message) => {
      if (message.senderId === participantId) {
        return false;
      }

      const isRead = message.readByUserIds?.includes(participantId) ?? false;
      return !isRead;
    }).length;

    acc[participantId] = unreadCount;
    return acc;
  }, {});

  const conversation = await ConversationModel.create({
    type: 'group',
    name: 'Zync Core Team',
    createdBy: owner.id,
    adminIds: [owner.id],
    lastMessage: {
      content: latestMessage.content ?? '',
      senderId: latestMessage.senderId,
      sentAt: new Date(Date.now() - latestMessage.minutesAgo * 60 * 1000),
    },
    unreadCounts,
  });

  const conversationId = conversation._id.toString();
  await ConversationMemberModel.insertMany([
    { conversationId, userId: owner.id, role: 'admin' },
    ...members.map((member) => ({
      conversationId,
      userId: member.id,
      role: 'member' as const,
    })),
  ]);

  const insertedMessages = await MessageModel.insertMany(
    sortedMessages.map((message) => ({
      conversationId,
      senderId: message.senderId,
      content: message.content,
      type: message.type ?? 'text',
      mediaUrl: message.mediaUrl,
      idempotencyKey: uuidv4(),
      createdAt: new Date(Date.now() - message.minutesAgo * 60 * 1000),
      updatedAt: new Date(Date.now() - message.minutesAgo * 60 * 1000),
    })),
  );

  const statuses = insertedMessages.flatMap((message, index) => {
    const source = sortedMessages[index];
    const readBySet = new Set(source.readByUserIds ?? []);

    return participantIds.map((participantId) => ({
      messageId: message._id.toString(),
      userId: participantId,
      status:
        participantId === source.senderId || readBySet.has(participantId)
          ? ('read' as const)
          : ('delivered' as const),
    }));
  });

  await MessageStatusModel.insertMany(statuses);
}

async function seedUsers(): Promise<void> {
  try {
    await connectDatabase();
    logger.info('Connected to DB for user seed');

    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

    // Step 1: Upsert users (so we can collect their IDs), then hard-delete them
    const tempUsers: SeededUser[] = [];
    for (const item of SEED_USERS) {
      const username = normalizeUsername(item.username);
      const email = resolveEmail(item.email, username);

      const user = await UserModel.findOneAndUpdate(
        { email },
        {
          $set: {
            email,
            username,
            displayName: item.displayName.trim(),
            bio: `Tài khoản seed cho ${item.displayName.trim()}`,
            passwordHash,
          },
          $unset: { avatarUrl: 1 },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );

      tempUsers.push({
        id: user._id.toString(),
        displayName: user.displayName,
        username: user.username ?? username,
        email: user.email,
      });
    }

    // Hard-delete all seed users so they get recreated fresh with correct schema
    await deleteSeedUsers(tempUsers.map((u) => u.id));

    // Step 2: Create fresh users with explicit passwordHash + onboardingCompleted
    const recreatedUsers: SeededUser[] = [];
    const usersByUsername = new Map<string, SeededUser>();

    for (const item of SEED_USERS) {
      const username = normalizeUsername(item.username);
      const email = resolveEmail(item.email, username);

      const user = await UserModel.create({
        email,
        username,
        displayName: item.displayName.trim(),
        bio: `Tài khoản seed cho ${item.displayName.trim()}`,
        passwordHash,
        onboardingCompleted: false,
      });

      const seededUser: SeededUser = {
        id: user._id.toString(),
        displayName: user.displayName,
        username: user.username ?? username,
        email: user.email,
      };

      recreatedUsers.push(seededUser);
      usersByUsername.set(username, seededUser);
    }

    const freshBinhdev = usersByUsername.get('binhdev');
    const freshMinhdu = usersByUsername.get('minhdu');
    const freshQuangminh = usersByUsername.get('quangminh');
    const freshNhatanh = usersByUsername.get('nhatanh');
    const freshThulinh = usersByUsername.get('thulinh');

    if (!freshBinhdev || !freshMinhdu || !freshQuangminh || !freshNhatanh || !freshThulinh) {
      throw new Error('Thiếu user seed bắt buộc để tạo dữ liệu quan hệ/chat');
    }

    // Step 3: Clear related data and create relationships + conversations
    await clearScopedData(recreatedUsers.map((u) => u.id));

    await FriendshipModel.insertMany([
      { userId: freshBinhdev.id, friendId: freshMinhdu.id, status: 'accepted' },
      { userId: freshMinhdu.id, friendId: freshBinhdev.id, status: 'accepted' },

      { userId: freshBinhdev.id, friendId: freshQuangminh.id, status: 'accepted' },
      { userId: freshQuangminh.id, friendId: freshBinhdev.id, status: 'accepted' },

      { userId: freshNhatanh.id, friendId: freshBinhdev.id, status: 'pending' },
      { userId: freshBinhdev.id, friendId: freshThulinh.id, status: 'blocked' },
    ]);

    await createDirectConversation(freshBinhdev, freshMinhdu, [
      {
        senderId: freshBinhdev.id,
        content: 'Hello Du, chiều nay review roadmap nhé.',
        minutesAgo: 95,
        receiverStatus: 'read',
      },
      {
        senderId: freshMinhdu.id,
        content: 'Ok Bình, mình đã cập nhật xong phần auth.',
        minutesAgo: 84,
        receiverStatus: 'read',
      },
      {
        senderId: freshBinhdev.id,
        content: 'Mình gửi bạn ảnh flow mới.',
        type: 'image',
        mediaUrl: 'https://res.cloudinary.com/binhdev/image/upload/v1775438102/media/nuuxxnjehlizhhxvam45.jpg',
        minutesAgo: 42,
        receiverStatus: 'read',
      },
      {
        senderId: freshMinhdu.id,
        content: 'Đã nhận, mình sẽ phản hồi trong tối nay.',
        minutesAgo: 12,
        receiverStatus: 'delivered',
      },
    ]);

    await createDirectConversation(freshBinhdev, freshQuangminh, [
      {
        senderId: freshQuangminh.id,
        content: 'Mình vừa push branch friends-search.',
        minutesAgo: 130,
        receiverStatus: 'read',
      },
      {
        senderId: freshBinhdev.id,
        content: 'Good job, để mình test trên mobile luôn.',
        minutesAgo: 110,
        receiverStatus: 'read',
      },
      {
        senderId: freshQuangminh.id,
        content: 'Ok, có bug gì báo mình fix ngay.',
        minutesAgo: 9,
        receiverStatus: 'delivered',
      },
    ]);

    await createGroupConversation(
      freshBinhdev,
      [freshMinhdu, freshQuangminh, freshNhatanh],
      [
        {
          senderId: freshBinhdev.id,
          content: 'Chào team, hôm nay mình chốt kế hoạch release.',
          minutesAgo: 170,
          readByUserIds: [freshMinhdu.id, freshQuangminh.id, freshNhatanh.id],
        },
        {
          senderId: freshNhatanh.id,
          content: 'Em đang test luồng upload media cho app.',
          minutesAgo: 120,
          readByUserIds: [freshBinhdev.id, freshMinhdu.id],
        },
        {
          senderId: freshQuangminh.id,
          content: 'Mình gửi file checklist QC vào nhóm.',
          type: 'file/checklist-qc.xlsx',
          mediaUrl: 'https://res.cloudinary.com/binhdev/image/upload/v1775438102/media/nuuxxnjehlizhhxvam45.jpg',
          minutesAgo: 55,
          readByUserIds: [freshBinhdev.id],
        },
        {
          senderId: freshMinhdu.id,
          content: 'Ok, mình sẽ follow checklist và báo lại.',
          minutesAgo: 7,
          readByUserIds: [freshBinhdev.id],
        },
      ],
    );

    logger.info('Seed users completed successfully');
    logger.info(`Mật khẩu chung: ${DEFAULT_PASSWORD}`);
    for (const user of recreatedUsers) {
      logger.info(`- ${user.displayName} | @${user.username} | ${user.email}`);
    }
    logger.info('Đã tạo dữ liệu đa dạng: bạn bè accepted/pending/blocked, chat 1-1, nhóm và lịch sử tin nhắn.');
    logger.info('Luồng đăng nhập: Email + Mật khẩu + OTP (yêu cầu mã OTP sau khi nhập mật khẩu)');
  } catch (error) {
    logger.error('Seed users failed', error);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
}

void seedUsers();
