'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Send, Heart, CornerDownRight } from 'lucide-react';
import { fetchComments, addComment, type Comment, type Post } from '@/services/posts';
import { AppLoader, ButtonSpinner } from '@/components/shared/loading-system';

interface CommentPanelProps {
  post: Post;
  onClose: () => void;
  onCommentAdded?: (comment: Comment) => void;
}

const POST_TYPE_LABEL: Record<Post['type'], string> = {
  discussion: 'Thảo luận',
  question: 'Câu hỏi',
  til: 'TIL',
  showcase: 'Showcase',
  tutorial: 'Hướng dẫn',
  job: 'Tuyển dụng',
};

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Vừa xong';
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return `${Math.floor(hours / 24)} ngày trước`;
}

export function CommentPanel({ post, onClose, onCommentAdded }: CommentPanelProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [content, setContent] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Nhom comments theo parentId (reply vs top-level)
  const topLevel = comments.filter((c) => !c.parentId);
  const repliesMap = new Map<string, Comment[]>();
  for (const c of comments) {
    if (c.parentId) {
      const arr = repliesMap.get(c.parentId) ?? [];
      arr.push(c);
      repliesMap.set(c.parentId, arr);
    }
  }

  const loadComments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchComments(post._id);
      setComments(data);
    } catch {
      setError('Không thể tải bình luận');
    } finally {
      setLoading(false);
    }
  }, [post._id]);

  useEffect(() => { loadComments(); }, [loadComments]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments.length]);

  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [content]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handleReply = (comment: Comment) => {
    setReplyTo(comment);
    setReplyingToId(comment._id);
    inputRef.current?.focus();
  };

  const handleCancelReply = () => {
    setReplyTo(null);
    setReplyingToId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    setSubmitting(true);
    try {
      const comment = await addComment(post._id, content.trim(), replyTo?._id);
      setComments((prev) => [...prev, comment]);
      setContent('');
      setReplyTo(null);
      setReplyingToId(null);
      onCommentAdded?.(comment);
    } catch {
      setError('Không thể gửi bình luận');
    } finally {
      setSubmitting(false);
    }
  };

  const authorInitials = (comment: Comment) =>
    comment.author?.displayName?.slice(0, 2).toUpperCase() ?? '??';
  const postTypeLabel = POST_TYPE_LABEL[post.type] ?? post.type;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-3 backdrop-blur-[2px] sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Bình luận bài viết"
        className="flex h-auto max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-[var(--bg-secondary)] shadow-2xl"
        style={{ animation: 'modal-fade-in 0.2s ease-out' }}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="font-ui-title text-base text-text-primary">
              Bình luận
            </h2>
            <p className="font-ui-meta mt-0.5 text-xs text-text-tertiary">
              {post.commentsCount} bình luận
            </p>
          </div>
          <button
            onClick={onClose}
            className="zync-soft-button-ghost flex h-9 w-9 items-center justify-center rounded-full p-0 text-text-secondary hover:text-text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Question preview (highlighted stronger than answers) */}
        <div className="shrink-0 border-b border-accent/30 bg-accent/10 px-5 py-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded-full bg-accent px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--bg-primary)]">
              {postTypeLabel}
            </span>
          </div>
          <p className="font-ui-title line-clamp-2 text-sm font-semibold text-text-primary">{post.title}</p>
          <p className="mt-1 line-clamp-2 text-sm text-text-secondary">{post.content}</p>
        </div>

        {/* Comments list */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <AppLoader layout="bare" size="md" tone="teal" message="Đang tải bình luận..." className="py-12" />
          ) : error ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12">
              <p className="font-ui-content text-sm text-red-400">{error}</p>
              <button onClick={loadComments} className="zync-soft-button-secondary px-4 py-2 text-sm">
                Thử lại
              </button>
            </div>
          ) : topLevel.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-bg-hover">
                <svg className="h-6 w-6 text-text-tertiary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
              <p className="font-ui-content text-sm text-text-secondary">Chưa có bình luận nào</p>
              <p className="font-ui-meta text-xs text-text-tertiary">Hãy là người đầu tiên bình luận!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {topLevel.map((comment) => (
                <div key={comment._id} className="space-y-2 rounded-xl border border-border/70 bg-bg-card p-3">
                  {/* Top-level answer */}
                  <div className="mb-2 flex items-center gap-2">
                    <span className="rounded-full bg-bg-hover px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">
                      Phản hồi
                    </span>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-light text-xs font-semibold text-accent-strong">
                      {comment.author?.avatarUrl ? (
                        <img src={comment.author.avatarUrl} alt="" className="h-full w-full object-cover" />
                      ) : authorInitials(comment)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-ui-title text-sm text-text-primary">
                          {comment.author?.displayName ?? 'Ẩn danh'}
                        </span>
                        <span className="text-xs text-text-tertiary">{formatTimeAgo(comment.createdAt)}</span>
                      </div>
                      <div className="mt-1">
                        {comment.codeSnippet ? (
                          <pre className="overflow-x-auto rounded-xl border border-border bg-bg-hover px-3 py-2 font-mono text-xs text-text-secondary">
                            <code>{comment.codeSnippet}</code>
                          </pre>
                        ) : null}
                        <p className={`font-ui-content text-sm leading-relaxed text-text-secondary ${comment.codeSnippet ? 'mt-1' : ''}`}>
                          {comment.content}
                        </p>
                      </div>
                      <div className="mt-1.5 flex items-center gap-3">
                        <button className={`flex items-center gap-1 text-xs transition ${comment.isLiked ? 'text-rose-500' : 'text-text-tertiary hover:text-rose-500'}`}>
                          <Heart className={`h-3 w-3 ${comment.isLiked ? 'fill-current' : ''}`} />
                          <span>{comment.likesCount}</span>
                        </button>
                        <button
                          onClick={() => handleReply(comment)}
                          className="flex items-center gap-1 text-xs text-text-tertiary transition hover:text-text-primary"
                        >
                          <CornerDownRight className="h-3 w-3" />
                          Trả lời
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Nested replies */}
                  {repliesMap.has(comment._id) && (
                    <div className="ml-4 space-y-2 border-l-2 border-accent/30 pl-4">
                      {repliesMap.get(comment._id)!.map((reply) => (
                        <div key={reply._id} className="rounded-xl border border-border bg-[var(--bg-primary)] p-2.5">
                          <div className="mb-1 flex items-center gap-2">
                            <span className="rounded-full bg-bg-hover px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">
                              Phản hồi
                            </span>
                          </div>
                          <div className="flex gap-2">
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-bg-hover text-[10px] font-semibold text-text-tertiary">
                            {reply.author?.avatarUrl ? (
                              <img src={reply.author.avatarUrl} alt="" className="h-full w-full object-cover" />
                            ) : authorInitials(reply)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-ui-title text-xs text-text-primary">
                                {reply.author?.displayName ?? 'Ẩn danh'}
                              </span>
                              <span className="text-[10px] text-text-tertiary">{formatTimeAgo(reply.createdAt)}</span>
                            </div>
                            {reply.codeSnippet ? (
                              <pre className="mt-0.5 overflow-x-auto rounded-lg border border-border bg-bg-hover px-2 py-1 font-mono text-[11px] text-text-secondary">
                                <code>{reply.codeSnippet}</code>
                              </pre>
                            ) : null}
                            <p className={`font-ui-content text-xs leading-relaxed text-text-secondary ${reply.codeSnippet ? 'mt-0.5' : ''}`}>
                              {reply.content}
                            </p>
                            <div className="mt-1 flex items-center gap-2">
                              <button className={`flex items-center gap-1 text-[10px] transition ${reply.isLiked ? 'text-rose-500' : 'text-text-tertiary hover:text-rose-500'}`}>
                                <Heart className={`h-2.5 w-2.5 ${reply.isLiked ? 'fill-current' : ''}`} />
                                <span>{reply.likesCount}</span>
                              </button>
                              <button
                                onClick={() => handleReply(reply)}
                                className="flex items-center gap-1 text-[10px] text-text-tertiary transition hover:text-text-primary"
                              >
                                <CornerDownRight className="h-2.5 w-2.5" />
                                Trả lời
                              </button>
                            </div>
                          </div>
                        </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="shrink-0 border-t border-border bg-[var(--bg-primary)] px-4 py-3">
          {replyTo && (
            <div className="mb-2 flex items-center justify-between rounded-xl border border-border bg-bg-hover px-3 py-2">
              <div className="flex items-center gap-2">
                <CornerDownRight className="h-3 w-3 text-text-tertiary" />
                <span className="font-ui-meta text-xs text-text-secondary">
                  Trả lời <span className="text-text-primary">{replyTo.author?.displayName ?? 'Ẩn danh'}</span>
                </span>
              </div>
              <button onClick={handleCancelReply} className="text-text-tertiary hover:text-text-primary">
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
          <form onSubmit={handleSubmit} className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <textarea
                ref={inputRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Viết bình luận..."
                rows={2}
                className="zync-soft-textarea min-h-[44px] w-full resize-none rounded-xl py-2 text-sm focus:ring-2 focus:ring-accent/35"
                disabled={submitting}
                aria-label="Nhập bình luận"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (!submitting) {
                      void handleSubmit(e);
                    }
                  }
                }}
              />
            </div>
            <div className="flex gap-1.5">
              <button
                type="submit"
                disabled={submitting || !content.trim()}
                aria-label={submitting ? 'Đang gửi bình luận' : 'Gửi bình luận'}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-[var(--bg-primary)] shadow-sm transition hover:scale-[1.03] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? (
                  <ButtonSpinner size="sm" tone="light" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </div>
          </form>
          <p className="mt-1 font-ui-meta text-[10px] text-text-tertiary">
            Nhấn Enter để gửi · Shift+Enter để xuống dòng
          </p>
        </div>
      </div>
      <style>{`
        @keyframes modal-fade-in {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
