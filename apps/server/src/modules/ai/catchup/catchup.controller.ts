import { type NextFunction, type RequestHandler, type Response } from 'express';
import { BadRequestError } from '../../../shared/errors';
import { type AuthRequest } from '../../../shared/middleware/auth.middleware';
import {
  CreateCatchupDigestSchema,
  UpdateCatchupSettingsSchema,
} from './catchup.schema';
import { AiCatchupService } from './catchup.service';

export const createCatchupDigestHandler = (async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const conversationId = req.params['conversationId'];
    if (!conversationId) {
      throw new BadRequestError('conversationId is required');
    }

    const parsed = CreateCatchupDigestSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError(parsed.error.message);
    }

    const digest = await AiCatchupService.createDigest(req.userId, conversationId, parsed.data);
    res.status(202).json({ success: true, data: digest });
  } catch (err) {
    next(err);
  }
}) as unknown as RequestHandler;

export const getLatestCatchupDigestHandler = (async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const conversationId = req.params['conversationId'];
    if (!conversationId) {
      throw new BadRequestError('conversationId is required');
    }

    const digest = await AiCatchupService.getLatestDigest(req.userId, conversationId);
    res.json({ success: true, data: digest });
  } catch (err) {
    next(err);
  }
}) as unknown as RequestHandler;

export const getCatchupDigestHandler = (async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const digestId = req.params['digestId'];
    if (!digestId) {
      throw new BadRequestError('digestId is required');
    }

    const digest = await AiCatchupService.getDigestById(req.userId, digestId);
    res.json({ success: true, data: digest });
  } catch (err) {
    next(err);
  }
}) as unknown as RequestHandler;

export const regenerateCatchupDigestHandler = (async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const digestId = req.params['digestId'];
    if (!digestId) {
      throw new BadRequestError('digestId is required');
    }

    const digest = await AiCatchupService.regenerateDigest(req.userId, digestId);
    res.status(202).json({ success: true, data: digest });
  } catch (err) {
    next(err);
  }
}) as unknown as RequestHandler;

export const updateCatchupSettingsHandler = (async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const conversationId = req.params['conversationId'];
    if (!conversationId) {
      throw new BadRequestError('conversationId is required');
    }

    const parsed = UpdateCatchupSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError(parsed.error.message);
    }

    const settings = await AiCatchupService.updateSettings(
      req.userId,
      conversationId,
      parsed.data.catchupEnabled,
    );
    res.json({ success: true, data: settings });
  } catch (err) {
    next(err);
  }
}) as unknown as RequestHandler;
