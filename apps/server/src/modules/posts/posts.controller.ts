import { type Request, type Response, type NextFunction } from 'express';
import { type AuthRequest } from '../../shared/middleware/auth.middleware';
import { PostsService } from './posts.service';

export async function createPostHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    const post = await PostsService.createPost(userId, req.body as Parameters<typeof PostsService.createPost>[1]);
    res.status(201).json({ success: true, data: post });
  } catch (err) { next(err); }
}

export async function getFeedHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    const cursor = req.query['cursor'] as string | undefined;
    const limit = Number(req.query['limit'] ?? 20);
    const result = await PostsService.getFeed(userId, cursor, limit);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

export async function getTrendingHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    const limit = Number(req.query['limit'] ?? 10);
    const posts = await PostsService.getTrending(userId, limit);
    res.json({ success: true, data: posts });
  } catch (err) { next(err); }
}

export async function getPostByIdHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    const post = await PostsService.getPostById(req.params['postId'] as string, userId);
    res.json({ success: true, data: post });
  } catch (err) { next(err); }
}

export async function trackPostViewHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    const ipHeader = req.headers['x-forwarded-for'];
    const forwarded = Array.isArray(ipHeader) ? ipHeader[0] : ipHeader;
    const ip = forwarded?.split(',')[0]?.trim() || req.ip;
    const userAgent = req.headers['user-agent'];
    const deviceId = req.headers['x-device-id'];

    const result = await PostsService.trackPostView(
      req.params['postId'] as string,
      userId,
      {
        ip,
        userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent,
        deviceId: Array.isArray(deviceId) ? deviceId[0] : deviceId,
      },
    );

    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function updatePostHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    const post = await PostsService.updatePost(req.params['postId'] as string, userId, req.body as { title?: string; content?: string; tags?: string[] });
    res.json({ success: true, data: post });
  } catch (err) { next(err); }
}

export async function deletePostHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    await PostsService.deletePost(req.params['postId'] as string, userId);
    res.json({ success: true, message: 'Đã xóa bài viết' });
  } catch (err) { next(err); }
}

export async function toggleLikeHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    const result = await PostsService.toggleLike(req.params['postId'] as string, userId);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function toggleBookmarkHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    const result = await PostsService.toggleBookmark(req.params['postId'] as string, userId);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function toggleFavoriteHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    const result = await PostsService.toggleFavorite(req.params['postId'] as string, userId);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function addCommentHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    const comment = await PostsService.addComment(req.params['postId'] as string, userId, req.body as { content: string; codeSnippet?: string; parentId?: string });
    res.status(201).json({ success: true, data: comment });
  } catch (err) { next(err); }
}

export async function getCommentsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    const comments = await PostsService.getComments(req.params['postId'] as string, userId);
    res.json({ success: true, data: comments });
  } catch (err) { next(err); }
}

export async function getPostsByAuthorHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    const authorId = req.query['authorId'] as string | undefined;
    const limit = Number(req.query['limit'] ?? 3);

    if (!authorId) {
      res.status(400).json({ success: false, error: 'authorId is required' });
      return;
    }

    const posts = await PostsService.getPostsByAuthor(authorId, userId, limit);
    res.json({ success: true, data: posts });
  } catch (err) { next(err); }
}
