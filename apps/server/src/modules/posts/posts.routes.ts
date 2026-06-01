import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.middleware';
import {
  createPostHandler,
  getFeedHandler,
  getTrendingHandler,
  getPostByIdHandler,
  trackPostViewHandler,
  updatePostHandler,
  deletePostHandler,
  toggleLikeHandler,
  toggleBookmarkHandler,
  toggleFavoriteHandler,
  addCommentHandler,
  getCommentsHandler,
  getPostsByAuthorHandler,
} from './posts.controller';

export const postsRouter = Router();

postsRouter.use(authenticate);

// POST /api/posts – Tạo bài viết
postsRouter.post('/', createPostHandler);

// GET /api/posts/feed – Feed cá nhân (cursor pagination)
postsRouter.get('/feed', getFeedHandler);

// GET /api/posts/trending – Trending
postsRouter.get('/trending', getTrendingHandler);

// GET /api/posts/author – Lấy bài viết theo tác giả (Chat Info Panel)
postsRouter.get('/author', getPostsByAuthorHandler);

// GET /api/posts/:postId – Chi tiết bài viết
postsRouter.get('/:postId', getPostByIdHandler);

// POST /api/posts/:postId/view – Track view with cooldown
postsRouter.post('/:postId/view', trackPostViewHandler);

// PATCH /api/posts/:postId – Sửa bài viết
postsRouter.patch('/:postId', updatePostHandler);

// DELETE /api/posts/:postId – Xóa bài viết
postsRouter.delete('/:postId', deletePostHandler);

// POST /api/posts/:postId/like – Like/unlike toggle
postsRouter.post('/:postId/like', toggleLikeHandler);

// POST /api/posts/:postId/bookmark – Bookmark toggle
postsRouter.post('/:postId/bookmark', toggleBookmarkHandler);

// POST /api/posts/:postId/favorite – Favorite toggle
postsRouter.post('/:postId/favorite', toggleFavoriteHandler);

// POST /api/posts/:postId/comments – Thêm comment
postsRouter.post('/:postId/comments', addCommentHandler);

// GET /api/posts/:postId/comments – Danh sách comments
postsRouter.get('/:postId/comments', getCommentsHandler);

