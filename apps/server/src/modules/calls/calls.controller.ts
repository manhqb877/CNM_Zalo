import { type NextFunction, type Request, type Response } from 'express';
import { type AuthRequest } from '../../shared/middleware/auth.middleware';
import { CallsService } from './calls.service';
import type { CreateCallSessionDto, EndCallSessionDto, RejectCallSessionDto } from './calls.schema';

export async function createCallSessionHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    const body = req.body as CreateCallSessionDto;
    const session = await CallsService.createOneToOneSession(userId, {
      targetUserId: body.targetUserId,
      conversationId: body.conversationId,
      callType: body.callType,
    });
    res.status(201).json({ success: true, data: session });
  } catch (err) {
    next(err);
  }
}

export async function getActiveCallHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    const session = await CallsService.getActiveCallForUser(userId);
    res.json({ success: true, data: session });
  } catch (err) {
    next(err);
  }
}

export async function getCallSessionHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    const session = await CallsService.getSessionForUser(req.params['sessionId'] as string, userId);
    res.json({ success: true, data: session });
  } catch (err) {
    next(err);
  }
}

export async function issueCallSessionTokenHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    const tokenData = await CallsService.issueSessionTokenForUser(
      req.params['sessionId'] as string,
      userId,
    );
    res.json({ success: true, data: tokenData });
  } catch (err) {
    next(err);
  }
}

export async function acceptCallSessionHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    const session = await CallsService.acceptCallSession(req.params['sessionId'] as string, userId);
    res.json({ success: true, data: session });
  } catch (err) {
    next(err);
  }
}

export async function rejectCallSessionHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    const body = req.body as RejectCallSessionDto;
    const session = await CallsService.rejectCallSession(
      req.params['sessionId'] as string,
      userId,
      body.reason,
    );
    res.json({ success: true, data: session });
  } catch (err) {
    next(err);
  }
}

export async function endCallSessionHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    const body = req.body as EndCallSessionDto;
    const session = await CallsService.endCallSession(
      req.params['sessionId'] as string,
      userId,
      body.reason,
    );
    res.json({ success: true, data: session });
  } catch (err) {
    next(err);
  }
}
