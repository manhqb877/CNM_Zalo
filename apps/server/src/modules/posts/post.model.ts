import { Schema, model, type Document } from 'mongoose';

export type PostType = 'discussion' | 'question' | 'til' | 'showcase' | 'tutorial' | 'job';
export type PostStatus = 'published' | 'draft' | 'archived';

export interface IPost extends Document {
  authorId: string;
  title: string;
  content: string; // markdown
  codeSnippets: string[];
  mediaUrls: string[];
  images: string[];
  videoUrl?: string;
  tags: string[];
  type: PostType;
  channelId?: string;
  likesCount: number;
  commentsCount: number;
  viewsCount: number;
  likedBy: string[];
  bookmarkedBy: string[];
  favoritedBy: string[];
  status: PostStatus;
  createdAt: Date;
  updatedAt: Date;
}

const postSchema = new Schema<IPost>(
  {
    authorId: { type: String, required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    content: { type: String, required: true, maxlength: 50000 },
    codeSnippets: [{ type: String }],
    mediaUrls: [{ type: String }],
    images: [{ type: String }],
    videoUrl: { type: String },
    tags: [{ type: String, lowercase: true, trim: true }],
    type: {
      type: String,
      enum: ['discussion', 'question', 'til', 'showcase', 'tutorial', 'job'],
      default: 'discussion',
    },
    channelId: { type: String, index: true },
    likesCount: { type: Number, default: 0 },
    commentsCount: { type: Number, default: 0 },
    viewsCount: { type: Number, default: 0 },
    likedBy: [{ type: String }],
    bookmarkedBy: [{ type: String }],
    favoritedBy: [{ type: String }],
    status: {
      type: String,
      enum: ['published', 'draft', 'archived'],
      default: 'published',
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for performance
postSchema.index({ createdAt: -1 });
postSchema.index({ tags: 1, createdAt: -1 });
postSchema.index({ channelId: 1, createdAt: -1 });
postSchema.index({ likesCount: -1, createdAt: -1 });
postSchema.index({ authorId: 1, createdAt: -1 });

export const PostModel = model<IPost>('Post', postSchema);
