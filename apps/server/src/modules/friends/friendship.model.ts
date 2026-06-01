import { Schema, model, type Document } from 'mongoose';

export type FriendshipStatus = 'pending' | 'accepted' | 'blocked';

export interface IFriendship extends Document {
  userId: string;
  friendId: string;
  status: FriendshipStatus;
  createdAt: Date;
  updatedAt: Date;
}

const friendshipSchema = new Schema<IFriendship>(
  {
    userId: { type: String, required: true },
    friendId: { type: String, required: true },
    status: { type: String, enum: ['pending', 'accepted', 'blocked'], required: true },
  },
  { timestamps: true },
);

friendshipSchema.index({ userId: 1, friendId: 1 }, { unique: true });
friendshipSchema.index({ status: 1 });

export const FriendshipModel = model<IFriendship>('Friendship', friendshipSchema);
