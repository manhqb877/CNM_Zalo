import { PostModel } from '../../modules/posts/post.model';
import { CommentModel } from '../../modules/posts/comment.model';
import { BaseRepository } from '../../shared/repositories/base.repository';
import type { Document } from 'mongoose';

/**
 * PostRepository - Tầng truy xuất dữ liệu cho Post
 * Bao gồm cả Comment vì chúng thuộc cùng domain.
 */
export class PostRepository extends BaseRepository<Document> {
  constructor() {
    super(PostModel as any);
  }

  /**
   * Feed với cursor pagination theo thời gian
   */
  async findFeed(
    cursor?: Date,
    limit: number = 20,
  ): Promise<Document[]> {
    const query: any = { status: 'published' };
    if (cursor) {
      query['createdAt'] = { $lt: cursor };
    }

    return this.model
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean() as unknown as Document[];
  }

  /**
   * Trending posts dựa trên engagement
   */
  async findTrending(limit: number = 10): Promise<Document[]> {
    return this.model
      .find({ status: 'published' })
      .sort({ likesCount: -1, commentsCount: -1, createdAt: -1 })
      .limit(limit)
      .lean() as unknown as Document[];
  }

  /**
   * Toggle like - trả về trạng thái mới
   */
  async toggleLike(postId: string, userId: string): Promise<{ liked: boolean; likesCount: number } | null> {
    const post = await this.model.findById(postId);
    if (!post) return null;

    const p = post as any;
    const alreadyLiked = (p.likedBy as string[]).includes(userId);

    if (alreadyLiked) {
      p.likedBy = (p.likedBy as string[]).filter((id: string) => id !== userId);
      p.likesCount = Math.max(0, p.likesCount - 1);
    } else {
      (p.likedBy as string[]).push(userId);
      p.likesCount = p.likesCount + 1;
    }

    await post.save();
    return { liked: !alreadyLiked, likesCount: p.likesCount };
  }

  /**
   * Toggle bookmark
   */
  async toggleBookmark(postId: string, userId: string): Promise<{ bookmarked: boolean } | null> {
    const post = await this.model.findById(postId);
    if (!post) return null;

    const p = post as any;
    const alreadyBookmarked = (p.bookmarkedBy as string[]).includes(userId);

    if (alreadyBookmarked) {
      p.bookmarkedBy = (p.bookmarkedBy as string[]).filter((id: string) => id !== userId);
    } else {
      (p.bookmarkedBy as string[]).push(userId);
    }

    await post.save();
    return { bookmarked: !alreadyBookmarked };
  }

  /**
   * Increment view count
   */
  async incrementViews(postId: string): Promise<Document | null> {
    return this.model
      .findByIdAndUpdate(postId, { $inc: { viewsCount: 1 } }, { new: true })
      .lean() as unknown as Document | null;
  }

  /**
   * Lay bai viet theo tac gia (dung cho Chat Info Panel)
   */
  async findByAuthor(authorId: string, limit: number = 3): Promise<Document[]> {
    return this.model
      .find({ authorId, status: 'published' })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean() as unknown as Document[];
  }
}

/**
 * CommentRepository - Tầng truy xuất dữ liệu cho Comment
 */
export class CommentRepository extends BaseRepository<Document> {
  constructor() {
    super(CommentModel as any);
  }

  async findByPost(postId: string, limit: number = 100): Promise<Document[]> {
    return this.model
      .find({ postId })
      .sort({ createdAt: 1 })
      .limit(limit)
      .lean() as unknown as Document[];
  }
}

/** Singleton instances */
export const postRepository = new PostRepository();
export const commentRepository = new CommentRepository();
