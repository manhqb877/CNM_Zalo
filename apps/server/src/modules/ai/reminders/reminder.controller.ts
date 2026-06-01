import { type NextFunction, type RequestHandler, type Response } from 'express';
import { BadRequestError } from '../../../shared/errors';
import { type AuthRequest } from '../../../shared/middleware/auth.middleware';
import { CreateReminderSchema, UpdateReminderSchema } from './reminder.schema';
import { AiReminderService } from './reminder.service';

export const createReminderHandler = (async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const parsed = CreateReminderSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError(parsed.error.message);
    }

    const reminder = await AiReminderService.create(req.userId, parsed.data);
    res.status(201).json({ success: true, data: reminder });
  } catch (err) {
    next(err);
  }
}) as unknown as RequestHandler;

export const listRemindersHandler = (async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const conversationId = req.query['conversationId'] as string | undefined;
    const status = req.query['status'] as string | undefined;

    const reminders = await AiReminderService.list(req.userId, { conversationId, status });
    res.json({ success: true, data: reminders });
  } catch (err) {
    next(err);
  }
}) as unknown as RequestHandler;

export const getReminderHandler = (async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const reminderId = req.params['reminderId'];
    if (!reminderId) {
      throw new BadRequestError('reminderId is required');
    }

    const reminder = await AiReminderService.getById(req.userId, reminderId);
    res.json({ success: true, data: reminder });
  } catch (err) {
    next(err);
  }
}) as unknown as RequestHandler;

export const updateReminderHandler = (async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const reminderId = req.params['reminderId'];
    if (!reminderId) {
      throw new BadRequestError('reminderId is required');
    }

    const parsed = UpdateReminderSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError(parsed.error.message);
    }

    const reminder = await AiReminderService.update(req.userId, reminderId, parsed.data);
    res.json({ success: true, data: reminder });
  } catch (err) {
    next(err);
  }
}) as unknown as RequestHandler;

export const deleteReminderHandler = (async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const reminderId = req.params['reminderId'];
    if (!reminderId) {
      throw new BadRequestError('reminderId is required');
    }

    await AiReminderService.delete(req.userId, reminderId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}) as unknown as RequestHandler;
