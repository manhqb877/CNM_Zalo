import { Types } from 'mongoose';
import { ConversationMemberModel } from '../conversations/conversation-member.model';
import { ConversationModel, type IConversation } from '../conversations/conversation.model';
import { FriendshipModel } from '../friends/friendship.model';
import { UserModel } from '../users/user.model';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../shared/errors';
import { getIO } from '../../socket/gateway';
import { produceNotificationEvent } from '../notifications/notifications.service';
import { logger } from '../../shared/logger';
import { MessagesService } from '../messages/messages.service';

interface GroupUpdatedPayload {
  groupId: string;
  type: 'created' | 'name_changed' | 'avatar_changed' | 'member_added' | 'member_removed' | 'role_changed' | 'member_approval_changed' | 'disbanded';
  data: Record<string, unknown>;
}

interface GroupSummary {
  _id: string;
  type: 'group';
  name?: string;
  avatarUrl?: string;
  createdBy: string;
  adminIds: string[];
  memberApprovalEnabled: boolean;
  category?: string;
  tags?: string[];
  description?: string;
  rules?: string;
  isPublic?: boolean;
  memberCount?: number;
  users: Array<{ _id: string; displayName: string; avatarUrl?: string }>;
  updatedAt: Date;
}

function assertObjectId(id: string, fieldName: string): void {
  if (!Types.ObjectId.isValid(id)) {
    throw new BadRequestError(`Invalid ${fieldName}`);
  }
}

async function getGroupOrThrow(groupId: string): Promise<IConversation> {
  assertObjectId(groupId, 'group id');
  const group = await ConversationModel.findById(groupId);
  if (!group || group.type !== 'group') {
    throw new NotFoundError('Group not found');
  }
  return group;
}

async function isGroupMember(groupId: string, userId: string): Promise<boolean> {
  const member = await ConversationMemberModel.exists({
    conversationId: groupId,
    userId,
  });
  return Boolean(member);
}

async function ensureGroupMember(groupId: string, userId: string): Promise<void> {
  const member = await isGroupMember(groupId, userId);
  if (!member) {
    throw new ForbiddenError('You are not a member of this group');
  }
}

function getGroupCreatorId(group: IConversation): string {
  return group.createdBy ?? group.adminIds[0] ?? '';
}

function ensureGroupCreator(group: IConversation, userId: string): void {
  const creatorId = getGroupCreatorId(group);
  if (!creatorId || creatorId !== userId) {
    throw new ForbiddenError('Only group creator can perform this action');
  }
}

function ensureGroupAdmin(group: IConversation, userId: string): void {
  const creatorId = getGroupCreatorId(group);
  const isAdmin = group.adminIds.includes(userId);
  if (creatorId !== userId && !isAdmin) {
    throw new ForbiddenError('Only group admin can perform this action');
  }
}

async function ensureUsersExist(userIds: string[]): Promise<void> {
  const uniqueIds = Array.from(new Set(userIds));
  if (uniqueIds.length === 0) {
    return;
  }

  uniqueIds.forEach((id) => assertObjectId(id, 'user id'));

  const count = await UserModel.countDocuments({ _id: { $in: uniqueIds } });
  if (count !== uniqueIds.length) {
    throw new BadRequestError('One or more users do not exist');
  }
}

async function ensureFriendship(currentUserId: string, memberIds: string[]): Promise<void> {
  if (memberIds.length === 0) {
    return;
  }

  const links = await FriendshipModel.find({
    userId: currentUserId,
    friendId: { $in: memberIds },
    status: 'accepted',
  }).select('friendId').lean();

  const friendSet = new Set(links.map((f) => f.friendId));
  const notFriends = memberIds.filter((id) => !friendSet.has(id));
  if (notFriends.length > 0) {
    throw new ForbiddenError('Only friends can be added to a group');
  }
}

async function buildGroupSummary(groupId: string): Promise<GroupSummary> {
  const group = await getGroupOrThrow(groupId);
  const members = await ConversationMemberModel.find({ conversationId: groupId }).lean();
  const memberIds = members.map((m) => m.userId);
  const users = await UserModel.find({ _id: { $in: memberIds } }, 'displayName avatarUrl').lean();

  const normalizedUsers = users.map((u) => ({
    _id: u._id.toString(),
    displayName: u.displayName as string,
    avatarUrl: u.avatarUrl as string | undefined,
  }));

  return {
    _id: group._id.toString(),
    type: 'group',
    name: group.name,
    avatarUrl: group.avatarUrl,
    createdBy: getGroupCreatorId(group),
    adminIds: group.adminIds,
    memberApprovalEnabled: Boolean(group.memberApprovalEnabled),
    category: group.category,
    tags: group.tags,
    description: group.description,
    rules: group.rules,
    isPublic: group.isPublic,
    memberCount: group.memberCount,
    users: normalizedUsers,
    updatedAt: group.updatedAt,
  };
}

function emitGroupUpdated(memberUserIds: string[], payload: GroupUpdatedPayload): void {
  const io = getIO();
  if (!io) {
    return;
  }

  const uniqueUserIds = Array.from(new Set(memberUserIds));
  for (const memberId of uniqueUserIds) {
    io.to(`user:${memberId}`).emit('group_updated', payload);
  }
}

async function getGroupMemberIds(groupId: string): Promise<string[]> {
  const members = await ConversationMemberModel.find({ conversationId: groupId }).lean();
  return members.map((m) => m.userId);
}

async function createAndEmitGroupSystemMessage(
  groupId: string,
  senderId: string,
  content: string,
  recipientUserIds: string[],
): Promise<void> {
  try {
    const idempotencyKey = `group-system-${new Types.ObjectId().toString()}`;
    const message = await MessagesService.insertMessageWithMetadata(
      groupId,
      senderId,
      content,
      'text',
      idempotencyKey,
    );

    const io = getIO();
    if (!io) {
      return;
    }

    const messageId = message._id.toString();
    const createdAt = message.createdAt instanceof Date
      ? message.createdAt.toISOString()
      : new Date(message.createdAt).toISOString();

    const uniqueRecipientIds = Array.from(new Set(recipientUserIds));
    for (const recipientUserId of uniqueRecipientIds) {
      io.to(`user:${recipientUserId}`).emit('receive_message', {
        messageId,
        conversationId: groupId,
        senderId,
        content,
        type: 'text',
        idempotencyKey,
        createdAt,
      });
    }
  } catch (err) {
    logger.error('Failed to create or emit group system message', err);
  }
}

async function notifyGroupRecipients(input: {
  recipientIds: string[];
  actorId: string;
  groupId: string;
  groupName?: string;
  type?: 'group_invite' | 'group_update';
  title: string;
  body: (actorName: string, groupName: string) => string;
  excludeIds?: string[];
  action?: string;
}): Promise<void> {
  const uniqueRecipientIds = Array.from(new Set(input.recipientIds))
    .filter((id) => id && !input.excludeIds?.includes(id));

  if (uniqueRecipientIds.length === 0) {
    return;
  }

  try {
    const actor = await UserModel.findById(input.actorId).select('displayName').lean();
    const actorName = (actor?.displayName as string) ?? 'Một thành viên';
    const groupName = input.groupName?.trim() || 'nhóm';

    await Promise.allSettled(uniqueRecipientIds.map((recipientId) =>
      produceNotificationEvent({
        userId: recipientId,
        type: input.type ?? 'group_update',
        title: input.title,
        body: input.body(actorName, groupName),
        conversationId: input.groupId,
        fromUserId: input.actorId,
        data: {
          conversationId: input.groupId,
          conversationName: groupName,
          action: input.action ?? 'open_chat',
        },
      }),
    ));
  } catch (err) {
    logger.error('Failed to produce group notifications', err);
  }
}

export class GroupsService {
  static async createGroup(
    creatorId: string,
    input: { name: string; avatarUrl?: string; memberIds?: string[]; category?: string; tags?: string[]; description?: string; rules?: string; isPublic?: boolean },
  ): Promise<GroupSummary> {
    const uniqueMembers = Array.from(new Set((input.memberIds || []).filter((id) => id !== creatorId)));

    if (!input.isPublic && uniqueMembers.length < 2) {
      throw new BadRequestError('Group requires at least 2 selected members');
    }

    if (uniqueMembers.length > 100) {
      throw new BadRequestError('Maximum 100 selected members');
    }

    await ensureUsersExist(uniqueMembers);
    await ensureFriendship(creatorId, uniqueMembers);

    const group = await ConversationModel.create({
      type: 'group',
      name: input.name.trim(),
      avatarUrl: input.avatarUrl,
      createdBy: creatorId,
      adminIds: [creatorId],
      memberApprovalEnabled: false,
      unreadCounts: new Map<string, number>(),
      category: input.category || 'general',
      tags: input.tags || [],
      description: input.description || '',
      rules: input.rules || '',
      isPublic: input.isPublic || false,
      memberCount: 1 + uniqueMembers.length,
    });

    await ConversationMemberModel.insertMany([
      { conversationId: group._id.toString(), userId: creatorId, role: 'admin' },
      ...uniqueMembers.map((memberId) => ({
        conversationId: group._id.toString(),
        userId: memberId,
        role: 'member' as const,
      })),
    ]);

    const summary = await buildGroupSummary(group._id.toString());
    emitGroupUpdated(summary.users.map((u) => u._id), {
      groupId: summary._id,
      type: 'created',
      data: { group: summary },
    });

    void notifyGroupRecipients({
      recipientIds: uniqueMembers,
      actorId: creatorId,
      groupId: summary._id,
      groupName: summary.name,
      type: 'group_invite',
      title: 'Được thêm vào nhóm',
      body: (actorName, groupName) => `${actorName} đã thêm bạn vào nhóm ${groupName}`,
    });

    return summary;
  }

  static async updateGroup(
    currentUserId: string,
    groupId: string,
    input: { name?: string; avatarUrl?: string | null },
  ): Promise<GroupSummary> {
    const group = await getGroupOrThrow(groupId);
    await ensureGroupMember(groupId, currentUserId);

    const changedFields: Array<'name_changed' | 'avatar_changed'> = [];

    if (input.name !== undefined) {
      group.name = input.name.trim();
      changedFields.push('name_changed');
    }

    if (input.avatarUrl !== undefined) {
      group.avatarUrl = input.avatarUrl ?? undefined;
      changedFields.push('avatar_changed');
    }

    if (changedFields.length === 0) {
      throw new BadRequestError('No changes to update');
    }

    await group.save();

    const summary = await buildGroupSummary(groupId);
    const memberIds = summary.users.map((u) => u._id);
    changedFields.forEach((eventType) => {
      emitGroupUpdated(memberIds, {
        groupId,
        type: eventType,
        data: {
          name: summary.name,
          avatarUrl: summary.avatarUrl,
          updatedBy: currentUserId,
        },
      });
    });

    const title = changedFields.includes('name_changed') && changedFields.includes('avatar_changed')
      ? 'Thông tin nhóm đã được cập nhật'
      : changedFields.includes('name_changed')
        ? 'Tên nhóm đã được cập nhật'
        : 'Ảnh nhóm đã được cập nhật';

    void notifyGroupRecipients({
      recipientIds: memberIds,
      actorId: currentUserId,
      groupId,
      groupName: summary.name,
      title,
      body: (actorName, groupName) => `${actorName} đã cập nhật ${groupName}`,
      excludeIds: [currentUserId],
    });

    return summary;
  }

  static async addMembers(
    currentUserId: string,
    groupId: string,
    memberIds: string[],
  ): Promise<GroupSummary> {
    const group = await getGroupOrThrow(groupId);
    await ensureGroupMember(groupId, currentUserId);

    const creatorId = getGroupCreatorId(group);
    const isAdmin = group.adminIds.includes(currentUserId);
    if (Boolean(group.memberApprovalEnabled) && currentUserId !== creatorId) {
      throw new ForbiddenError('Nhóm đang bật duyệt thành viên. Chỉ chủ nhóm mới có thể duyệt và thêm thành viên.');
    }

    if (!Boolean(group.memberApprovalEnabled) && !isAdmin && currentUserId !== creatorId) {
      await ensureGroupMember(groupId, currentUserId);
    }

    const uniqueMembers = Array.from(new Set(memberIds.filter((id) => id !== currentUserId)));
    if (uniqueMembers.length === 0) {
      throw new BadRequestError('No members to add');
    }

    await ensureUsersExist(uniqueMembers);
    await ensureFriendship(currentUserId, uniqueMembers);

    const existingMembers = await ConversationMemberModel.find({
      conversationId: groupId,
      userId: { $in: uniqueMembers },
    }).select('userId').lean();

    const existingSet = new Set(existingMembers.map((m) => m.userId));
    const toInsert = uniqueMembers.filter((id) => !existingSet.has(id));

    if (toInsert.length === 0) {
      throw new BadRequestError('All selected users are already in group');
    }

    const currentMemberCount = await ConversationMemberModel.countDocuments({ conversationId: groupId });
    if (currentMemberCount + toInsert.length > 100) {
      throw new BadRequestError('Group cannot exceed 100 members');
    }

    await ConversationMemberModel.insertMany(
      toInsert.map((memberId) => ({
        conversationId: groupId,
        userId: memberId,
        role: 'member' as const,
      })),
    );

    const summary = await buildGroupSummary(groupId);
    const addedUsers = await UserModel.find({ _id: { $in: toInsert } }, 'displayName').lean();
    const addedUserNameById = new Map(addedUsers.map((user) => [user._id.toString(), user.displayName as string]));

    for (const addedUserId of toInsert) {
      const displayName = addedUserNameById.get(addedUserId) ?? 'Thành viên';
      await createAndEmitGroupSystemMessage(
        groupId,
        currentUserId,
        `${displayName} được thêm vào nhóm`,
        summary.users.map((user) => user._id),
      );
    }

    emitGroupUpdated(summary.users.map((u) => u._id), {
      groupId,
      type: 'member_added',
      data: {
        memberIds: toInsert,
        addedBy: currentUserId,
      },
    });

    // F3.1: Produce notification for newly added members
    void (async () => {
      try {
        const admin = await UserModel.findById(currentUserId).select('displayName').lean();
        const adminName = (admin?.displayName as string) ?? 'Someone';
        const groupName = summary.name ?? 'a group';

        for (const addedUserId of toInsert) {
          await produceNotificationEvent({
            userId: addedUserId,
            type: 'group_invite',
            title: 'Được thêm vào nhóm',
            body: `${adminName} đã thêm bạn vào nhóm ${groupName}`,
            conversationId: groupId,
            fromUserId: currentUserId,
            data: { conversationId: groupId, action: 'open_chat' },
          });
        }
      } catch (err) {
        logger.error('Failed to produce group_invite notifications', err);
      }
    })();

    return summary;
  }

  static async removeMember(
    currentUserId: string,
    groupId: string,
    targetUserId: string,
  ): Promise<GroupSummary> {
    const group = await getGroupOrThrow(groupId);
    await ensureGroupMember(groupId, currentUserId);
    ensureGroupAdmin(group, currentUserId);

    if (targetUserId === getGroupCreatorId(group)) {
      throw new BadRequestError('Cannot remove group creator');
    }

    if (targetUserId === currentUserId) {
      throw new BadRequestError('Use leave endpoint to leave group');
    }

    const targetMember = await ConversationMemberModel.findOne({
      conversationId: groupId,
      userId: targetUserId,
    });

    if (!targetMember) {
      throw new NotFoundError('Member not found in group');
    }

    await targetMember.deleteOne();

    group.adminIds = group.adminIds.filter((id) => id !== targetUserId);
    await group.save();

    const memberIds = await getGroupMemberIds(groupId);
    const targetUser = await UserModel.findById(targetUserId).select('displayName').lean();
    const targetDisplayName = (targetUser?.displayName as string) ?? 'Thành viên';

    await createAndEmitGroupSystemMessage(
      groupId,
      currentUserId,
      `${targetDisplayName} đã bị xóa khỏi nhóm`,
      [...memberIds, targetUserId],
    );

    emitGroupUpdated([...memberIds, targetUserId], {
      groupId,
      type: 'member_removed',
      data: {
        userId: targetUserId,
        removedBy: currentUserId,
        createdBy: getGroupCreatorId(group),
        adminIds: group.adminIds,
      },
    });

    void notifyGroupRecipients({
      recipientIds: [targetUserId],
      actorId: currentUserId,
      groupId,
      groupName: group.name,
      title: 'Bạn đã bị xóa khỏi nhóm',
      body: (actorName, groupName) => `${actorName} đã xóa bạn khỏi nhóm ${groupName}`,
      action: 'group_removed',
    });
    void notifyGroupRecipients({
      recipientIds: memberIds,
      actorId: currentUserId,
      groupId,
      groupName: group.name,
      title: 'Thành viên đã rời nhóm',
      body: (_actorName, groupName) => `${targetDisplayName} đã bị xóa khỏi nhóm ${groupName}`,
      excludeIds: [currentUserId],
    });

    return buildGroupSummary(groupId);
  }

  static async leaveGroup(currentUserId: string, groupId: string): Promise<{ disbanded: boolean; groupId: string }> {
    const group = await getGroupOrThrow(groupId);
    await ensureGroupMember(groupId, currentUserId);

    const isCreatorLeaving = getGroupCreatorId(group) === currentUserId;

    await ConversationMemberModel.deleteOne({
      conversationId: groupId,
      userId: currentUserId,
    });

    const remainingMembers = await ConversationMemberModel.find({ conversationId: groupId }).sort({ joinedAt: 1 }).lean();

    if (remainingMembers.length === 0) {
      await ConversationModel.findByIdAndDelete(groupId);
      emitGroupUpdated([currentUserId], {
        groupId,
        type: 'disbanded',
        data: { by: currentUserId },
      });
      return { disbanded: true, groupId };
    }

    const wasAdmin = group.adminIds.includes(currentUserId);
    group.adminIds = group.adminIds.filter((id) => id !== currentUserId);

    const remainingAdminSet = new Set(group.adminIds);

    const promotedLeaderId = remainingMembers.find((member) => remainingAdminSet.has(member.userId))?.userId
      ?? remainingMembers[0]?.userId;

    if (isCreatorLeaving && promotedLeaderId) {
      group.createdBy = promotedLeaderId;
    }

    if (wasAdmin && group.adminIds.length === 0) {
      if (promotedLeaderId) {
        group.adminIds = [promotedLeaderId];
        await ConversationMemberModel.updateOne(
          { conversationId: groupId, userId: promotedLeaderId },
          { role: 'admin' },
        );
      }
    }

    await group.save();

    const remainingIds = remainingMembers.map((m) => m.userId);
    const currentUser = await UserModel.findById(currentUserId).select('displayName').lean();
    const currentUserName = (currentUser?.displayName as string) ?? 'Thành viên';

    await createAndEmitGroupSystemMessage(
      groupId,
      currentUserId,
      `${currentUserName} đã rời khỏi nhóm`,
      [...remainingIds, currentUserId],
    );

    if (isCreatorLeaving && promotedLeaderId) {
      const promotedLeader = await UserModel.findById(promotedLeaderId).select('displayName').lean();
      const promotedLeaderName = (promotedLeader?.displayName as string) ?? 'Thành viên';

      await createAndEmitGroupSystemMessage(
        groupId,
        currentUserId,
        `${promotedLeaderName} là trưởng nhóm`,
        [...remainingIds, currentUserId],
      );
    }

    emitGroupUpdated([...remainingIds, currentUserId], {
      groupId,
      type: 'member_removed',
      data: {
        userId: currentUserId,
        removedBy: currentUserId,
        action: 'left',
        createdBy: getGroupCreatorId(group),
        adminIds: group.adminIds,
      },
    });

    void notifyGroupRecipients({
      recipientIds: remainingIds,
      actorId: currentUserId,
      groupId,
      groupName: group.name,
      title: 'Thành viên đã rời nhóm',
      body: (actorName, groupName) => `${actorName} đã rời khỏi nhóm ${groupName}`,
    });

    return { disbanded: false, groupId };
  }

  static async updateMemberRole(
    currentUserId: string,
    groupId: string,
    targetUserId: string,
    role: 'admin' | 'member',
  ): Promise<GroupSummary> {
    const group = await getGroupOrThrow(groupId);
    await ensureGroupMember(groupId, currentUserId);
    ensureGroupAdmin(group, currentUserId);

    if (targetUserId === getGroupCreatorId(group) && role !== 'admin') {
      throw new BadRequestError('Cannot change creator role');
    }

    const targetMember = await ConversationMemberModel.findOne({
      conversationId: groupId,
      userId: targetUserId,
    });

    if (!targetMember) {
      throw new NotFoundError('Member not found in group');
    }

    if (role === 'admin') {
      if (!group.adminIds.includes(targetUserId)) {
        group.adminIds.push(targetUserId);
      }
    } else {
      const wouldRemainAdmins = group.adminIds.filter((id) => id !== targetUserId);
      if (wouldRemainAdmins.length === 0) {
        throw new BadRequestError('Group must have at least one admin');
      }

      group.adminIds = group.adminIds.filter((id) => id !== targetUserId);
    }

    targetMember.role = role;
    await targetMember.save();
    await group.save();

    if (role === 'admin') {
      const targetUser = await UserModel.findById(targetUserId).select('displayName').lean();
      const targetDisplayName = (targetUser?.displayName as string) ?? 'Thành viên';
      const memberIds = await getGroupMemberIds(groupId);

      await createAndEmitGroupSystemMessage(
        groupId,
        currentUserId,
        `${targetDisplayName} là quản trị viên`,
        [...memberIds, currentUserId],
      );
    }

    const summary = await buildGroupSummary(groupId);
    emitGroupUpdated(summary.users.map((u) => u._id), {
      groupId,
      type: 'role_changed',
      data: {
        userId: targetUserId,
        role,
        updatedBy: currentUserId,
        createdBy: getGroupCreatorId(group),
        adminIds: group.adminIds,
      },
    });

    void notifyGroupRecipients({
      recipientIds: [targetUserId],
      actorId: currentUserId,
      groupId,
      groupName: summary.name,
      title: role === 'admin' ? 'Bạn được đặt làm quản trị viên' : 'Quyền quản trị viên đã được gỡ',
      body: (actorName, groupName) => role === 'admin'
        ? `${actorName} đã đặt bạn làm quản trị viên nhóm ${groupName}`
        : `${actorName} đã gỡ quyền quản trị viên của bạn trong nhóm ${groupName}`,
    });

    return summary;
  }

  static async updateMemberApproval(
    currentUserId: string,
    groupId: string,
    memberApprovalEnabled: boolean,
  ): Promise<GroupSummary> {
    const group = await getGroupOrThrow(groupId);
    await ensureGroupMember(groupId, currentUserId);
    ensureGroupCreator(group, currentUserId);

    group.memberApprovalEnabled = memberApprovalEnabled;
    await group.save();

    const summary = await buildGroupSummary(groupId);
    emitGroupUpdated(summary.users.map((u) => u._id), {
      groupId,
      type: 'member_approval_changed',
      data: {
        memberApprovalEnabled,
        updatedBy: currentUserId,
      },
    });

    void notifyGroupRecipients({
      recipientIds: summary.users.map((u) => u._id),
      actorId: currentUserId,
      groupId,
      groupName: summary.name,
      title: 'Cài đặt duyệt thành viên đã đổi',
      body: (actorName, groupName) => `${actorName} đã ${memberApprovalEnabled ? 'bật' : 'tắt'} duyệt thành viên trong nhóm ${groupName}`,
      excludeIds: [currentUserId],
    });

    return summary;
  }

  static async deleteGroup(currentUserId: string, groupId: string): Promise<void> {
    const group = await getGroupOrThrow(groupId);
    await ensureGroupMember(groupId, currentUserId);
    ensureGroupCreator(group, currentUserId);

    const memberIds = await getGroupMemberIds(groupId);
    await ConversationMemberModel.deleteMany({ conversationId: groupId });
    await ConversationModel.findByIdAndDelete(groupId);

    emitGroupUpdated(memberIds, {
      groupId,
      type: 'disbanded',
      data: {
        by: currentUserId,
      },
    });

    void notifyGroupRecipients({
      recipientIds: memberIds,
      actorId: currentUserId,
      groupId,
      groupName: group.name,
      title: 'Nhóm đã bị giải tán',
      body: (actorName, groupName) => `${actorName} đã giải tán nhóm ${groupName}`,
      excludeIds: [currentUserId],
      action: 'group_deleted',
    });
  }

  static async getPublicChannels(): Promise<GroupSummary[]> {
    const channels = await ConversationModel.find({ type: 'group', isPublic: true }).sort({ memberCount: -1 }).limit(50).lean();
    return Promise.all(channels.map(c => buildGroupSummary(c._id.toString())));
  }

  static async discoverChannels(userId: string): Promise<GroupSummary[]> {
    const userGroups = await ConversationMemberModel.find({ userId }).select('conversationId').lean();
    const userGroupIds = userGroups.map(m => m.conversationId);
    
    const channels = await ConversationModel.find({ 
      type: 'group', 
      isPublic: true,
      _id: { $nin: userGroupIds }
    }).sort({ memberCount: -1 }).limit(20).lean();

    return Promise.all(channels.map(c => buildGroupSummary(c._id.toString())));
  }

  static async joinPublicChannel(userId: string, groupId: string): Promise<GroupSummary> {
    const group = await getGroupOrThrow(groupId);
    if (!group.isPublic) {
      throw new ForbiddenError('This channel is not public');
    }
    
    const isMember = await isGroupMember(groupId, userId);
    if (isMember) {
      throw new BadRequestError('Already a member');
    }

    await ConversationMemberModel.create({
      conversationId: groupId,
      userId,
      role: 'member',
    });

    group.memberCount = (group.memberCount || 0) + 1;
    await group.save();

    const summary = await buildGroupSummary(groupId);
    
    const memberIds = await getGroupMemberIds(groupId);
    
    const currentUser = await UserModel.findById(userId).select('displayName').lean();
    const displayName = currentUser?.displayName || 'Thành viên';
    await createAndEmitGroupSystemMessage(
      groupId,
      userId,
      `${displayName} đã tham gia channel`,
      memberIds,
    );

    emitGroupUpdated(memberIds, {
      groupId,
      type: 'member_added',
      data: {
        memberIds: [userId],
        addedBy: userId,
      },
    });

    return summary;
  }
}
