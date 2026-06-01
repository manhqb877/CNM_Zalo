import { Schema, model, type Document } from 'mongoose';

export interface IPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface IDeviceToken extends Document {
  userId: string;
  deviceToken: string;
  platform: 'ios' | 'android' | 'web';
  pushSubscription?: IPushSubscription;
}

const pushSubscriptionSchema = new Schema<IPushSubscription>(
  {
    endpoint: { type: String, required: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
  },
  { _id: false },
);

const deviceTokenSchema = new Schema<IDeviceToken>(
  {
    userId: { type: String, required: true },
    deviceToken: { type: String, required: true, unique: true },
    platform: { type: String, enum: ['ios', 'android', 'web'], required: true },
    pushSubscription: { type: pushSubscriptionSchema },
  },
  { timestamps: true },
);

deviceTokenSchema.index({ userId: 1 });

export const DeviceTokenModel = model<IDeviceToken>('DeviceToken', deviceTokenSchema);
