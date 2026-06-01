import { Schema, model, type Document } from 'mongoose';

export type NotificationType =
  | 'new_message'
  | 'friend_request'
  | 'friend_accepted'
  | 'group_invite'
  | 'group_update'
  | 'post_like'
  | 'post_comment'
  | 'post_bookmark'
  | 'community_post';

export interface INotification extends Document {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, string>;
  conversationId?: string;
  fromUserId?: string;
  read: boolean;
  createdAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    userId: { type: String, required: true },
    type: {
      type: String,
      enum: [
        'new_message',
        'friend_request',
        'friend_accepted',
        'group_invite',
        'group_update',
        'post_like',
        'post_comment',
        'post_bookmark',
        'community_post',
      ],
      required: true,
    },
    title: { type: String, required: true },
    body: { type: String, required: true },
    data: { type: Map, of: String },
    conversationId: { type: String },
    fromUserId: { type: String },
    read: { type: Boolean, default: false },
  },
  { timestamps: true },
);

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, read: 1 });
// TTL index – MongoDB auto-deletes documents after 30 days
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 });

export const NotificationModel = model<INotification>('Notification', notificationSchema);
