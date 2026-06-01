import { type NextFunction, type Request, type Response } from 'express';
import { ZodError } from 'zod';
import { type AuthRequest } from '../../shared/middleware/auth.middleware';
import { BadRequestError } from '../../shared/errors';
import { ListFriendsQuerySchema, type SendFriendRequestDto } from './friends.schema';
import {
  acceptFriendRequest,
  blockUser,
  getFriendsCount,
  listFriendRequests,
  listFriends,
  rejectFriendRequest,
  sendFriendRequest,
  unblockUser,
  unfriend,
} from './friends.service';

function parseListQuery(req: Request): { cursor?: string; limit: number } {
  const parsed = ListFriendsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    const message = parsed.error instanceof ZodError
      ? parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')
      : 'Validation failed';
    throw new BadRequestError(message);
  }

  return {
    cursor: parsed.data.cursor,
    limit: parsed.data.limit,
  };
}

export async function sendFriendRequestHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    const { toUserId } = req.body as SendFriendRequestDto;
    const request = await sendFriendRequest(userId, toUserId);
    res.status(201).json({ success: true, request });
  } catch (err) {
    next(err);
  }
}

export async function acceptFriendRequestHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    await acceptFriendRequest(userId, req.params['requestId'] as string);
    res.json({ success: true, message: 'Friend request accepted' });
  } catch (err) {
    next(err);
  }
}

export async function rejectFriendRequestHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    await rejectFriendRequest(userId, req.params['requestId'] as string);
    res.json({ success: true, message: 'Friend request rejected' });
  } catch (err) {
    next(err);
  }
}

export async function unfriendHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    await unfriend(userId, req.params['friendId'] as string);
    res.json({ success: true, message: 'Unfriended successfully' });
  } catch (err) {
    next(err);
  }
}

export async function blockUserHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    await blockUser(userId, req.params['userId'] as string);
    res.json({ success: true, message: 'User blocked successfully' });
  } catch (err) {
    next(err);
  }
}

export async function unblockUserHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    await unblockUser(userId, req.params['userId'] as string);
    res.json({ success: true, message: 'User unblocked successfully' });
  } catch (err) {
    next(err);
  }
}

export async function listFriendsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    const query = parseListQuery(req);
    const data = await listFriends(userId, query.cursor, query.limit);
    res.json({ success: true, ...data });
  } catch (err) {
    next(err);
  }
}

export async function listFriendRequestsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    const data = await listFriendRequests(userId);
    res.json({
      success: true,
      ...data,
      received: data.incoming,
      sent: data.outgoing,
    });
  } catch (err) {
    next(err);
  }
}

export async function getFriendsCountHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    const count = await getFriendsCount(userId);
    res.json({ success: true, count });
  } catch (err) {
    next(err);
  }
}
