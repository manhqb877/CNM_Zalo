import { useState, useCallback, useEffect } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { socketService } from '../services/socket';
import type { Post, Comment } from '../services/posts';
import {
  fetchFeed,
  fetchTrendingPosts,
  fetchPostById,
  createPost,
  likePost,
  bookmarkPost,
  fetchComments,
  addComment,
  type CreatePostPayload,
} from '../services/posts';

export type PostFilter = 'latest' | 'trending' | 'question' | 'til';

interface UsePostsOptions {
  initialFilter?: PostFilter;
  initialLimit?: number;
}

export function usePosts(options: UsePostsOptions = {}) {
  const { initialFilter = 'latest', initialLimit = 20 } = options;
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [filter, setFilter] = useState<PostFilter>(initialFilter);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const loadPosts = useCallback(
    async (filterValue?: PostFilter, resetCursor = false) => {
      const activeFilter = filterValue ?? filter;
      try {
        setError(null);
        if (resetCursor || !cursor || activeFilter !== filter) {
          setIsLoading(true);
          setPosts([]);
          setCursor(undefined);
          setHasMore(true);

          if (activeFilter === 'trending') {
            const trending = await fetchTrendingPosts(initialLimit);
            setPosts(trending);
            setHasMore(false);
          } else {
            const filterParam =
              activeFilter === 'latest'
                ? undefined
                : activeFilter === 'question'
                ? 'question'
                : activeFilter === 'til'
                ? 'til'
                : undefined;
            const result = await fetchFeed(undefined, initialLimit, filterParam);
            setPosts(result.posts);
            setCursor(result.nextCursor);
            setHasMore(!!result.nextCursor);
          }
          if (activeFilter !== filter) setFilter(activeFilter);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Không thể tải bài viết');
      } finally {
        setIsLoading(false);
      }
    },
    [filter, cursor, initialLimit]
  );

  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore || filter === 'trending') return;
    try {
      setIsLoadingMore(true);
      const filterParam =
        filter === 'latest'
          ? undefined
          : filter === 'question'
          ? 'question'
          : filter === 'til'
          ? 'til'
          : undefined;
      const result = await fetchFeed(cursor, initialLimit, filterParam);
      setPosts((prev) => {
        const existingIds = new Set(prev.map((p) => p._id));
        const newPosts = result.posts.filter((p) => !existingIds.has(p._id));
        return [...prev, ...newPosts];
      });
      setCursor(result.nextCursor);
      setHasMore(!!result.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải thêm');
    } finally {
      setIsLoadingMore(false);
    }
  }, [cursor, filter, hasMore, isLoadingMore, initialLimit]);

  const changeFilter = useCallback(
    (newFilter: PostFilter) => {
      setFilter(newFilter);
      setCursor(undefined);
      setHasMore(true);
      setPosts([]);
      loadPosts(newFilter, true);
    },
    [loadPosts]
  );

  const handleCreatePost = useCallback(
    async (payload: CreatePostPayload): Promise<Post | null> => {
      try {
        const post = await createPost(payload);
        setPosts((prev) => [post, ...prev]);
        return post;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Không thể tạo bài viết');
        return null;
      }
    },
    []
  );

  const handleLikePost = useCallback(
    async (postId: string) => {
      const prev = [...posts];
      setPosts((current) =>
        current.map((p) =>
          p._id === postId
            ? {
                ...p,
                isLiked: !p.isLiked,
                likesCount: p.isLiked ? p.likesCount - 1 : p.likesCount + 1,
              }
            : p
        )
      );
      try {
        await likePost(postId);
      } catch {
        setPosts(prev);
      }
    },
    [posts]
  );

  const handleBookmarkPost = useCallback(
    async (postId: string) => {
      const prev = [...posts];
      setPosts((current) =>
        current.map((p) =>
          p._id === postId ? { ...p, isBookmarked: !p.isBookmarked } : p
        )
      );
      try {
        await bookmarkPost(postId);
      } catch {
        setPosts(prev);
      }
    },
    [posts]
  );

  const updatePost = useCallback((updatedPost: Post) => {
    setPosts((current) =>
      current.map((p) => (p._id === updatedPost._id ? updatedPost : p))
    );
  }, []);

  // Socket listeners
  useEffect(() => {
    const socket = socketService.getSocket();
    if (!socket) return;

    const handleNewPost = (post: Post) => {
      setPosts((prev) => {
        if (prev.some((p) => p._id === post._id)) return prev;
        return [post, ...prev];
      });
    };

    const handlePostLiked = (data: { postId: string; likesCount: number }) => {
      setPosts((current) =>
        current.map((p) =>
          p._id === data.postId
            ? { ...p, likesCount: data.likesCount }
            : p
        )
      );
    };

    const handlePostCommented = (data: { postId: string; commentsCount: number }) => {
      setPosts((current) =>
        current.map((p) =>
          p._id === data.postId
            ? { ...p, commentsCount: data.commentsCount }
            : p
        )
      );
    };

    socket.on('new_post', handleNewPost);
    socket.on('post_liked', handlePostLiked);
    socket.on('post_commented', handlePostCommented);

    return () => {
      socket.off('new_post', handleNewPost);
      socket.off('post_liked', handlePostLiked);
      socket.off('post_commented', handlePostCommented);
    };
  }, []);

  return {
    posts,
    isLoading,
    isLoadingMore,
    hasMore,
    filter,
    error,
    loadPosts: (reset = false) => loadPosts(undefined, reset),
    loadMore,
    changeFilter,
    handleCreatePost,
    handleLikePost,
    handleBookmarkPost,
    updatePost,
  };
}

export function usePostDetail(postId: string) {
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoadingPost, setIsLoadingPost] = useState(false);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPost = useCallback(async () => {
    try {
      setIsLoadingPost(true);
      setError(null);
      const data = await fetchPostById(postId);
      setPost(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải bài viết');
    } finally {
      setIsLoadingPost(false);
    }
  }, [postId]);

  const loadComments = useCallback(async () => {
    try {
      setIsLoadingComments(true);
      const data = await fetchComments(postId);
      setComments(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải bình luận');
    } finally {
      setIsLoadingComments(false);
    }
  }, [postId]);

  const handleAddComment = useCallback(
    async (content: string, parentId?: string): Promise<Comment | null> => {
      try {
        const comment = await addComment(postId, content, parentId);
        setComments((prev) => [...prev, comment]);
        setPost((p) =>
          p ? { ...p, commentsCount: p.commentsCount + 1 } : p
        );
        return comment;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Không thể gửi bình luận'
        );
        return null;
      }
    },
    [postId]
  );

  useEffect(() => {
    loadPost();
    loadComments();
  }, [loadPost, loadComments]);

  // Socket listeners for real-time updates
  useEffect(() => {
    const socket = socketService.getSocket();
    if (!socket) return;

    const handlePostLiked = (data: { postId: string; likesCount: number }) => {
      if (data.postId === postId) {
        setPost((p) => (p ? { ...p, likesCount: data.likesCount } : p));
      }
    };

    const handlePostCommented = (data: {
      postId: string;
      commentsCount: number;
    }) => {
      if (data.postId === postId) {
        setPost((p) => (p ? { ...p, commentsCount: data.commentsCount } : p));
      }
    };

    const handleNewComment = (comment: Comment) => {
      if (comment.postId === postId) {
        setComments((prev) => {
          if (prev.some((c) => c._id === comment._id)) return prev;
          return [...prev, comment];
        });
      }
    };

    socket.on('post_liked', handlePostLiked);
    socket.on('post_commented', handlePostCommented);
    socket.on('new_comment', handleNewComment);

    return () => {
      socket.off('post_liked', handlePostLiked);
      socket.off('post_commented', handlePostCommented);
      socket.off('new_comment', handleNewComment);
    };
  }, [postId]);

  return {
    post,
    comments,
    isLoadingPost,
    isLoadingComments,
    error,
    loadPost,
    loadComments,
    handleAddComment,
  };
}
