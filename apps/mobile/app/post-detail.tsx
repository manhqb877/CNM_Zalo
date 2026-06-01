import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  Dimensions,
  Linking,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Heart, MessageCircle, Bookmark, Share } from 'lucide-react-native';
import { usePostDetail } from '../src/hooks/usePosts';
import { CommentSheet } from '../src/components/CommentSheet';
import { likePost, bookmarkPost } from '../src/services/posts';
import { colors } from '../src/theme/colors';
import { fonts } from '../src/theme/fonts';
import { SkeletonPostCardPreset } from '../src/ui/ZyncSkeleton';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const POST_TYPE_LABELS: Record<string, string> = {
  discussion: 'Thảo luận',
  question: 'Hỏi đáp',
  til: 'Hướng dẫn',
  showcase: 'Showcase',
  tutorial: 'Hướng dẫn',
  job: 'Tuyển dụng',
};

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('vi-VN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function PostDetailScreen() {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const router = useRouter();

  const {
    post,
    comments,
    isLoadingPost,
    isLoadingComments,
    error,
    handleAddComment,
  } = usePostDetail(postId || '');

  const [showCommentSheet, setShowCommentSheet] = useState(false);
  const [localLiked, setLocalLiked] = useState(false);
  const [localLikesCount, setLocalLikesCount] = useState(0);
  const [localBookmarked, setLocalBookmarked] = useState(false);
  const [localActioning, setLocalActioning] = useState(false);

  useEffect(() => {
    if (post) {
      setLocalLiked(post.isLiked ?? false);
      setLocalLikesCount(post.likesCount);
      setLocalBookmarked(post.isBookmarked ?? false);
    }
  }, [post]);

  const handleLike = useCallback(async () => {
    if (!post || localActioning) return;
    setLocalActioning(true);
    const prev = { liked: localLiked, count: localLikesCount };
    setLocalLiked(!prev.liked);
    setLocalLikesCount(prev.liked ? prev.count - 1 : prev.count + 1);
    try {
      await likePost(post._id);
    } catch {
      setLocalLiked(prev.liked);
      setLocalLikesCount(prev.count);
    } finally {
      setLocalActioning(false);
    }
  }, [post, localLiked, localLikesCount, localActioning]);

  const handleBookmark = useCallback(async () => {
    if (!post || localActioning) return;
    setLocalActioning(true);
    const prev = localBookmarked;
    setLocalBookmarked(!prev);
    try {
      await bookmarkPost(post._id);
    } catch {
      setLocalBookmarked(prev);
    } finally {
      setLocalActioning(false);
    }
  }, [post, localBookmarked, localActioning]);

  const handleShare = useCallback(async () => {
    // Placeholder share — open URL if post has share link
  }, []);

  if (isLoadingPost) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingState}>
          <SkeletonPostCardPreset />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !post) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.errorState}>
          <Text style={styles.errorText}>
            {error || 'Không tìm thấy bài viết'}
          </Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backLinkText}>Quay lại</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Bài viết
        </Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Author */}
        <View style={styles.authorRow}>
          {post.author?.avatarUrl ? (
            <Image
              source={{ uri: post.author.avatarUrl }}
              style={styles.avatar}
            />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarText}>
                {(post.author?.displayName || 'U').slice(0, 1).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.authorInfo}>
            <Text style={styles.authorName}>
              {post.author?.displayName || 'Người dùng'}
            </Text>
            <Text style={styles.meta}>
              {formatDate(post.createdAt)}
            </Text>
          </View>
          {post.type && (
            <View style={styles.typeTag}>
              <Text style={styles.typeTagText}>
                {POST_TYPE_LABELS[post.type] || post.type}
              </Text>
            </View>
          )}
        </View>

        {/* Title */}
        <Text style={styles.title}>{post.title}</Text>

        {/* Tags */}
        {post.tags && post.tags.length > 0 && (
          <View style={styles.tagsRow}>
            {post.tags.map((tag) => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText}>#{tag}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Content */}
        <Text style={styles.body}>{post.content}</Text>

        {/* Media */}
        {post.mediaUrls && post.mediaUrls.length > 0 && (
          <View style={styles.mediaGrid}>
            {post.mediaUrls.map((url, idx) => (
              <Image
                key={idx}
                source={{ uri: url }}
                style={[
                  styles.mediaImage,
                  post.mediaUrls!.length === 1 && styles.mediaImageSingle,
                ]}
                resizeMode="cover"
              />
            ))}
          </View>
        )}

        {/* Stats */}
        <View style={styles.statsRow}>
          <Text style={styles.statsText}>
            {post.likesCount} lượt thích · {post.commentsCount} bình luận ·{' '}
            {post.viewsCount} lượt xem
          </Text>
        </View>

        {/* Actions */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            onPress={handleLike}
            style={styles.actionButton}
          >
            <Heart
              size={20}
              color={localLiked ? colors.danger : colors.textMuted}
              fill={localLiked ? colors.danger : 'transparent'}
            />
            <Text
              style={[
                styles.actionText,
                localLiked && { color: colors.danger },
              ]}
            >
              {localLiked ? 'Đã thích' : 'Thích'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setShowCommentSheet(true)}
            style={styles.actionButton}
          >
            <MessageCircle size={20} color={colors.textMuted} />
            <Text style={styles.actionText}>Bình luận</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleBookmark}
            style={styles.actionButton}
          >
            <Bookmark
              size={20}
              color={localBookmarked ? colors.accentSoft : colors.textMuted}
              fill={localBookmarked ? colors.accentSoft : 'transparent'}
            />
            <Text style={styles.actionText}>
              {localBookmarked ? 'Đã lưu' : 'Lưu'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleShare} style={styles.actionButton}>
            <Share size={20} color={colors.textMuted} />
            <Text style={styles.actionText}>Chia sẻ</Text>
          </TouchableOpacity>
        </View>

        {/* Comments preview */}
        <View style={styles.commentsSection}>
          <Text style={styles.commentsSectionTitle}>
            Bình luận ({post.commentsCount})
          </Text>
          {isLoadingComments ? (
            <View style={{ gap: 12, paddingVertical: 16 }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <SkeletonPostCardPreset key={i} />
              ))}
            </View>
          ) : comments.length === 0 ? (
            <Text style={styles.noCommentsText}>
              Chưa có bình luận nào. Hãy là người đầu tiên bình luận!
            </Text>
          ) : (
            comments.slice(0, 5).map((comment) => (
              <View key={comment._id} style={styles.commentItem}>
                {comment.author?.avatarUrl ? (
                  <Image
                    source={{ uri: comment.author.avatarUrl }}
                    style={styles.commentAvatar}
                  />
                ) : (
                  <View
                    style={[
                      styles.commentAvatar,
                      styles.avatarFallback,
                      { width: 28, height: 28 },
                    ]}
                  >
                    <Text style={styles.avatarText}>
                      {(comment.author?.displayName || 'U')
                        .slice(0, 1)
                        .toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={styles.commentContent}>
                  <Text style={styles.commentAuthor}>
                    {comment.author?.displayName || 'Người dùng'}
                  </Text>
                  <Text style={styles.commentText}>{comment.content}</Text>
                </View>
              </View>
            ))
          )}
          {comments.length > 5 && (
            <TouchableOpacity
              onPress={() => setShowCommentSheet(true)}
              style={styles.viewAllComments}
            >
              <Text style={styles.viewAllText}>
                Xem tất cả {comments.length} bình luận
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* Floating comment button */}
      <View style={styles.floatingBar}>
        <TouchableOpacity
          onPress={() => setShowCommentSheet(true)}
          style={styles.floatingCommentBtn}
        >
          <Text style={styles.floatingCommentText}>
            Viết bình luận...
          </Text>
        </TouchableOpacity>
      </View>

      <CommentSheet
        visible={showCommentSheet}
        comments={comments}
        isLoading={isLoadingComments}
        onClose={() => setShowCommentSheet(false)}
        onSubmit={async (content: string) => { await handleAddComment(content); }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.glassBorder,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 18,
    flex: 1,
    textAlign: 'center',
  },
  headerRight: {
    width: 40,
  },
  loadingState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    color: colors.danger,
    fontFamily: fonts.regular,
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 16,
  },
  backLinkText: {
    color: colors.primary,
    fontFamily: fonts.semiBold,
    fontSize: 15,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
  },
  avatarFallback: {
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 16,
  },
  authorInfo: {
    flex: 1,
  },
  authorName: {
    color: colors.text,
    fontFamily: fonts.semiBold,
    fontSize: 15,
  },
  meta: {
    color: colors.textSubtle,
    fontFamily: fonts.regular,
    fontSize: 12,
    marginTop: 2,
  },
  typeTag: {
    backgroundColor: colors.glassSoft,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  typeTagText: {
    color: colors.primary,
    fontFamily: fonts.medium,
    fontSize: 12,
  },
  title: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 22,
    lineHeight: 30,
    marginBottom: 12,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
    gap: 8,
  },
  tag: {
    backgroundColor: colors.glassUltra,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagText: {
    color: colors.primary,
    fontFamily: fonts.medium,
    fontSize: 13,
  },
  body: {
    color: colors.text,
    fontFamily: fonts.regular,
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 16,
  },
  mediaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  mediaImage: {
    width: (SCREEN_WIDTH - 48) / 2 - 4,
    height: 120,
    borderRadius: 12,
  },
  mediaImageSingle: {
    width: '100%',
    height: 220,
  },
  statsRow: {
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.glassBorder,
    marginBottom: 12,
  },
  statsText: {
    color: colors.textSubtle,
    fontFamily: fonts.regular,
    fontSize: 13,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  actionButton: {
    alignItems: 'center',
    gap: 4,
    padding: 8,
  },
  actionText: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 12,
  },
  commentsSection: {
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.glassBorder,
  },
  commentsSectionTitle: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 16,
    marginBottom: 16,
  },
  noCommentsText: {
    color: colors.textSubtle,
    fontFamily: fonts.regular,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 20,
  },
  commentItem: {
    flexDirection: 'row',
    marginBottom: 14,
    alignItems: 'flex-start',
  },
  commentAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 10,
  },
  commentContent: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    padding: 10,
  },
  commentAuthor: {
    color: colors.primary,
    fontFamily: fonts.semiBold,
    fontSize: 13,
    marginBottom: 3,
  },
  commentText: {
    color: colors.text,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  viewAllComments: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  viewAllText: {
    color: colors.primary,
    fontFamily: fonts.semiBold,
    fontSize: 14,
  },
  floatingBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 12,
    paddingBottom: 34,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.glassBorder,
  },
  floatingCommentBtn: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  floatingCommentText: {
    color: colors.textSubtle,
    fontFamily: fonts.regular,
    fontSize: 14,
  },
});
