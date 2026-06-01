import { Request, Response } from 'express';
import { AuthRequest } from '../../shared/middleware/auth.middleware';
import { ConversationsService } from './conversations.service';
import { logger } from '../../shared/logger';
import { BadRequestError, ForbiddenError, NotFoundError, TooManyRequestsError } from '../../shared/errors';

export const listConversationsHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req as AuthRequest;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const conversations = await ConversationsService.getUserConversations(userId);

    res.status(200).json({
      success: true,
      data: conversations,
    });
  } catch (error) {
    logger.error('Error in listConversationsHandler', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const getOrCreateDirectConversationHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req as AuthRequest;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    // Support both POST (body) and GET (query param)
    const targetUserId = (req.body as { targetUserId?: string })?.targetUserId
      ?? (req.query as { userId?: string }).userId;

    if (!targetUserId || typeof targetUserId !== 'string') {
      throw new BadRequestError('targetUserId is required');
    }

    const conversation = await ConversationsService.getOrCreateConversation(userId, targetUserId);
    res.status(200).json({ success: true, data: conversation });
  } catch (error) {
    logger.error('Error in getOrCreateDirectConversationHandler', error);
    if (error instanceof BadRequestError) {
      res.status(400).json({ success: false, error: error.message, code: error.code });
      return;
    }
    if (error instanceof ForbiddenError) {
      res.status(403).json({ success: false, error: error.message, code: error.code });
      return;
    }
    if (error instanceof NotFoundError) {
      res.status(404).json({ success: false, error: error.message, code: error.code });
      return;
    }
    if (error instanceof TooManyRequestsError) {
      res.status(429).json({ success: false, error: error.message, code: error.code });
      return;
    }
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
