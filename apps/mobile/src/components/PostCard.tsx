import React, { memo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
} from 'react-native';
import { Heart, MessageCircle, Bookmark } from 'lucide-react-native';
import type { Post } from '../services/posts';
import { lightTheme } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { radius, shadows } from '../theme/spacing';

interface PostCardProps {
  post: Post;
  onPress: (post: Post) => void;
  onLike: (postId: string) => void;
  onBookmark: (postId: string) => void;
  onAuthorPress?: (authorId: string) => void;
}

const POST_TYPE_LABELS: Record<string, string> = {
  discussion: 'Thảo luận',
  question: 'Hỏi đáp',
  til: 'Hướng dẫn',
  showcase: 'Showcase',
  tutorial: 'Hướng dẫn',
  job: 'Tuyển dụng',
};

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  if (hours < 24) return `${hours} giờ trước`;
  return `${days} ngày trước`;
}

function PostCardComponent({
  post,
  onPress,
  onLike,
  onBookmark,
  onAuthorPress,
}: PostCardProps) {
  const handlePress = useCallback(() => {
    onPress(post);
  }, [onPress, post]);

  const handleAuthorPress = useCallback(() => {
    onAuthorPress?.(post.authorId);
  }, [onAuthorPress, post.authorId]);

  const handleLike = useCallback(() => {
    onLike(post._id);
  }, [onLike, post._id]);

  const handleBookmark = useCallback(() => {
    onBookmark(post._id);
  }, [onBookmark, post._id]);

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={handlePress}
      style={styles.container}
    >
      {/* Author row */}
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={handleAuthorPress}
        style={styles.authorRow}
      >
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
          <Text style={styles.authorName} numberOfLines={1}>
            {post.author?.displayName || 'Người dùng'}
          </Text>
          <Text style={styles.meta}>
            {formatTimeAgo(post.createdAt)}
          </Text>
        </View>
        {post.type && (
          <View style={styles.typeTag}>
            <Text style={styles.typeTagText}>
              {POST_TYPE_LABELS[post.type] || post.type}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Content */}
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={2}>
          {post.title}
        </Text>
        {post.tags && post.tags.length > 0 && (
          <View style={styles.tagsRow}>
            {post.tags.slice(0, 3).map((tag) => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText}>#{tag}</Text>
              </View>
            ))}
          </View>
        )}
        <Text style={styles.body} numberOfLines={3}>
          {post.content}
        </Text>
      </View>

      {/* Media */}
      {post.mediaUrls && post.mediaUrls.length > 0 && (
        <Image
          source={{ uri: post.mediaUrls[0] }}
          style={styles.media}
          resizeMode="cover"
        />
      )}

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleLike}
          style={styles.actionButton}
        >
          <Heart
            size={18}
            color={post.isLiked ? lightTheme.danger : lightTheme.textTertiary}
            fill={post.isLiked ? lightTheme.danger : 'transparent'}
          />
          <Text
            style={[
              styles.actionCount,
              post.isLiked && { color: lightTheme.danger },
            ]}
          >
            {post.likesCount}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handlePress}
          style={styles.actionButton}
        >
          <MessageCircle size={18} color={lightTheme.textTertiary} />
          <Text style={styles.actionCount}>{post.commentsCount}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleBookmark}
          style={styles.actionButton}
        >
          <Bookmark
            size={18}
            color={
              post.isBookmarked ? lightTheme.accent : lightTheme.textTertiary
            }
            fill={post.isBookmarked ? lightTheme.accent : 'transparent'}
          />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

export const PostCard = memo(PostCardComponent);

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: lightTheme.border,
    backgroundColor: lightTheme.surface,
    padding: 16,
    marginBottom: 12,
    ...shadows.soft,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
  },
  avatarFallback: {
    backgroundColor: lightTheme.surfaceSoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: lightTheme.textTertiary,
    fontFamily: fonts.bold,
    fontSize: 16,
  },
  authorInfo: {
    flex: 1,
  },
  authorName: {
    color: lightTheme.textPrimary,
    fontFamily: fonts.semiBold,
    fontSize: 16,
  },
  meta: {
    color: lightTheme.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 12,
    marginTop: 2,
  },
  typeTag: {
    backgroundColor: lightTheme.accentSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  typeTagText: {
    color: lightTheme.accent,
    fontFamily: fonts.semiBold,
    fontSize: 11,
  },
  content: {
    marginBottom: 14,
  },
  title: {
    color: lightTheme.textPrimary,
    fontFamily: fonts.bold,
    fontSize: 18,
    lineHeight: 26,
    marginBottom: 8,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 10,
    gap: 8,
  },
  tag: {
    backgroundColor: lightTheme.bgSecondary,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagText: {
    color: lightTheme.textSecondary,
    fontFamily: fonts.medium,
    fontSize: 12,
  },
  body: {
    color: lightTheme.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 24,
  },
  media: {
    width: '100%',
    height: 180,
    maxHeight: 220,
    borderRadius: radius.medium,
    marginBottom: 14,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: lightTheme.borderLight,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: lightTheme.surfaceSoft,
  },
  actionCount: {
    color: lightTheme.textSecondary,
    fontFamily: fonts.medium,
    fontSize: 14,
  },
});
