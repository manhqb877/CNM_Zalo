import { apiClient } from './api';

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
  images: string[];
  videoUrl?: string;
  tags: string[];
  type: PostType;
  channelId?: string;
  likesCount: number;
  commentsCount: number;
  viewsCount: number;
  isLiked?: boolean;
  isBookmarked?: boolean;
  isFavorited?: boolean;
  favoritesCount?: number;
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
  images?: string[];
  videoUrl?: string;
  channelId?: string;
}

export interface FeedResponse {
  posts: Post[];
  nextCursor?: string;
}

export async function fetchFeed(cursor?: string, limit = 20): Promise<FeedResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  const { data } = await apiClient.get<{ success: boolean } & FeedResponse>(`/api/posts/feed?${params}`);
  return { posts: data.posts, nextCursor: data.nextCursor };
}

export async function fetchTrendingPosts(limit = 10): Promise<Post[]> {
  const { data } = await apiClient.get<{ success: boolean; data: Post[] }>(`/api/posts/trending?limit=${limit}`);
  return data.data;
}

export async function fetchPostById(postId: string): Promise<Post> {
  const { data } = await apiClient.get<{ success: boolean; data: Post }>(`/api/posts/${postId}`);
  return data.data;
}

export async function createPost(payload: CreatePostPayload): Promise<Post> {
  const { data } = await apiClient.post<{ success: boolean; data: Post }>('/api/posts', payload);
  return data.data;
}

export async function trackPostView(postId: string): Promise<{ viewCount: number; counted: boolean }> {
  const { data } = await apiClient.post<{ success: boolean; data: { viewCount: number; counted: boolean } }>(`/api/posts/${postId}/view`);
  return data.data;
}

export async function likePost(postId: string): Promise<{ liked: boolean; likesCount: number }> {
  const { data } = await apiClient.post<{ success: boolean; data: { liked: boolean; likesCount: number } }>(`/api/posts/${postId}/like`);
  return data.data;
}

export async function bookmarkPost(postId: string): Promise<{ bookmarked: boolean }> {
  const { data } = await apiClient.post<{ success: boolean; data: { bookmarked: boolean } }>(`/api/posts/${postId}/bookmark`);
  return data.data;
}

export async function favoritePost(postId: string): Promise<{ favorited: boolean; favoritesCount: number }> {
  const { data } = await apiClient.post<{ success: boolean; data: { favorited: boolean; favoritesCount: number } }>(`/api/posts/${postId}/favorite`);
  return data.data;
}

export async function fetchComments(postId: string): Promise<Comment[]> {
  const { data } = await apiClient.get<{ success: boolean; data: Comment[] }>(`/api/posts/${postId}/comments`);
  return data.data;
}

export async function addComment(postId: string, content: string, parentId?: string): Promise<Comment> {
  const { data } = await apiClient.post<{ success: boolean; data: Comment }>(`/api/posts/${postId}/comments`, { content, parentId });
  return data.data;
}

export async function fetchPostsByAuthor(authorId: string, limit = 3): Promise<Post[]> {
  const { data } = await apiClient.get<{ success: boolean; data: Post[] }>(`/api/posts/author?authorId=${encodeURIComponent(authorId)}&limit=${limit}`);
  return data.data;
}
