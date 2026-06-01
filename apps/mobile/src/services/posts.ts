import api from './api';

export type PostType = 'discussion' | 'question' | 'til' | 'showcase' | 'tutorial' | 'job';

export interface PostAuthor {
  _id: string;
  displayName: string;
  avatarUrl?: string;
  devRole?: string;
  skills?: string[];
}

export interface Post {
  _id: string;
  authorId: string;
  author?: PostAuthor;
  title: string;
  content: string;
  codeSnippets: string[];
  mediaUrls: string[];
  tags: string[];
  type: PostType;
  channelId?: string;
  likesCount: number;
  commentsCount: number;
  viewsCount: number;
  isLiked?: boolean;
  isBookmarked?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  _id: string;
  postId: string;
  authorId: string;
  author?: PostAuthor;
  content: string;
  codeSnippet?: string;
  parentId?: string;
  likesCount: number;
  isLiked?: boolean;
  createdAt: string;
}

export interface CreatePostPayload {
  title: string;
  content: string;
  type?: PostType;
  tags?: string[];
  codeSnippets?: string[];
  channelId?: string;
}

export interface FeedResponse {
  posts: Post[];
  nextCursor?: string;
}

export async function fetchFeed(
  cursor?: string,
  limit = 20,
  filter?: string
): Promise<FeedResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  if (filter) params.set('filter', filter);
  const { data } = await api.get<{ success: boolean } & FeedResponse>(
    `/posts/feed?${params}`
  );
  return { posts: data.posts, nextCursor: data.nextCursor };
}

export async function fetchTrendingPosts(limit = 10): Promise<Post[]> {
  const { data } = await api.get<{ success: boolean; data: Post[] }>(
    `/posts/trending?limit=${limit}`
  );
  return data.data;
}

export async function fetchPostById(postId: string): Promise<Post> {
  const { data } = await api.get<{ success: boolean; data: Post }>(
    `/posts/${postId}`
  );
  return data.data;
}

export async function createPost(payload: CreatePostPayload): Promise<Post> {
  const { data } = await api.post<{ success: boolean; data: Post }>(
    '/posts',
    payload
  );
  return data.data;
}

export async function likePost(
  postId: string
): Promise<{ liked: boolean; likesCount: number }> {
  const { data } = await api.post<{
    success: boolean;
    data: { liked: boolean; likesCount: number };
  }>(`/posts/${postId}/like`);
  return data.data;
}

export async function bookmarkPost(
  postId: string
): Promise<{ bookmarked: boolean }> {
  const { data } = await api.post<{
    success: boolean;
    data: { bookmarked: boolean };
  }>(`/posts/${postId}/bookmark`);
  return data.data;
}

export async function fetchComments(postId: string): Promise<Comment[]> {
  const { data } = await api.get<{ success: boolean; data: Comment[] }>(
    `/posts/${postId}/comments`
  );
  return data.data;
}

export async function addComment(
  postId: string,
  content: string,
  parentId?: string
): Promise<Comment> {
  const { data } = await api.post<{ success: boolean; data: Comment }>(
    `/posts/${postId}/comments`,
    { content, parentId }
  );
  return data.data;
}
