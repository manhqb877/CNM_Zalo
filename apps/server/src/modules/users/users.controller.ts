import { type Request, type Response, type NextFunction } from 'express';
import { type AuthRequest } from '../../shared/middleware/auth.middleware';
import {
  getMe,
  getUserById,
  searchUsers,
  updateProfile,
  upsertDeviceToken,
  discoverUsers,
  getAccountSettings,
  updateAccountSettings,
} from './users.service';
import {
  getUserPresence,
  getBulkPresence,
  getFriendIds,
  formatLastSeen,
} from './presence.service';
import type { UpdateProfileDto, UpsertDeviceTokenDto } from '../auth/auth.schema';
import type { UpdateAccountSettingsDto } from './users.schema';

// ─── GET /api/users/me ────────────────────────────────────────────────────────

export async function getMeHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    const user = await getMe(userId);
    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/users/:userId ───────────────────────────────────────────────────

export async function getUserByIdHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId: requesterId } = req as AuthRequest;
    const user = await getUserById(req.params['userId'] as string, requesterId);
    res.json({ success: true, data: user, user });
  } catch (err) {
    next(err);
  }
}

export async function getPublicProfileHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId: requesterId } = req as AuthRequest;
    const user = await getUserById(req.params['userId'] as string, requesterId);
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/users/me/settings ─────────────────────────────────────────────

export async function getAccountSettingsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    const settings = await getAccountSettings(userId);
    res.json({ success: true, settings });
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /api/users/me/settings ───────────────────────────────────────────

export async function updateAccountSettingsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    const settings = await updateAccountSettings(userId, req.body as UpdateAccountSettingsDto);
    res.json({ success: true, settings });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/users/search ───────────────────────────────────────────────────

export async function searchUsersHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    const query = ((req.query['query'] as string | undefined) ?? (req.query['q'] as string | undefined) ?? '');
    const limitRaw = Number(req.query['limit'] ?? 10);
    const users = await searchUsers(userId, query, limitRaw);
    res.json({ success: true, users });
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /api/users/me ──────────────────────────────────────────────────────

export async function updateProfileHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    const user = await updateProfile(userId, req.body as UpdateProfileDto);
    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/users/me/device-token ─────────────────────────────────────────

export async function upsertDeviceTokenHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    await upsertDeviceToken(userId, req.body as UpsertDeviceTokenDto);
    res.json({ success: true, message: 'Device token registered' });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/users/discover ──────────────────────────────────────────────────────────────────────────────────

export async function discoverUsersHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    const users = await discoverUsers(userId);
    res.json({ success: true, data: users });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/users/:userId/presence ──────────────────────────────────────

export async function getUserPresenceHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId: requesterId } = req as AuthRequest;
    const presence = await getUserPresence(req.params['userId'] as string, requesterId);
    res.json({
      success: true,
      online: presence.online,
      lastSeen: presence.lastSeen,
      lastSeenFormatted: formatLastSeen(presence.lastSeen),
    });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/users/presence/bulk ────────────────────────────────────────────

export async function getBulkPresenceHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    const friendIds = await getFriendIds(userId);
    if (friendIds.length === 0) {
      res.json({ success: true, presence: {} });
      return;
    }

    const presenceMap = await getBulkPresence(friendIds, userId);
    const result: Record<string, { online: boolean; lastSeen: string | null; lastSeenFormatted: string }> = {};
    for (const [uid, info] of presenceMap) {
      result[uid] = {
        online: info.online,
        lastSeen: info.lastSeen,
        lastSeenFormatted: formatLastSeen(info.lastSeen),
      };
    }

    res.json({ success: true, presence: result });
  } catch (err) {
    next(err);
  }
}
