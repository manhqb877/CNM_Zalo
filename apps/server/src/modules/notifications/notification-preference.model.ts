import { Schema, model, type Document } from 'mongoose';

export interface INotificationPreference extends Document {
  userId: string;
  mutedConversations: string[];
  mutedUntil: Map<string, Date>;
  pinnedConversations: string[];
  enablePush: boolean;
  enableSound: boolean;
  enableBadge: boolean;
}

const notificationPreferenceSchema = new Schema<INotificationPreference>(
  {
    userId: { type: String, required: true },
    mutedConversations: [{ type: String }],
    mutedUntil: { type: Map, of: Date, default: new Map() },
    pinnedConversations: [{ type: String }],
    enablePush: { type: Boolean, default: true },
    enableSound: { type: Boolean, default: true },
    enableBadge: { type: Boolean, default: true },
  },
  { timestamps: true },
);

notificationPreferenceSchema.index({ userId: 1 }, { unique: true });

export const NotificationPreferenceModel = model<INotificationPreference>(
  'NotificationPreference',
  notificationPreferenceSchema,
);
