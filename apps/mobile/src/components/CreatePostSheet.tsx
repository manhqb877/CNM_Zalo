import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import { X, Image as ImageIcon } from 'lucide-react-native';
import { colors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { mobileColors, mobileRadius, mobileShadow } from '../theme/tokens';
import { Button } from '../ui/Button';
import type { CreatePostPayload, PostType } from '../services/posts';

const POST_TYPES: { value: PostType; label: string }[] = [
  { value: 'discussion', label: 'Thảo luận' },
  { value: 'question', label: 'Hỏi đáp' },
  { value: 'til', label: 'TIL' },
  { value: 'showcase', label: 'Showcase' },
  { value: 'tutorial', label: 'Hướng dẫn' },
  { value: 'job', label: 'Tuyển dụng' },
];

const POPULAR_TAGS = [
  'react',
  'typescript',
  'nodejs',
  'nextjs',
  'python',
  'golang',
  'rust',
  'devops',
  'mobile',
];

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface CreatePostSheetProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (payload: CreatePostPayload) => Promise<unknown>;
}

export function CreatePostSheet({
  visible,
  onClose,
  onSubmit,
}: CreatePostSheetProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [postType, setPostType] = useState<PostType>('discussion');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setTitle('');
    setContent('');
    setPostType('discussion');
    setSelectedTags([]);
    setError(null);
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [onClose, resetForm]);

  const toggleTag = useCallback((tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : prev.length < 5 ? [...prev, tag] : prev
    );
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!title.trim()) {
      setError('Vui lòng nhập tiêu đề');
      return;
    }
    if (!content.trim()) {
      setError('Vui lòng nhập nội dung');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onSubmit({
        title: title.trim(),
        content: content.trim(),
        type: postType,
        tags: selectedTags,
      });
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tạo bài viết');
    } finally {
      setIsSubmitting(false);
    }
  }, [title, content, postType, selectedTags, onSubmit, handleClose]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalOverlay}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={handleClose}
        />
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Tạo bài viết</Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <X size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Post type selector */}
            <Text style={styles.label}>Loại bài viết</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.typeRow}
            >
              {POST_TYPES.map((type) => (
                <TouchableOpacity
                  key={type.value}
                  onPress={() => setPostType(type.value)}
                  style={[
                    styles.typeChip,
                    postType === type.value && styles.typeChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.typeChipText,
                      postType === type.value && styles.typeChipTextActive,
                    ]}
                  >
                    {type.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Title */}
            <Text style={styles.label}>Tiêu đề</Text>
            <TextInput
              style={styles.titleInput}
              placeholder="Nhập tiêu đề bài viết..."
              placeholderTextColor={colors.textSubtle}
              value={title}
              onChangeText={setTitle}
              maxLength={200}
            />

            {/* Content */}
            <Text style={styles.label}>Nội dung</Text>
            <TextInput
              style={styles.contentInput}
              placeholder="Chia sẻ bài viết của bạn..."
              placeholderTextColor={colors.textSubtle}
              value={content}
              onChangeText={setContent}
              multiline
              textAlignVertical="top"
            />

            {/* Tags */}
            <Text style={styles.label}>Tags (tối đa 5)</Text>
            <View style={styles.tagsGrid}>
              {POPULAR_TAGS.map((tag) => (
                <TouchableOpacity
                  key={tag}
                  onPress={() => toggleTag(tag)}
                  style={[
                    styles.tagChip,
                    selectedTags.includes(tag) && styles.tagChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.tagChipText,
                      selectedTags.includes(tag) && styles.tagChipTextActive,
                    ]}
                  >
                    #{tag}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {error && (
              <Text style={styles.errorText}>{error}</Text>
            )}
          </ScrollView>

          {/* Submit */}
          <View style={styles.footer}>
            <Button
              title={isSubmitting ? 'Đang đăng...' : 'Đăng bài'}
              onPress={handleSubmit}
              isLoading={isSubmitting}
              disabled={!title.trim() || !content.trim()}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  sheet: {
    backgroundColor: mobileColors.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    paddingBottom: 34,
    ...mobileShadow.shadowFloating,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: mobileColors.border,
  },
  headerTitle: {
    color: mobileColors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: 18,
  },
  closeButton: {
    padding: 4,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  label: {
    color: mobileColors.textPrimary,
    fontFamily: fonts.semiBold,
    fontSize: 14,
    marginTop: 16,
    marginBottom: 8,
  },
  typeRow: {
    marginBottom: 4,
  },
  typeChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: mobileColors.border,
    backgroundColor: mobileColors.surface,
    marginRight: 8,
  },
  typeChipActive: {
    backgroundColor: mobileColors.accent,
    borderColor: mobileColors.accent,
  },
  typeChipText: {
    color: mobileColors.textSecondary,
    fontFamily: fonts.medium,
    fontSize: 13,
  },
  typeChipTextActive: {
    color: mobileColors.textOnAccent,
    fontFamily: fonts.bold,
  },
  titleInput: {
    backgroundColor: mobileColors.surface,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: mobileRadius.radiusInput,
    padding: 14,
    color: mobileColors.textPrimary,
    fontFamily: fonts.regular,
    fontSize: 15,
  },
  contentInput: {
    backgroundColor: mobileColors.surface,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: mobileRadius.radiusInput,
    padding: 14,
    color: mobileColors.textPrimary,
    fontFamily: fonts.regular,
    fontSize: 15,
    minHeight: 140,
  },
  tagsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: mobileColors.border,
    backgroundColor: mobileColors.surfaceSoft,
  },
  tagChipActive: {
    backgroundColor: mobileColors.accent,
    borderColor: mobileColors.accent,
  },
  tagChipText: {
    color: mobileColors.accent,
    fontFamily: fonts.medium,
    fontSize: 13,
  },
  tagChipTextActive: {
    color: mobileColors.textOnAccent,
    fontFamily: fonts.bold,
  },
  errorText: {
    color: colors.danger,
    fontFamily: fonts.regular,
    fontSize: 13,
    marginTop: 12,
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: mobileColors.border,
  },
});
