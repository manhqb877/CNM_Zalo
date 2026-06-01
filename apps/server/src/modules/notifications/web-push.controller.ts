import { type NextFunction, type Request, type Response } from 'express';
import { type AuthRequest } from '../../shared/middleware/auth.middleware';
import { type WebPushSubscribeDto } from './notifications.schema';
import { DeviceTokenModel } from '../users/device-token.model';
import { getVapidPublicKey, isWebPushConfigured } from '../../infrastructure/web-push';

// D2.1 – POST /api/notifications/web-push/subscribe
export async function subscribeWebPushHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    const { endpoint, keys } = req.body as WebPushSubscribeDto;

    await DeviceTokenModel.findOneAndUpdate(
      { userId, deviceToken: endpoint },
      {
        userId,
        deviceToken: endpoint,
        platform: 'web',
        pushSubscription: { endpoint, keys },
      },
      { upsert: true, new: true },
    );

    res.status(201).json({ success: true, message: 'Web Push subscription saved' });
  } catch (err) {
    next(err);
  }
}

// D2.2 – DELETE /api/notifications/web-push/unsubscribe
export async function unsubscribeWebPushHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    const { endpoint } = req.body as { endpoint: string };

    await DeviceTokenModel.findOneAndDelete({ userId, deviceToken: endpoint });
    res.json({ success: true, message: 'Web Push subscription removed' });
  } catch (err) {
    next(err);
  }
}

// D2.3 – GET /api/notifications/web-push/vapid-key
export async function getVapidKeyHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const key = getVapidPublicKey();
    res.json({
      success: true,
      configured: isWebPushConfigured(),
      vapidPublicKey: key ?? null,
    });
  } catch (err) {
    next(err);
  }
}
