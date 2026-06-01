import { Router, type Request, type Response } from 'express';
import { authenticate } from '../../../shared/middleware/auth.middleware';
import { ModerationLogModel } from './moderation.model';
import { logger } from '../../../shared/logger';

export const moderationAdminRouter = Router();

// All routes require authentication (admin check is TODO — add role middleware when RBAC added)
moderationAdminRouter.use(authenticate);

/**
 * GET /api/admin/moderation
 * List flagged and blocked content for admin review.
 *
 * Query params:
 *   label     = 'warning' | 'blocked' | 'safe' (default: warning,blocked)
 *   limit     = number (default 50, max 200)
 *   before    = ISO date string (cursor for pagination)
 *   senderId  = filter by specific sender
 */
moderationAdminRouter.get('/', async (req: Request, res: Response) => {
  try {
    const labelParam = (req.query['label'] as string) ?? 'warning,blocked';
    const labels = labelParam.split(',').filter((l) => ['safe', 'warning', 'blocked'].includes(l));
    const limit  = Math.min(parseInt((req.query['limit'] as string) ?? '50', 10), 200);
    const before = req.query['before'] ? new Date(req.query['before'] as string) : undefined;
    const senderId = req.query['senderId'] as string | undefined;

    const filter: Record<string, unknown> = { label: { $in: labels } };
    if (before) filter['createdAt'] = { $lt: before };
    if (senderId) filter['senderId'] = senderId;

    const logs = await ModerationLogModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const nextCursor = logs.length === limit
      ? logs[logs.length - 1]?.createdAt?.toISOString()
      : undefined;

    res.json({
      success: true,
      data: {
        logs,
        count: logs.length,
        nextCursor,
      },
    });
  } catch (err) {
    logger.error('[ModerationAdmin] GET / error', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/moderation/stats
 * Aggregate counts by label for dashboard widgets.
 */
moderationAdminRouter.get('/stats', async (_req: Request, res: Response) => {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000); // last 24h

    const stats = await ModerationLogModel.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: '$label',
          count: { $sum: 1 },
          avgConfidence: { $avg: '$confidence' },
        },
      },
    ]);

    const result: Record<string, { count: number; avgConfidence: number }> = {};
    for (const s of stats) {
      result[s._id as string] = {
        count: s.count as number,
        avgConfidence: parseFloat((s.avgConfidence as number).toFixed(3)),
      };
    }

    res.json({ success: true, data: { last24h: result } });
  } catch (err) {
    logger.error('[ModerationAdmin] GET /stats error', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * PATCH /api/admin/moderation/:logId/review
 * Mark a moderation log as reviewed.
 * Body: { action: 'pass' | 'block' | 'mute_user' }
 */
moderationAdminRouter.patch('/:logId/review', async (req: Request, res: Response) => {
  try {
    const { logId } = req.params;
    const { action } = req.body as { action?: string };
    const reviewerId = (req as Request & { userId?: string }).userId;

    if (!['pass', 'block', 'mute_user'].includes(action ?? '')) {
      res.status(400).json({ success: false, error: 'Invalid action. Use: pass | block | mute_user' });
      return;
    }

    const log = await ModerationLogModel.findByIdAndUpdate(
      logId,
      {
        $set: {
          action:     action as string,
          source:     'manual',
          reviewedAt: new Date(),
          reviewedBy: reviewerId,
        },
      },
      { new: true },
    );

    if (!log) {
      res.status(404).json({ success: false, error: 'Moderation log not found' });
      return;
    }

    res.json({ success: true, data: log });
  } catch (err) {
    logger.error('[ModerationAdmin] PATCH /:logId/review error', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});
