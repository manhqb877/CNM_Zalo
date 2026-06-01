'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  MessageCircle,
  HelpCircle,
  Lightbulb,
  Rocket,
  BookOpen,
  Briefcase,
  Heart,
  Bookmark,
  BookmarkCheck,
  Eye,
  MessageSquare,
  PenLine,
  TrendingUp,
  Tag,
  X,
  Globe,
  Star,
  ImagePlus,
  Video,
  Trash2,
  AlertCircle,
} from 'lucide-react';
import {
  fetchFeed,
  fetchTrendingPosts,
  createPost,
  likePost,
  bookmarkPost,
  favoritePost,
  fetchPostById,
  trackPostView,
  type Post,
  type PostType,
} from '@/services/posts';
import { uploadFile } from '@/services/upload';
import { CommentPanel } from '@/components/community/organisms/CommentPanel';
import { EmptyState } from '@/components/shared/EmptyState';
import { UserProfileModal } from '@/components/shared/UserProfileModal';
import { useNavigationFlow } from '@/hooks/use-navigation-flow';
import type { Comment } from '@/services/posts';
import { ButtonSpinner, PageSkeleton } from '@/components/shared/loading-system';

interface PostTypeConfig {
  label: string;
  Icon: React.ElementType;
}

const POST_TYPE_CONFIG: Record<PostType, PostTypeConfig> = {
  discussion: { label: 'Thảo luận', Icon: MessageCircle },
  question: { label: 'Câu hỏi', Icon: HelpCircle },
  til: { label: 'TIL', Icon: Lightbulb },
  showcase: { label: 'Showcase', Icon: Rocket },
  tutorial: { label: 'Hướng dẫn', Icon: BookOpen },
  job: { label: 'Tuyển dụng', Icon: Briefcase },
};

const FEED_TABS: { id: string; label: string; Icon: React.ElementType }[] = [
  { id: 'feed', label: 'Mới nhất', Icon: MessageSquare },
  { id: 'trending', label: 'Thịnh hành', Icon: TrendingUp },
  { id: 'question', label: 'Câu hỏi', Icon: HelpCircle },
  { id: 'til', label: 'TIL', Icon: Lightbulb },
];

const POPULAR_TAGS = ['react', 'nodejs', 'typescript', 'python', 'devops', 'ai-ml', 'docker', 'nextjs'];

interface CreatePostFormProps {
  onClose: () => void;
  onSuccess: (post: Post) => void;
}

function CreatePostForm({ onClose, onSuccess }: CreatePostFormProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [type, setType] = useState<PostType>('discussion');
  const [tags, setTags] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [images, setImages] = useState<File[]>([]);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const MAX_IMAGES = 6;
  const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
  const MAX_VIDEO_SIZE = 30 * 1024 * 1024;
  const acceptedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  const acceptedVideoTypes = ['video/mp4', 'video/webm'];

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const fileList = Array.from(files);
    const pickedImages = fileList.filter((f) => acceptedImageTypes.includes(f.type));
    const pickedVideos = fileList.filter((f) => acceptedVideoTypes.includes(f.type));
    const invalid = fileList.filter((f) => !acceptedImageTypes.includes(f.type) && !acceptedVideoTypes.includes(f.type));

    if (invalid.length > 0) {
      setError('Chỉ hỗ trợ ảnh jpg/jpeg/png/webp và video mp4/webm.');
      return;
    }

    if (pickedImages.some((file) => file.size > MAX_IMAGE_SIZE)) {
      setError('Mỗi ảnh tối đa 5MB.');
      return;
    }

    if (pickedVideos.some((file) => file.size > MAX_VIDEO_SIZE)) {
      setError('Video tối đa 30MB.');
      return;
    }

    setImages((prev) => {
      const next = [...prev, ...pickedImages];
      if (next.length > MAX_IMAGES) {
        setError(`Tối đa ${MAX_IMAGES} ảnh.`);
        return prev;
      }
      return next;
    });

    if (pickedVideos[0]) {
      setVideoFile(pickedVideos[0]);
    }

    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const imageUrls: string[] = [];
      for (const image of images) {
        const url = await uploadFile(image, 'community/images');
        imageUrls.push(url);
      }
      let videoUrl: string | undefined;
      if (videoFile) {
        videoUrl = await uploadFile(videoFile, 'community/videos');
      }

      const post = await createPost({
        title: title.trim(),
        content: content.trim(),
        type,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        images: imageUrls,
        videoUrl,
      });
      onSuccess(post);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'Có lỗi xảy ra. Vui lòng thử lại.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="zync-soft-card zync-soft-card-elevated w-full max-w-2xl rounded-[1.8rem] p-6 sm:p-8">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-ui-title flex items-center gap-2 text-xl text-text-primary">
            <PenLine className="h-5 w-5 text-accent" />
            Tạo bài viết mới
          </h2>
          <button onClick={onClose} className="zync-soft-button-ghost flex h-9 w-9 items-center justify-center rounded-full p-0 text-text-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="font-ui-meta mb-2 block text-[0.72rem] uppercase tracking-[0.18em] text-text-tertiary">Loại bài viết</label>
            <div className="flex flex-wrap gap-2">
              {(Object.entries(POST_TYPE_CONFIG) as [PostType, PostTypeConfig][]).map(([key, cfg]) => {
                const Icon = cfg.Icon;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setType(key)}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition ${
                      type === key
                        ? 'bg-accent text-[var(--bg-primary)] shadow-sm'
                        : 'border border-border bg-[var(--surface-glass)] text-text-secondary hover:border-accent'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="font-ui-meta mb-2 block text-[0.72rem] uppercase tracking-[0.18em] text-text-tertiary">Tiêu đề</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Tiêu đề bài viết..." className="zync-soft-input" required />
          </div>

          <div>
            <label className="font-ui-meta mb-2 block text-[0.72rem] uppercase tracking-[0.18em] text-text-tertiary">Nội dung</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Chia sẻ kiến thức, kinh nghiệm của bạn... (hỗ trợ Markdown)"
              className="zync-soft-textarea min-h-[140px]"
              required
            />
          </div>

          <div>
            <label className="font-ui-meta mb-2 block text-[0.72rem] uppercase tracking-[0.18em] text-text-tertiary">Tags (cách nhau bằng dấu phẩy)</label>
            <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="react, nodejs, typescript..." className="zync-soft-input" />
          </div>

          <div>
            <label className="font-ui-meta mb-2 block text-[0.72rem] uppercase tracking-[0.18em] text-text-tertiary">Media</label>
            <div
              className="rounded-2xl border border-dashed border-border bg-bg-hover/50 p-4 transition hover:border-accent/50"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                addFiles(event.dataTransfer.files);
              }}
            >
              <input
                id="community-media-upload"
                type="file"
                multiple
                accept=".jpg,.jpeg,.png,.webp,.mp4,.webm"
                className="hidden"
                onChange={(event) => addFiles(event.target.files)}
              />
              <label htmlFor="community-media-upload" className="flex cursor-pointer items-center justify-center gap-2 text-sm text-text-secondary">
                <ImagePlus className="h-4 w-4" />
                <span>Kéo thả hoặc chọn ảnh/video</span>
                <Video className="h-4 w-4" />
              </label>

              {images.length > 0 && (
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {images.map((file, idx) => (
                    <div key={`${file.name}-${idx}`} className="group relative overflow-hidden rounded-xl border border-border bg-bg-card">
                      <img src={URL.createObjectURL(file)} alt={file.name} className="h-24 w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setImages((prev) => prev.filter((_, i) => i !== idx))}
                        className="absolute right-1 top-1 rounded-full bg-black/65 p-1 text-white opacity-0 transition group-hover:opacity-100"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {videoFile && (
                <div className="mt-3 rounded-xl border border-border p-2">
                  <video src={URL.createObjectURL(videoFile)} controls className="max-h-48 w-full rounded-lg" />
                  <button
                    type="button"
                    onClick={() => setVideoFile(null)}
                    className="mt-2 inline-flex items-center gap-1 text-xs text-text-tertiary hover:text-red-400"
                  >
                    <Trash2 className="h-3 w-3" />
                    Xóa video
                  </button>
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-500">
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex justify-end gap-3 border-t border-border pt-4">
            <button type="button" onClick={onClose} className="zync-soft-button-secondary px-5 py-2.5 text-sm">Hủy</button>
            <button type="submit" disabled={submitting || !title.trim() || !content.trim()} className="zync-soft-button flex items-center gap-2 px-6 py-2.5 text-sm">
              {submitting ? <ButtonSpinner size="sm" tone="light" /> : <Rocket className="h-4 w-4" />}
              {submitting ? 'Đang đăng...' : 'Đăng bài'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Vừa xong';
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return `${Math.floor(hours / 24)} ngày trước`;
}

function PostCard({ post, onLike, onBookmark, onComment, onFavorite, onAuthorClick }: { post: Post; onLike: (id: string) => void; onBookmark: (id: string) => void; onComment: (post: Post) => void; onFavorite: (id: string) => void; onAuthorClick?: (authorId: string, author: Post['author']) => void }) {
  const cfg = POST_TYPE_CONFIG[post.type] ?? POST_TYPE_CONFIG['discussion'];
  const TypeIcon = cfg.Icon;
  const authorInitials = post.author?.displayName?.slice(0, 2).toUpperCase() ?? '??';

  return (
    <article
      id={`community-post-${post._id}`}
      className="group relative flex flex-col rounded-[var(--radius-card)] border border-border-soft bg-[var(--surface)] p-4 shadow-soft transition-all hover:border-border-strong hover:shadow-soft-hover sm:p-5"
      onClick={() => onComment(post)}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAuthorClick?.(post.authorId, post.author);
          }}
          className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-light text-sm font-semibold text-accent-strong transition-opacity hover:opacity-80"
        >
          {post.author?.avatarUrl ? (
            <img src={post.author.avatarUrl} alt={post.author.displayName} className="h-full w-full object-cover" />
          ) : authorInitials}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAuthorClick?.(post.authorId, post.author);
              }}
              className="font-ui-title text-sm text-text-primary transition-colors hover:text-accent"
            >
              {post.author?.displayName ?? 'Ẩn danh'}
            </button>
            {post.author?.devRole && (
              <span className="rounded-full bg-bg-hover px-2 py-0.5 text-xs text-text-tertiary">{post.author.devRole}</span>
            )}
            <span className="text-xs text-text-tertiary">{formatTimeAgo(post.createdAt)}</span>
          </div>
          <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-border bg-bg-hover px-2.5 py-0.5 text-xs font-medium text-text-secondary">
            <TypeIcon className="h-3 w-3" />
            {cfg.label}
          </span>
        </div>
      </div>

      <h3 className="font-ui-title mt-4 cursor-pointer text-lg leading-snug text-text-primary transition-colors group-hover:text-accent">{post.title}</h3>
      <p className="font-ui-content mt-1.5 line-clamp-3 text-sm leading-relaxed text-text-secondary">{post.content}</p>

      {(post.images?.length > 0 || post.videoUrl) && (
        <div className="mt-3 space-y-2">
          {post.images?.length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {post.images.slice(0, 3).map((imageUrl) => (
                <img
                  key={imageUrl}
                  src={imageUrl}
                  alt="Post media"
                  className="h-24 w-full rounded-xl border border-border object-cover"
                />
              ))}
            </div>
          )}
          {post.videoUrl && (
            <video
              src={post.videoUrl}
              controls
              className="max-h-64 w-full rounded-xl border border-border"
            />
          )}
        </div>
      )}

      {post.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {post.tags.slice(0, 5).map((tag) => (
            <span key={tag} className="flex items-center gap-1 rounded-full border border-border bg-bg-hover px-2.5 py-0.5 text-xs text-text-tertiary">
              <Tag className="h-2.5 w-2.5" />
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center gap-4 border-t border-border-light pt-3">
        <button
          onClick={(e) => { e.stopPropagation(); void onLike(post._id); }}
          type="button"
          className={`flex items-center gap-1.5 text-sm transition ${post.isLiked ? 'text-rose-500' : 'text-text-tertiary hover:text-rose-500'}`}
        >
          <Heart className={`h-4 w-4 ${post.isLiked ? 'fill-current' : ''}`} />
          <span>{post.likesCount}</span>
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); onComment(post); }}
          type="button"
          className="flex items-center gap-1.5 text-sm text-text-tertiary transition hover:text-text-primary"
        >
          <MessageSquare className="h-4 w-4" />
          <span>{post.commentsCount}</span>
        </button>

        <button type="button" className="flex items-center gap-1.5 text-sm text-text-tertiary transition hover:text-text-primary">
          <Eye className="h-4 w-4" />
          <span>{post.viewsCount}</span>
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); void onBookmark(post._id); }}
          type="button"
          className={`flex items-center gap-1.5 text-sm transition ${post.isBookmarked ? 'text-accent' : 'text-text-tertiary hover:text-accent'}`}
        >
          {post.isBookmarked ? <BookmarkCheck className="h-4 w-4 fill-current" /> : <Bookmark className="h-4 w-4" />}
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); void onFavorite(post._id); }}
          type="button"
          className={`ml-auto flex items-center gap-1.5 text-sm transition ${post.isFavorited ? 'text-yellow-500' : 'text-text-tertiary hover:text-yellow-500'}`}
        >
          <Star className={`h-4 w-4 ${post.isFavorited ? 'fill-current' : ''}`} />
          <span>{post.favoritesCount ?? 0}</span>
        </button>
      </div>
    </article>
  );
}

export default function CommunityContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const postIdFromQuery = searchParams.get('post') ?? searchParams.get('postId');
  const deepLinkTargetRef = useRef<string | null>(null);

  const [posts, setPosts] = useState<Post[]>([]);
  const [trendingPosts, setTrendingPosts] = useState<Post[]>([]);
  const [activeTab, setActiveTab] = useState<string>('feed');
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [trackingViewPostId, setTrackingViewPostId] = useState<string | null>(null);

  // Navigation flow for author profile
  const {
    navigateToChat,
    sendFriendRequest,
    profileModalUserId,
    profileModalOpen,
    profileModalUser,
    profileModalLoading,
    currentUserId,
    openProfileModal,
    closeProfileModal,
  } = useNavigationFlow();

  const loadPosts = useCallback(async (tab: string, cursor?: string) => {
    setLoading(true);
    try {
      if (tab === 'trending') {
        const data = await fetchTrendingPosts(20);
        setPosts(data);
      } else {
        const { posts: data, nextCursor: nc } = await fetchFeed(cursor, 20);
        if (cursor) {
          setPosts((prev) => [...prev, ...data]);
        } else {
          setPosts(data);
        }
        setNextCursor(nc);
      }
    } catch {/* ignore */} finally {
      setLoading(false);
    }
  }, []);

  const loadTrending = useCallback(async () => {
    try {
      const data = await fetchTrendingPosts(5);
      setTrendingPosts(data);
    } catch {/* ignore */}
  }, []);

  useEffect(() => { loadPosts('feed'); loadTrending(); }, [loadPosts, loadTrending]);

  /** Open feed post from ?post= (e.g. thông báo bài viết cộng đồng) */
  useEffect(() => {
    if (!postIdFromQuery || loading) return;
    if (deepLinkTargetRef.current === postIdFromQuery) return;

    let cancelled = false;

    const open = async () => {
      try {
        setActiveTab('feed');
        const inFeed = posts.some((p) => p._id === postIdFromQuery);
        let target: Post;
        if (inFeed) {
          target = posts.find((p) => p._id === postIdFromQuery)!;
        } else {
          target = await fetchPostById(postIdFromQuery);
          if (cancelled) return;
          setPosts((prev) => (prev.some((p) => p._id === target._id) ? prev : [target, ...prev]));
        }
        if (cancelled) return;
        deepLinkTargetRef.current = postIdFromQuery;
        setSelectedPost(target);
        router.replace('/community', { scroll: false });
        window.setTimeout(() => {
          document.getElementById(`community-post-${target._id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 200);
      } catch {
        if (!cancelled) {
          router.replace('/community', { scroll: false });
        }
      }
    };

    void open();
    return () => {
      cancelled = true;
    };
  }, [postIdFromQuery, loading, posts, router]);

  useEffect(() => {
    if (!postIdFromQuery) {
      deepLinkTargetRef.current = null;
    }
  }, [postIdFromQuery]);

  const handleTabChange = (tab: string) => { setActiveTab(tab); setNextCursor(undefined); loadPosts(tab); };
  const handleLike = async (postId: string) => {
    try {
      const { liked, likesCount } = await likePost(postId);
      setPosts((prev) => prev.map((p) => p._id === postId ? { ...p, isLiked: liked, likesCount } : p));
    } catch {/* ignore */}
  };
  const handleBookmark = async (postId: string) => {
    try {
      const { bookmarked } = await bookmarkPost(postId);
      setPosts((prev) => prev.map((p) => p._id === postId ? { ...p, isBookmarked: bookmarked } : p));
    } catch {/* ignore */}
  };
  const handlePostCreated = (post: Post) => { setPosts((prev) => [post, ...prev]); setShowCreateForm(false); };
  const handleComment = (post: Post) => { setSelectedPost(post); };
  const handleCommentAdded = (comment: Comment) => {
    if (!selectedPost) return;
    setPosts((prev) => prev.map((p) => p._id === selectedPost._id ? { ...p, commentsCount: p.commentsCount + 1 } : p));
  };
  const handleFavorite = async (postId: string) => {
    try {
      const { favorited, favoritesCount } = await favoritePost(postId);
      setPosts((prev) => prev.map((p) => p._id === postId ? { ...p, isFavorited: favorited, favoritesCount } : p));
    } catch {/* ignore */}
  };
  const handleAuthorClick = (authorId: string) => {
    if (currentUserId && authorId === currentUserId) {
      router.push('/profile');
      return;
    }
    void openProfileModal(authorId);
  };

  useEffect(() => {
    if (!selectedPost) {
      setTrackingViewPostId(null);
    }
  }, [selectedPost]);

  useEffect(() => {
    if (!selectedPost || trackingViewPostId === selectedPost._id) {
      return;
    }

    setTrackingViewPostId(selectedPost._id);
    setPosts((prev) => prev.map((post) => (
      post._id === selectedPost._id ? { ...post, viewsCount: post.viewsCount + 1 } : post
    )));

    const execute = async () => {
      try {
        let result;
        try {
          result = await trackPostView(selectedPost._id);
        } catch {
          result = await trackPostView(selectedPost._id);
        }
        setPosts((prev) => prev.map((post) => (
          post._id === selectedPost._id ? { ...post, viewsCount: result!.viewCount } : post
        )));
      } catch {
        setPosts((prev) => prev.map((post) => (
          post._id === selectedPost._id ? { ...post, viewsCount: Math.max(0, post.viewsCount - 1) } : post
        )));
        setTrackingViewPostId(null);
      }
    };
    void execute();
  }, [selectedPost, trackingViewPostId]);

  return (
    <div className="flex h-full w-full overflow-hidden">
      {showCreateForm && <CreatePostForm onClose={() => setShowCreateForm(false)} onSuccess={handlePostCreated} />}
      {selectedPost && (
        <CommentPanel
          post={selectedPost}
          onClose={() => setSelectedPost(null)}
          onCommentAdded={handleCommentAdded}
        />
      )}

      <div className="flex h-full w-full overflow-hidden">
        {/* Feed */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="zync-page-header">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-ui-meta text-[0.7rem] uppercase tracking-[0.18em] text-text-tertiary">Khám phá</p>
                <h2 className="font-ui-title mt-1 flex items-center gap-2 text-xl text-text-primary">
                  <Globe className="h-5 w-5 text-accent" />
                  Cộng đồng
                </h2>
                <p className="font-ui-content mt-0.5 text-xs text-text-secondary">Chia sẻ kiến thức và kết nối</p>
              </div>
              <button onClick={() => setShowCreateForm(true)} className="zync-soft-button flex shrink-0 items-center gap-2 px-4 py-2 text-sm">
                <PenLine className="h-4 w-4" />
                Viết bài
              </button>
            </div>

            <div className="zync-page-tabs">
              {FEED_TABS.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  onClick={() => handleTabChange(id)}
                  className={`zync-tab-pill ${
                    activeTab === id ? 'zync-tab-pill-active' : ''
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="zync-dashboard-scroll flex-1 overflow-y-auto px-4 py-4 sm:px-6">
            {loading ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <PageSkeleton key={i} rows={2} />
                ))}
              </div>
            ) : posts.length === 0 ? (
              <div className="flex flex-1 items-center justify-center">
                <EmptyState
                  variant="no-posts"
                  action={{
                    label: 'Viết bài đầu tiên',
                    onClick: () => setShowCreateForm(true),
                  }}
                />
              </div>
            ) : (
              <div className="space-y-4">
                {posts.map((post) => (
                  <PostCard key={post._id} post={post} onLike={handleLike} onBookmark={handleBookmark} onComment={handleComment} onFavorite={handleFavorite} onAuthorClick={handleAuthorClick} />
                ))}
                {nextCursor && (
                  <button onClick={() => loadPosts(activeTab, nextCursor)} className="zync-soft-button-secondary mt-2 w-full py-2.5 text-sm">
                    Tải thêm bài viết
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <aside className="zync-dashboard-scroll hidden w-72 shrink-0 overflow-y-auto border-l border-border-soft bg-[var(--surface-muted)]/35 p-4 lg:flex lg:flex-col">
          <div className="mb-4">
            <h3 className="font-ui-title flex items-center gap-2 text-base text-text-primary">
              <TrendingUp className="h-4 w-4 text-accent" />
              Bài viết thịnh hành hôm nay
            </h3>
          </div>
          {trendingPosts.length === 0 ? (
            <div className="rounded-[1.4rem] border border-border bg-bg-card p-4 text-center">
              <p className="text-sm text-text-tertiary">Chưa có dữ liệu thịnh hành</p>
            </div>
          ) : (
            <div className="space-y-3">
              {trendingPosts.map((post, i) => (
                <div key={post._id} className="group cursor-pointer rounded-[1.2rem] border border-transparent bg-bg-hover p-3 transition-all hover:border-accent/30 hover:bg-bg-active hover:shadow-sm">
                  <div className="flex items-start gap-2">
                    <span className="font-ui-title min-w-[1.2rem] text-lg text-accent-strong">{i + 1}</span>
                    <div className="min-w-0">
                      <p className="font-ui-title line-clamp-2 text-sm leading-snug text-text-primary">{post.title}</p>
                      <div className="mt-1.5 flex items-center gap-3 text-xs text-text-tertiary">
                        <span className="flex items-center gap-1"><Heart className="h-3 w-3" />{post.likesCount}</span>
                        <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{post.commentsCount}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6">
            <p className="font-ui-meta mb-3 flex items-center gap-1.5 text-[0.7rem] uppercase tracking-[0.18em] text-text-tertiary">
              <Tag className="h-3 w-3" />
              Thẻ phổ biến
            </p>
            <div className="flex flex-wrap gap-2">
              {POPULAR_TAGS.map((tag) => (
                <span key={tag} className="cursor-pointer rounded-full border border-border bg-bg-hover px-3 py-1 text-xs text-text-secondary transition hover:border-accent hover:text-accent">
                  #{tag}
                </span>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {/* Author Profile Modal */}
      <UserProfileModal
        visible={profileModalOpen}
        userId={profileModalUserId}
        currentUserId={currentUserId ?? undefined}
        user={profileModalUser ?? undefined}
        loading={profileModalLoading}
        onClose={closeProfileModal}
        onSendMessage={(userId) => { void navigateToChat(userId); }}
        onSendFriendRequest={sendFriendRequest}
      />
    </div>
  );
}
