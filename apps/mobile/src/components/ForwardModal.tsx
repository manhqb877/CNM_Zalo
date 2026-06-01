import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  FlatList,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { lightTheme } from '../theme/colors';
import api from '../services/api';

interface Conversation {
  _id: string;
  name: string;
  avatarUrl?: string;
  type?: 'group' | 'private' | 'direct';
}

interface ForwardModalProps {
  visible: boolean;
  /** ID tin nhan goc can chuyen tiep */
  messageId: string | null;
  /** conversationId hien tai – loai khoi danh sach */
  currentConversationId: string;
  onClose: () => void;
  /** Goi khi user chon conversation de forward */
  onForward: (toConversationId: string) => void;
}

export function ForwardModal({
  visible,
  messageId,
  currentConversationId,
  onClose,
  onForward,
}: ForwardModalProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [forwarding, setForwarding] = useState(false);

  // Tai danh sach hoi thoai khi mo modal
  useEffect(() => {
    if (!visible) return;
    setSearch('');
    void loadConversations();
  }, [visible]);

  const loadConversations = async () => {
    try {
      setIsLoading(true);
      const res = await api.get('/conversations');
      const convs: Conversation[] = (res.data?.data || res.data?.conversations || []).map(
        (c: any) => ({
          _id: c._id,
          name: c.name || 'Hội thoại',
          avatarUrl: c.avatarUrl,
          type: c.type,
        }),
      );
      setConversations(convs);
    } catch (err) {
      console.error('Load conversations for forward failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Loc theo tu khoa va loai conversation hien tai
  const filtered = useMemo(() => {
    const base = conversations.filter((c) => c._id !== currentConversationId);
    if (!search.trim()) return base;
    const q = search.trim().toLowerCase();
    return base.filter((c) => c.name.toLowerCase().includes(q));
  }, [conversations, currentConversationId, search]);

  const handleForward = useCallback(
    async (toConversationId: string) => {
      if (!messageId || forwarding) return;
      setForwarding(true);
      try {
        onForward(toConversationId);
      } finally {
        setForwarding(false);
        onClose();
      }
    },
    [forwarding, messageId, onClose, onForward],
  );

  const renderItem = useCallback(
    ({ item }: { item: Conversation }) => {
      const initial = (item.name || '?').charAt(0).toUpperCase();
      return (
        <TouchableOpacity
          style={styles.row}
          activeOpacity={0.7}
          onPress={() => void handleForward(item._id)}
          disabled={forwarding}
        >
          {item.avatarUrl ? (
            <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarLetter}>{initial}</Text>
            </View>
          )}
          <View style={styles.info}>
            <Text style={styles.name} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.type}>
              {item.type === 'group' ? 'Nhóm' : 'Cá nhân'}
            </Text>
          </View>
          <Ionicons name="arrow-forward-circle-outline" size={22} color={lightTheme.accent} />
        </TouchableOpacity>
      );
    },
    [forwarding, handleForward],
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Chuyển tiếp tin nhắn</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color={lightTheme.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Thanh tim kiem */}
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={18} color={lightTheme.textTertiary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Tìm hội thoại..."
              placeholderTextColor={lightTheme.textTertiary}
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
            />
          </View>

          {/* Danh sach */}
          {isLoading ? (
            <ActivityIndicator size="large" color={lightTheme.accent} style={{ marginTop: 40 }} />
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => item._id}
              renderItem={renderItem}
              ListEmptyComponent={
                <Text style={styles.empty}>Không tìm thấy hội thoại nào</Text>
              }
              contentContainerStyle={{ paddingBottom: 20 }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: lightTheme.bgCard,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 30,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: lightTheme.textPrimary,
    fontFamily: 'BeVietnamPro_600SemiBold',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: lightTheme.bgHover,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: lightTheme.textPrimary,
    fontFamily: 'BeVietnamPro_400Regular',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: lightTheme.borderLight,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    marginRight: 12,
  },
  avatarFallback: {
    backgroundColor: lightTheme.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontSize: 16,
    fontWeight: '600',
    color: lightTheme.accent,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 15,
    fontWeight: '500',
    color: lightTheme.textPrimary,
    fontFamily: 'BeVietnamPro_500Medium',
  },
  type: {
    fontSize: 12,
    color: lightTheme.textTertiary,
    fontFamily: 'BeVietnamPro_400Regular',
    marginTop: 2,
  },
  empty: {
    textAlign: 'center',
    color: lightTheme.textTertiary,
    marginTop: 40,
    fontSize: 14,
    fontFamily: 'BeVietnamPro_400Regular',
  },
});
