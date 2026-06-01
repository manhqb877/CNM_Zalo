import { Schema, model, type Document } from 'mongoose';

export interface IPostView extends Document {
  postId: string;
  viewerKey: string;
  lastViewedAt: Date;
}

const postViewSchema = new Schema<IPostView>(
  {
    postId: { type: String, required: true, index: true },
    viewerKey: { type: String, required: true, index: true },
    lastViewedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true },
);

postViewSchema.index({ postId: 1, viewerKey: 1 }, { unique: true });

export const PostViewModel = model<IPostView>('PostView', postViewSchema);
