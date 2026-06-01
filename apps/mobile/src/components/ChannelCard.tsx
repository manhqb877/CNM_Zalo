import React, { memo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
} from 'react-native';
import { Users } from 'lucide-react-native';
import type { GroupConversation } from '../services/explore';
import { colors } from '../theme/colors';
import { fonts } from '../theme/fonts';

interface ChannelCardProps {
  channel: GroupConversation;
  isJoined?: boolean;
  isJoining?: boolean;
  onJoin: (channelId: string) => void;
}

function ChannelCardComponent({
  channel,
  isJoined,
  isJoining,
  onJoin,
}: ChannelCardProps) {
  const handleJoin = useCallback(() => {
    if (!isJoined && !isJoining) {
      onJoin(channel._id);
    }
  }, [isJoined, isJoining, onJoin, channel._id]);

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      style={styles.container}
    >
      {channel.avatarUrl ? (
        <Image
          source={{ uri: channel.avatarUrl }}
          style={styles.avatar}
        />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}>
          <Text style={styles.avatarText}>
            {channel.name.slice(0, 2).toUpperCase()}
          </Text>
        </View>
      )}
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {channel.name}
        </Text>
        {channel.description && (
          <Text style={styles.description} numberOfLines={2}>
            {channel.description}
          </Text>
        )}
        <View style={styles.meta}>
          <Users size={12} color={colors.textSubtle} />
          <Text style={styles.memberCount}>
            {channel.memberCount} thành viên
          </Text>
          {channel.isPrivate && (
            <View style={styles.privateTag}>
              <Text style={styles.privateTagText}>Riêng tư</Text>
            </View>
          )}
        </View>
      </View>
      {!isJoined && (
        <TouchableOpacity
          onPress={handleJoin}
          disabled={isJoining}
          style={[styles.joinButton, isJoining && styles.joinButtonDisabled]}
        >
          <Text style={styles.joinButtonText}>
            {isJoining ? '...' : 'Tham gia'}
          </Text>
        </TouchableOpacity>
      )}
      {isJoined && (
        <View style={styles.joinedBadge}>
          <Text style={styles.joinedBadgeText}>Đã tham gia</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export const ChannelCard = memo(ChannelCardComponent);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: colors.glassPanel,
    marginBottom: 10,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 12,
    marginRight: 12,
  },
  avatarFallback: {
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: colors.textOnAccent,
    fontFamily: fonts.bold,
    fontSize: 16,
  },
  info: {
    flex: 1,
    marginRight: 10,
  },
  name: {
    color: colors.text,
    fontFamily: fonts.semiBold,
    fontSize: 15,
    marginBottom: 3,
  },
  description: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 5,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  memberCount: {
    color: colors.textSubtle,
    fontFamily: fonts.regular,
    fontSize: 12,
  },
  privateTag: {
    backgroundColor: colors.glassSoft,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
    marginLeft: 4,
  },
  privateTagText: {
    color: colors.textSubtle,
    fontFamily: fonts.medium,
    fontSize: 10,
  },
  joinButton: {
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  joinButtonDisabled: {
    opacity: 0.5,
  },
  joinButtonText: {
    color: colors.textOnAccent,
    fontFamily: fonts.semiBold,
    fontSize: 13,
  },
  joinedBadge: {
    backgroundColor: colors.glassSoft,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  joinedBadgeText: {
    color: colors.primary,
    fontFamily: fonts.semiBold,
    fontSize: 13,
  },
});
