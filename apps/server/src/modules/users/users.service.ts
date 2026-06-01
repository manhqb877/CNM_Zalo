import { Types } from 'mongoose';
import { UserModel, type IUser } from './user.model';
import { DeviceTokenModel } from './device-token.model';
import { FriendshipModel } from '../friends/friendship.model';
import { BadRequestError, NotFoundError } from '../../shared/errors';
import { getFriendsCount, getMutualFriendsCount } from '../friends/friends.service';
import { getIO } from '../../socket/gateway';
import { getFriendIds, getUserPresence } from './presence.service';
import type { UpdateProfileDto, UpsertDeviceTokenDto } from '../auth/auth.schema';
import type { UpdateAccountSettingsDto } from './users.schema';

/** Lấy profile của bản thân (đầy đủ thông tin) */
export async function getMe(userId: string): Promise<IUser> {
  const user = await UserModel.findById(userId);
  if (!user) throw new NotFoundError('User not found');
  return user;
}

/** Mask sensitive field: "user@example.com" → "us***@example.com" */
function maskEmail(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const [local, domain] = value.split('@');
  if (!local || !domain) return '***@***';
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}

function normalizeUsername(username: string): string {
  return username.trim().replace(/^@/, '').toLowerCase();
}

function isValidUsername(username: string): boolean {
  return /^[a-z0-9._]{3,30}$/.test(username);
}

export interface PublicUserProfile {
  _id: string;
  username?: string;
  displayName: string;
  avatarUrl?: string;
  bio?: string;
  skills?: string[];
  interests?: string[];
  githubUrl?: string;
  devRole?: string;
  emailMasked?: string;
  friendCount: number;
  mutualFriends: number;
  isFriend?: boolean;
  createdAt?: string;
}

/** Lấy profile công khai của người dùng khác (thông tin masked + friend count) */
export async function getUserById(
  userId: string,
  requesterId?: string,
): Promise<PublicUserProfile> {
  const user = await UserModel.findById(userId).select(
    'displayName username avatarUrl bio skills interests githubUrl devRole email createdAt',
  );
  if (!user) throw new NotFoundError('User not found');

  const [friendCount, mutualFriends] = await Promise.all([
    getFriendsCount(userId),
    requesterId && requesterId !== userId
      ? getMutualFriendsCount(requesterId, userId)
      : Promise.resolve(0),
  ]);

  const isFriend = requesterId && requesterId !== userId
    ? Boolean(await FriendshipModel.exists({
        userId: requesterId,
        friendId: userId,
        status: 'accepted',
      }))
    : false;

  return {
    _id: user._id.toString(),
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    skills: user.skills,
    interests: user.interests,
    githubUrl: user.githubUrl,
    devRole: user.devRole,
    emailMasked: maskEmail(user.email),
    friendCount,
    mutualFriends,
    isFriend,
    createdAt: (user as unknown as { createdAt?: Date }).createdAt?.toISOString(),
  };
}

/** Tìm user theo username/email cho luồng kết bạn */
export async function searchUsers(
  requesterId: string,
  keyword: string,
  limit: number,
): Promise<Array<{ id: string; username?: string; displayName: string; email?: string; avatarUrl?: string; bio?: string; skills?: string[]; devRole?: string }>> {
  const queryText = keyword.trim();
  if (queryText.length < 2) {
    throw new BadRequestError('Query must be at least 2 characters');
  }

  const safeLimit = Math.min(Math.max(limit, 1), 20);
  const normalizedQuery = queryText.startsWith('@') ? queryText.slice(1) : queryText;
  const escaped = normalizedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escaped, 'i');

  const users = await UserModel.find({
    _id: { $ne: new Types.ObjectId(requesterId) },
    /* Mặc định cho phép tìm (opt-out); user cũ không có field vẫn được tìm */
    allowSearchProfile: { $ne: false },
    $or: [
      { username: regex },
      { email: regex },
      { displayName: regex },
    ],
  })
    .select('username displayName email avatarUrl bio skills devRole')
    .limit(safeLimit)
    .lean();

  return users.map((user) => ({
    id: user._id.toString(),
    username: user.username as string | undefined,
    displayName: user.displayName as string,
    email: user.email as string | undefined,
    avatarUrl: user.avatarUrl as string | undefined,
    bio: user.bio as string | undefined,
    skills: user.skills as string[] | undefined,
    devRole: user.devRole as string | undefined,
  }));
}

/** Cập nhật profile của bản thân */
export async function updateProfile(
  userId: string,
  dto: UpdateProfileDto,
): Promise<IUser> {
  const updates: {
    username?: string;
    displayName?: string;
    avatarUrl?: string;
    bio?: string;
    skills?: string[];
    interests?: string[];
    githubUrl?: string;
    portfolioUrl?: string;
    linkedinUrl?: string;
    devRole?: string;
    onboardingCompleted?: boolean;
  } = {};

  if (dto.username !== undefined) {
    const normalizedUsername = normalizeUsername(dto.username);
    if (!isValidUsername(normalizedUsername)) {
      throw new BadRequestError('Username không hợp lệ. Chỉ dùng chữ thường, số, dấu chấm và gạch dưới (3-30 ký tự).');
    }

    const existedUser = await UserModel.findOne({
      username: normalizedUsername,
      _id: { $ne: new Types.ObjectId(userId) },
    }).select('_id').lean();

    if (existedUser) {
      throw new BadRequestError('Username đã tồn tại');
    }

    updates.username = normalizedUsername;
  }

  if (dto.displayName !== undefined) {
    updates.displayName = dto.displayName.trim();
  }

  if (dto.avatarUrl !== undefined) {
    updates.avatarUrl = dto.avatarUrl;
  }

  if (dto.bio !== undefined) {
    updates.bio = dto.bio.trim();
  }

  if (dto.skills !== undefined) updates.skills = dto.skills;
  if (dto.interests !== undefined) updates.interests = dto.interests;
  if (dto.githubUrl !== undefined) updates.githubUrl = dto.githubUrl;
  if (dto.portfolioUrl !== undefined) updates.portfolioUrl = dto.portfolioUrl;
  if (dto.linkedinUrl !== undefined) updates.linkedinUrl = dto.linkedinUrl;
  if (dto.devRole !== undefined) updates.devRole = dto.devRole;
  if (dto.onboardingCompleted !== undefined) updates.onboardingCompleted = dto.onboardingCompleted;

  if (Object.keys(updates).length === 0) {
    throw new BadRequestError('No valid profile fields to update');
  }

  const user = await UserModel.findByIdAndUpdate(
    userId,
    { $set: updates },
    { new: true, runValidators: true },
  );
  if (!user) throw new NotFoundError('User not found');
  return user;
}

/** Upsert device token cho push notification (FCM/APNs/Web Push) */
export async function upsertDeviceToken(
  userId: string,
  dto: UpsertDeviceTokenDto,
): Promise<void> {
  await DeviceTokenModel.findOneAndUpdate(
    { deviceToken: dto.deviceToken },
    { userId, deviceToken: dto.deviceToken, platform: dto.platform },
    { upsert: true, new: true },
  );
}

/** Xóa device token khi logout (dọn dẹp push subscription) */
export async function removeDeviceToken(
  userId: string,
  deviceToken: string,
): Promise<void> {
  await DeviceTokenModel.findOneAndDelete({ userId, deviceToken });
}

export interface AccountSettings {
  toastNotifications: boolean;
  allowSearchProfile: boolean;
  allowFriendRequest: boolean;
  allowMessagesFrom: 'everyone' | 'friends_only';
  showOnlineStatus: boolean;
}

type AccountSettingsFields = Pick<IUser, 'toastNotifications' | 'allowSearchProfile' | 'allowFriendRequest' | 'allowMessagesFrom' | 'showOnlineStatus'>;

function extractAccountSettings(user: AccountSettingsFields): AccountSettings {
  return {
    toastNotifications: user.toastNotifications ?? true,
    allowSearchProfile: user.allowSearchProfile ?? true,
    allowFriendRequest: user.allowFriendRequest ?? true,
    allowMessagesFrom: user.allowMessagesFrom ?? 'everyone',
    showOnlineStatus: user.showOnlineStatus ?? true,
  };
}

async function broadcastPresenceVisibility(userId: string, showOnlineStatus: boolean): Promise<void> {
  const io = getIO();
  if (!io) return;

  const friendIds = await getFriendIds(userId);
  if (friendIds.length === 0) return;

  if (!showOnlineStatus) {
    for (const friendId of friendIds) {
      io.to(`user:${friendId}`).emit('presence_changed', {
        userId,
        status: 'offline',
        lastSeen: null,
        hidden: true,
      });
    }
    return;
  }

  const presence = await getUserPresence(userId, userId);
  for (const friendId of friendIds) {
    io.to(`user:${friendId}`).emit('presence_changed', {
      userId,
      status: presence.online ? 'online' : 'offline',
      lastSeen: presence.online ? null : presence.lastSeen,
    });
  }
}

export async function getAccountSettings(userId: string): Promise<AccountSettings> {
  const user = await UserModel.findById(userId)
    .select('toastNotifications allowSearchProfile allowFriendRequest allowMessagesFrom showOnlineStatus')
    .lean();
  if (!user) throw new NotFoundError('User not found');
  return extractAccountSettings(user as unknown as AccountSettingsFields);
}

export async function updateAccountSettings(
  userId: string,
  dto: UpdateAccountSettingsDto,
): Promise<AccountSettings> {
  if (Object.keys(dto).length === 0) {
    throw new BadRequestError('No settings provided');
  }

  const before = await UserModel.findById(userId).select('showOnlineStatus').lean();
  if (!before) throw new NotFoundError('User not found');

  const updated = await UserModel.findByIdAndUpdate(
    userId,
    { $set: dto },
    { new: true, runValidators: true },
  ).select('toastNotifications allowSearchProfile allowFriendRequest allowMessagesFrom showOnlineStatus');

  if (!updated) throw new NotFoundError('User not found');

  if (dto.showOnlineStatus !== undefined && dto.showOnlineStatus !== (before as unknown as AccountSettingsFields).showOnlineStatus) {
    await broadcastPresenceVisibility(userId, dto.showOnlineStatus);
  }

  return extractAccountSettings(updated);
}

/** Khám phá developers nổi bật theo skills/tags */
export async function discoverUsers(
  requesterId: string,
): Promise<Array<{
  id: string;
  username?: string;
  displayName: string;
  avatarUrl?: string;
  bio?: string;
  skills?: string[];
  interests?: string[];
  devRole?: string;
  githubUrl?: string;
  friendCount: number;
}>> {
  const users = await UserModel.find({
    _id: { $ne: new Types.ObjectId(requesterId) },
    onboardingCompleted: true,
  })
    .select('username displayName avatarUrl bio skills interests devRole githubUrl')
    .sort({ trustScore: -1 })
    .limit(30)
    .lean();

  const results = await Promise.all(
    users.map(async (user) => {
      const friendCount = await getFriendsCount(user._id.toString());
      return {
        id: user._id.toString(),
        username: user.username as string | undefined,
        displayName: user.displayName as string,
        avatarUrl: user.avatarUrl as string | undefined,
        bio: user.bio as string | undefined,
        skills: user.skills as string[] | undefined,
        interests: user.interests as string[] | undefined,
        devRole: user.devRole as string | undefined,
        githubUrl: user.githubUrl as string | undefined,
        friendCount,
      };
    }),
  );

  return results;
}
