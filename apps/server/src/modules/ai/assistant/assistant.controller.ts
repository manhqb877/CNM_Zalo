import { type NextFunction, type RequestHandler, type Response } from 'express';
import { BadRequestError } from '../../../shared/errors';
import { type AuthRequest } from '../../../shared/middleware/auth.middleware';
import {
  CreateCatchupDigestSchema,
  UpdateCatchupSettingsSchema,
  AssistantQuerySchema,
  UnreadConversationsQuerySchema,
  AssistantTaskQuerySchema,
  CreateAssistantTaskSchema,
  UpdateAssistantTaskSchema,
  AssistantSearchQuerySchema,
  AssistantNotesQuerySchema,
  CreateGroupNoteSchema,
  UpdateGroupNoteSchema,
} from './assistant.schema';
import { AiAssistantService } from './assistant.service';
import { AiReminderService } from '../reminders/reminder.service';

const asyncHandler = (fn: unknown): RequestHandler => fn as RequestHandler;

export const getAssistantListHandler: RequestHandler = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const parsed = AssistantQuerySchema.safeParse(req.query);
      if (!parsed.success) throw new BadRequestError(parsed.error.message);

      const { type, conversationId, limit, skip } = parsed.data;
      const result = await AiAssistantService.getItemList(req.userId, {
        type,
        conversationId,
        limit,
        skip,
      });

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

export const getUnreadConversationsHandler: RequestHandler = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const parsed = UnreadConversationsQuerySchema.safeParse(req.query);
      if (!parsed.success) throw new BadRequestError(parsed.error.message);

      const result = await AiAssistantService.getUnreadConversations(req.userId, {
        limit: parsed.data.limit,
        skip: parsed.data.skip,
      });

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

export const createCatchupDigestHandler: RequestHandler = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const parsed = CreateCatchupDigestSchema.safeParse(req.body);
      if (!parsed.success) throw new BadRequestError(parsed.error.message);

      const result = await AiAssistantService.createCatchupDigest(req.userId, parsed.data);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

export const getCatchupLatestHandler: RequestHandler = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { conversationId } = req.params;
      if (!conversationId) throw new BadRequestError('conversationId is required');

      const result = await AiAssistantService.getCatchupLatest(req.userId, conversationId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

export const regenerateCatchupHandler: RequestHandler = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { conversationId } = req.params;
      if (!conversationId) throw new BadRequestError('conversationId is required');

      const result = await AiAssistantService.regenerateCatchup(req.userId, conversationId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

export const updateSettingsHandler: RequestHandler = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { conversationId } = req.params;
      if (!conversationId) throw new BadRequestError('conversationId is required');

      const parsed = UpdateCatchupSettingsSchema.safeParse(req.body);
      if (!parsed.success) throw new BadRequestError(parsed.error.message);

      const result = await AiAssistantService.updateSettings(
        req.userId,
        conversationId,
        parsed.data.catchupEnabled,
      );
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

export const listAssistantTasksHandler: RequestHandler = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const parsed = AssistantTaskQuerySchema.safeParse(req.query);
      if (!parsed.success) throw new BadRequestError(parsed.error.message);

      const result = await AiReminderService.listForAssistant(req.userId, parsed.data);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

export const createAssistantTaskHandler: RequestHandler = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const parsed = CreateAssistantTaskSchema.safeParse(req.body);
      if (!parsed.success) throw new BadRequestError(parsed.error.message);

      const task = await AiReminderService.create(req.userId, parsed.data);
      res.status(201).json({ success: true, data: task });
    } catch (err) {
      next(err);
    }
  },
);

export const updateAssistantTaskHandler: RequestHandler = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { taskId } = req.params;
      if (!taskId) throw new BadRequestError('taskId is required');

      const parsed = UpdateAssistantTaskSchema.safeParse(req.body);
      if (!parsed.success) throw new BadRequestError(parsed.error.message);

      const task = await AiReminderService.update(req.userId, taskId, parsed.data);
      res.json({ success: true, data: task });
    } catch (err) {
      next(err);
    }
  },
);

export const deleteAssistantTaskHandler: RequestHandler = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { taskId } = req.params;
      if (!taskId) throw new BadRequestError('taskId is required');

      await AiReminderService.delete(req.userId, taskId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

export const searchAssistantMessagesHandler: RequestHandler = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const parsed = AssistantSearchQuerySchema.safeParse(req.query);
      if (!parsed.success) throw new BadRequestError(parsed.error.message);

      const result = await AiAssistantService.searchMessages(req.userId, parsed.data);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

export const listGroupNotesHandler: RequestHandler = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const parsed = AssistantNotesQuerySchema.safeParse(req.query);
      if (!parsed.success) throw new BadRequestError(parsed.error.message);

      const result = await AiAssistantService.listGroupNotes(req.userId, parsed.data);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

export const createGroupNoteHandler: RequestHandler = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { conversationId } = req.params;
      if (!conversationId) throw new BadRequestError('conversationId is required');
      const parsed = CreateGroupNoteSchema.safeParse(req.body ?? {});
      if (!parsed.success) throw new BadRequestError(parsed.error.message);

      const result = await AiAssistantService.createGroupNote(req.userId, conversationId, parsed.data);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

export const getGroupNoteDetailHandler: RequestHandler = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { noteId } = req.params;
      if (!noteId) throw new BadRequestError('noteId is required');

      const result = await AiAssistantService.getGroupNoteDetail(req.userId, noteId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

export const updateGroupNoteHandler: RequestHandler = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { noteId } = req.params;
      if (!noteId) throw new BadRequestError('noteId is required');
      const parsed = UpdateGroupNoteSchema.safeParse(req.body ?? {});
      if (!parsed.success) throw new BadRequestError(parsed.error.message);

      const result = await AiAssistantService.updateGroupNote(req.userId, noteId, parsed.data);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

export const deleteGroupNoteHandler: RequestHandler = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { noteId } = req.params;
      if (!noteId) throw new BadRequestError('noteId is required');

      await AiAssistantService.deleteGroupNote(req.userId, noteId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

export const regenerateGroupNoteHandler: RequestHandler = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { noteId } = req.params;
      if (!noteId) throw new BadRequestError('noteId is required');

      const result = await AiAssistantService.regenerateGroupNote(req.userId, noteId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);
