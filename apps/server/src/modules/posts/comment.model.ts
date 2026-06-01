import { Schema, model, type Document } from 'mongoose';

export interface IComment extends Document {
  postId: string;
  authorId: string;
  content: string; // markdown
  codeSnippet?: string;
  parentId?: string; // for replies
  likesCount: number;
  likedBy: string[];
  createdAt: Date;
  updatedAt: Date;
}

const commentSchema = new Schema<IComment>(
  {
    postId: { type: String, required: true, index: true },
    authorId: { type: String, required: true },
    content: { type: String, required: true, maxlength: 10000 },
    codeSnippet: { type: String },
    parentId: { type: String, index: true }, // null = top-level, string = reply
    likesCount: { type: Number, default: 0 },
    likedBy: [{ type: String }],
  },
  { timestamps: true },
);

commentSchema.index({ postId: 1, createdAt: 1 });

export const CommentModel = model<IComment>('Comment', commentSchema);
