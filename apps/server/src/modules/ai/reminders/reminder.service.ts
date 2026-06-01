import { Types } from 'mongoose';
import { ForbiddenError, NotFoundError } from '../../../shared/errors';
import { ConversationMemberModel } from '../../conversations/conversation-member.model';
import { ConversationModel } from '../../conversations/conversation.model';
import { UserModel } from '../../users/user.model';
import { emitAiAssistantItemUpdated, emitAiReminderUpdated } from '../../../socket/gateway';
import { AiAssistantItemModel } from '../assistant/assistant.model';
import { AiReminderModel, type IAiReminder } from './reminder.model';
import type { CreateReminderInput, UpdateReminderInput } from './reminder.schema';
import type { IAiCatchupDigest } from '../catchup/catchup.model';

type SerializedReminderStatus = 'suggested' | 'accepted' | 'done' | 'dismissed';

interface SerializedReminder {
  _id: string;
  userId: string;
  conversationId: string;
  digestId?: string;
  sourceMessageRefs: string[];
  title: string;
  description?: string;
  dueAt?: string;
  status: SerializedReminderStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface SerializedAssistantTask extends SerializedReminder {
  aiItemId?: string;
  conversationName?: string;
  conversationAvatarUrl?: string | null;
  conversationType?: 'direct' | 'group';
}

type ReminderListOptions = {
  conversationId?: string;
  status?: SerializedReminderStatus | 'active';
  limit?: number;
  skip?: number;
};

function serialize(reminder: IAiReminder): SerializedReminder {
  return {
    _id: String(reminder._id),
    userId: reminder.userId,
    conversationId: reminder.conversationId,
    digestId: reminder.digestId ? String(reminder.digestId) : undefined,
    sourceMessageRefs: reminder.sourceMessageRefs,
    title: reminder.title,
    description: reminder.description,
    dueAt: reminder.dueAt?.toISOString(),
    status: reminder.status,
    createdBy: reminder.createdBy,
    createdAt: reminder.createdAt.toISOString(),
    updatedAt: reminder.updatedAt.toISOString(),
  };
}

function serializeLean(reminder: IAiReminder): SerializedReminder {
  return {
    _id: String(reminder._id),
    userId: reminder.userId,
    conversationId: reminder.conversationId,
    digestId: reminder.digestId ? String(reminder.digestId) : undefined,
    sourceMessageRefs: reminder.sourceMessageRefs,
    title: reminder.title,
    description: reminder.description,
    dueAt: reminder.dueAt?.toISOString(),
    status: reminder.status,
    createdBy: reminder.createdBy,
    createdAt: reminder.createdAt.toISOString(),
    updatedAt: reminder.updatedAt.toISOString(),
  };
}

async function assertMembership(conversationId: string, userId: string): Promise<void> {
  const member = await ConversationMemberModel.findOne({ conversationId, userId });
  if (!member) {
    throw new ForbiddenError('Not allowed to manage reminders for this conversation');
  }
}

function normalizeSourceRefs(refs: string[] = []): string[] {
  return Array.from(new Set(refs.filter(Boolean))).sort();
}

function buildDuplicateQuery(
  userId: string,
  input: Pick<CreateReminderInput, 'conversationId' | 'title' | 'sourceMessageRefs'>,
): Record<string, unknown> {
  const normalizedRefs = normalizeSourceRefs(input.sourceMessageRefs);
  const query: Record<string, unknown> = {
    userId,
    conversationId: input.conversationId,
    title: input.title,
    status: { $in: ['suggested', 'accepted'] },
  };

  if (normalizedRefs.length > 0) {
    query.sourceMessageRefs = { $all: normalizedRefs, $size: normalizedRefs.length };
  }

  return query;
}

export class AiReminderService {
  private static async syncAssistantTaskItem(reminder: IAiReminder): Promise<string | undefined> {
    const serialized = serialize(reminder);
    const item = await AiAssistantItemModel.findOneAndUpdate(
      {
        userId: reminder.userId,
        type: 'task',
        refId: String(reminder._id),
      },
      {
        $set: {
          userId: reminder.userId,
          type: 'task',
          conversationId: reminder.conversationId,
          refId: String(reminder._id),
          status: 'ready',
          title: reminder.title,
          summarySnippet: reminder.description,
          metadata: {
            taskStatus: reminder.status,
            dueAt: reminder.dueAt?.toISOString(),
            latestMessageAt: reminder.updatedAt?.toISOString() ?? new Date().toISOString(),
            messageCount: reminder.sourceMessageRefs?.length ?? 0,
          },
          trigger: reminder.createdBy === 'ai_suggestion' ? 'auto' : 'manual',
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    emitAiAssistantItemUpdated(reminder.userId, {
      itemId: String(item._id),
      type: 'task',
      conversationId: reminder.conversationId,
      status: 'ready',
      title: reminder.title,
      summarySnippet: reminder.description,
      metadata: item.metadata,
      detail: serialized,
      updatedAt: new Date().toISOString(),
    });

    return String(item._id);
  }

  private static async emitAssistantTaskDeleted(userId: string, reminder: IAiReminder): Promise<void> {
    const item = await AiAssistantItemModel.findOneAndDelete({
      userId,
      type: 'task',
      refId: String(reminder._id),
    });

    if (!item) return;

    emitAiAssistantItemUpdated(userId, {
      itemId: String(item._id),
      type: 'task',
      conversationId: reminder.conversationId,
      status: 'failed',
      title: reminder.title,
      metadata: {
        ...(item.metadata ?? {}),
        taskStatus: 'dismissed',
      },
      detail: {
        ...serialize(reminder),
        status: 'deleted',
      },
      updatedAt: new Date().toISOString(),
    });
  }

  static async create(
    userId: string,
    input: CreateReminderInput,
  ): Promise<SerializedReminder> {
    await assertMembership(input.conversationId, userId);
    const normalizedSourceRefs = normalizeSourceRefs(input.sourceMessageRefs);
    const targetStatus = input.status ?? 'accepted';
    const existing = await AiReminderModel.findOne(buildDuplicateQuery(userId, {
      ...input,
      sourceMessageRefs: normalizedSourceRefs,
    }));

    if (existing) {
      existing.status = targetStatus === 'suggested' && existing.status === 'accepted'
        ? 'accepted'
        : targetStatus;
      existing.digestId = input.digestId ?? existing.digestId;
      existing.sourceMessageRefs = normalizedSourceRefs;
      existing.description = input.description ?? existing.description;
      if (input.dueAt) existing.dueAt = new Date(input.dueAt);
      existing.createdBy = input.createdBy ?? existing.createdBy;
      await existing.save();

      const serializedExisting = serialize(existing);
      await this.syncAssistantTaskItem(existing);
      emitAiReminderUpdated(userId, serializedExisting);
      return serializedExisting;
    }

    const reminder = await AiReminderModel.create({
      userId,
      conversationId: input.conversationId,
      digestId: input.digestId,
      sourceMessageRefs: normalizedSourceRefs,
      title: input.title,
      description: input.description,
      dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
      status: targetStatus,
      createdBy: input.createdBy ?? 'user',
    });

    const serialized = serialize(reminder);
    await this.syncAssistantTaskItem(reminder);
    emitAiReminderUpdated(userId, serialized);
    return serialized;
  }

  static async list(
    userId: string,
    filters?: { conversationId?: string; status?: string },
  ): Promise<SerializedReminder[]> {
    const query: Record<string, unknown> = { userId };
    if (filters?.conversationId) query.conversationId = filters.conversationId;
    if (filters?.status) {
      query.status = filters.status === 'active' ? { $in: ['suggested', 'accepted'] } : filters.status;
    }

    const reminders = await AiReminderModel.find(query)
      .sort({ dueAt: 1, createdAt: -1 })
      .lean<IAiReminder[]>();

    return reminders.map(serializeLean);
  }

  static async listForAssistant(
    userId: string,
    options: ReminderListOptions = {},
  ): Promise<{ tasks: SerializedAssistantTask[]; total: number }> {
    const limit = options.limit ?? 20;
    const skip = options.skip ?? 0;
    const query: Record<string, unknown> = { userId };
    if (options.conversationId) query.conversationId = options.conversationId;
    if (options.status) {
      query.status = options.status === 'active' ? { $in: ['suggested', 'accepted'] } : options.status;
    }

    const [reminders, total] = await Promise.all([
      AiReminderModel.find(query)
        .sort({ dueAt: 1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean<IAiReminder[]>(),
      AiReminderModel.countDocuments(query),
    ]);

    if (reminders.length === 0) {
      return { tasks: [], total };
    }

    const conversationIds = Array.from(new Set(reminders.map((reminder) => reminder.conversationId)));
    const [conversations, members, taskItems] = await Promise.all([
      ConversationModel.find({ _id: { $in: conversationIds } })
        .select('_id type name avatarUrl')
        .lean<Array<{ _id: unknown; type?: 'direct' | 'group'; name?: string; avatarUrl?: string }>>(),
      ConversationMemberModel.find({ conversationId: { $in: conversationIds } })
        .select('conversationId userId')
        .lean<Array<{ conversationId: string; userId: string }>>(),
      AiAssistantItemModel.find({
        userId,
        type: 'task',
        refId: { $in: reminders.map((reminder) => String(reminder._id)) },
      }).lean<Array<{ _id: unknown; refId?: string }>>(),
    ]);

    const conversationById = new Map(conversations.map((conversation) => [String(conversation._id), conversation]));
    const membersByConversationId = new Map<string, Array<{ conversationId: string; userId: string }>>();
    members.forEach((member) => {
      const existing = membersByConversationId.get(member.conversationId) ?? [];
      existing.push(member);
      membersByConversationId.set(member.conversationId, existing);
    });

    const peerIds = Array.from(new Set(
      conversationIds
        .filter((conversationId) => conversationById.get(conversationId)?.type !== 'group')
        .flatMap((conversationId) => membersByConversationId.get(conversationId) ?? [])
        .map((member) => String(member.userId))
        .filter((memberUserId) => memberUserId !== userId),
    ));

    const users = peerIds.length > 0
      ? await UserModel.find({ _id: { $in: peerIds } })
        .select('displayName avatarUrl')
        .lean<Array<{ _id: unknown; displayName?: string; avatarUrl?: string }>>()
      : [];
    const userById = new Map(users.map((user) => [String(user._id), user]));
    const itemByReminderId = new Map(taskItems.map((item) => [String(item.refId), String(item._id)]));

    const tasks = reminders.map((reminder): SerializedAssistantTask => {
      const conversation = conversationById.get(reminder.conversationId);
      const isGroup = conversation?.type === 'group';
      const peerMember = (membersByConversationId.get(reminder.conversationId) ?? [])
        .find((member) => String(member.userId) !== userId);
      const peerUser = peerMember ? userById.get(String(peerMember.userId)) : undefined;

      return {
        ...serializeLean(reminder),
        aiItemId: itemByReminderId.get(String(reminder._id)),
        conversationType: isGroup ? 'group' : 'direct',
        conversationName: isGroup
          ? conversation?.name ?? 'Nhóm'
          : peerUser?.displayName ?? conversation?.name ?? 'Cuộc trò chuyện',
        conversationAvatarUrl: isGroup
          ? conversation?.avatarUrl ?? null
          : peerUser?.avatarUrl ?? conversation?.avatarUrl ?? null,
      };
    });

    return { tasks, total };
  }

  static async getById(userId: string, reminderId: string): Promise<SerializedReminder> {
    if (!Types.ObjectId.isValid(reminderId)) {
      throw new NotFoundError('Reminder not found');
    }

    const reminder = await AiReminderModel.findById(reminderId).lean<IAiReminder>();
    if (!reminder || reminder.userId !== userId) {
      throw new NotFoundError('Reminder not found');
    }

    return serialize(reminder);
  }

  static async update(
    userId: string,
    reminderId: string,
    input: UpdateReminderInput,
  ): Promise<SerializedReminder> {
    if (!Types.ObjectId.isValid(reminderId)) {
      throw new NotFoundError('Reminder not found');
    }

    const reminder = await AiReminderModel.findById(reminderId);
    if (!reminder || reminder.userId !== userId) {
      throw new NotFoundError('Reminder not found');
    }

    if (input.status !== undefined) reminder.status = input.status;
    if (input.title !== undefined) reminder.title = input.title;
    if (input.description !== undefined) reminder.description = input.description;
    if (input.dueAt !== undefined) {
      reminder.dueAt = input.dueAt ? new Date(input.dueAt) : undefined;
    }

    await reminder.save();
    const serialized = serialize(reminder);
    await this.syncAssistantTaskItem(reminder);
    emitAiReminderUpdated(userId, serialized);
    return serialized;
  }

  static async delete(userId: string, reminderId: string): Promise<void> {
    if (!Types.ObjectId.isValid(reminderId)) {
      throw new NotFoundError('Reminder not found');
    }

    const reminder = await AiReminderModel.findOneAndDelete({ _id: reminderId, userId });
    if (!reminder) {
      throw new NotFoundError('Reminder not found');
    }

    await this.emitAssistantTaskDeleted(userId, reminder);
    emitAiReminderUpdated(userId, {
      ...serialize(reminder),
      _id: reminderId,
      status: 'deleted',
    } as SerializedReminder & { status: 'deleted' });
  }

  static async createFromActionItem(
    userId: string,
    actionItem: { text: string; sourceMessageRefs: string[] },
    conversationId: string,
    digestId?: string,
  ): Promise<SerializedReminder> {
    return this.create(userId, {
      conversationId,
      digestId,
      sourceMessageRefs: actionItem.sourceMessageRefs,
      title: actionItem.text,
      createdBy: 'ai_suggestion',
      status: 'accepted',
    });
  }

  static async syncSuggestedTasksFromDigest(digest: IAiCatchupDigest): Promise<void> {
    const actionItems = digest.futureSignals?.actionItems ?? [];
    if (actionItems.length === 0) return;

    await Promise.all(actionItems.map((actionItem) => this.create(digest.userId, {
      conversationId: digest.conversationId,
      digestId: String(digest._id),
      sourceMessageRefs: actionItem.sourceMessageRefs,
      title: actionItem.text,
      createdBy: 'ai_suggestion',
      status: 'suggested',
    })));
  }
}
