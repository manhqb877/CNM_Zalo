import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { lightTheme } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { Heart, MessageCircle, Bookmark, User } from 'lucide-react-native';

interface MessagePreviewCardProps {
  content: string;
  isMe: boolean;
  onPress?: () => void;
}

export function parsePostPreview(content: string) {
  if (!content) return null;
  if (content.includes('## ') && content.includes('👤')) {
    const titleMatch = content.match(/##\s+(.+?)(?=\n|$)/);
    const authorMatch = content.match(/👤\s+([^(\n]+)/); // match until newline
    const likesMatch = content.match(/(?:❤️|:heart:)\s*(\d+)/);
    const commentsMatch = content.match(/(?:💬|:speech_balloon:)\s*(\d+)/);
    
    // extract tags
    const tagsMatch = content.match(/#[a-zA-Z0-9_]+/g);

    return {
      title: titleMatch ? titleMatch[1].trim() : 'Bài viết',
      author: authorMatch ? authorMatch[1].replace('Huong dan', '').trim() : 'Người dùng',
      likes: likesMatch ? likesMatch[1] : '0',
      comments: commentsMatch ? commentsMatch[1] : '0',
      tags: tagsMatch || [],
      original: content
    };
  }
  return null;
}

export function MessagePreviewCard({ content, isMe, onPress }: MessagePreviewCardProps) {
  const post = parsePostPreview(content);
  
  if (!post) {
    return <Text style={{ color: isMe ? '#fff' : lightTheme.textPrimary }}>{content}</Text>;
  }

  return (
    <TouchableOpacity 
      style={[styles.card, isMe ? styles.cardMe : styles.cardOther]} 
      activeOpacity={0.85}
      onPress={onPress}
    >
      <View style={styles.header}>
        <View style={styles.authorRow}>
          <View style={styles.avatarPlaceholder}>
            <User size={14} color={lightTheme.textSecondary} />
          </View>
          <Text style={styles.authorText} numberOfLines={1}>{post.author}</Text>
        </View>
      </View>
      
      <Text style={styles.title} numberOfLines={2}>{post.title}</Text>
      
      {post.tags.length > 0 && (
        <View style={styles.tagsRow}>
          {post.tags.slice(0, 3).map((tag, idx) => (
            <Text key={idx} style={styles.tagText}>{tag}</Text>
          ))}
        </View>
      )}

      <View style={styles.footer}>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Heart size={14} color={lightTheme.textSecondary} />
            <Text style={styles.statText}>{post.likes}</Text>
          </View>
          <View style={styles.statItem}>
            <MessageCircle size={14} color={lightTheme.textSecondary} />
            <Text style={styles.statText}>{post.comments}</Text>
          </View>
        </View>
        <Bookmark size={14} color={lightTheme.textSecondary} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 260,
    backgroundColor: lightTheme.surfaceCard,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: lightTheme.border,
  },
  cardMe: {
    // If sent by me, we might still want a white card or slightly tinted
    backgroundColor: '#ffffff',
  },
  cardOther: {
    backgroundColor: lightTheme.surfaceCard,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarPlaceholder: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: lightTheme.bgHover,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  authorText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: lightTheme.textSecondary,
  },
  title: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: lightTheme.textPrimary,
    lineHeight: 20,
    marginBottom: 8,
  },
  tagsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  tagText: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: lightTheme.accent,
    backgroundColor: lightTheme.bgHover,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: lightTheme.border,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: lightTheme.textSecondary,
  },
});
