import { type NextFunction, type Response, type RequestHandler } from 'express';
import { type AuthRequest } from '../../shared/middleware/auth.middleware';
import { AiChatService } from './ai-chat.service';
import { BadRequestError } from '../../shared/errors';

const asyncHandler = (fn: unknown): RequestHandler => fn as RequestHandler;

export const chatWithAiHandler: RequestHandler = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { conversationId, message } = req.body;
      if (!message || typeof message !== 'string') {
        throw new BadRequestError('Nội dung tin nhắn không hợp lệ.');
      }

      const reply = await AiChatService.chatWithAi(req.userId, conversationId, message);
      res.json({ success: true, data: { reply } });
    } catch (err) {
      next(err);
    }
  }
);

export const educationAiHandler: RequestHandler = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { message, fileUrl, fileName } = req.body;
      if (!message || typeof message !== 'string') {
        throw new BadRequestError('Nội dung tin nhắn không hợp lệ.');
      }

      const reply = await AiChatService.educationAi(req.userId, message, fileUrl, fileName);
      res.json({ success: true, data: { reply } });
    } catch (err) {
      next(err);
    }
  }
);
