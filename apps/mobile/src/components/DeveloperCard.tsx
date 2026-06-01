import React, { memo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Linking,
} from 'react-native';
import { MessageCircle, UserPlus, ExternalLink } from 'lucide-react-native';
import type { DiscoverUser } from '../services/explore';
import { colors } from '../theme/colors';
import { fonts } from '../theme/fonts';

interface DeveloperCardProps {
  user: DiscoverUser;
  onMessage?: (userId: string) => void;
  onAddFriend?: (userId: string) => void;
}

function DeveloperCardComponent({
  user,
  onMessage,
  onAddFriend,
}: DeveloperCardProps) {
  const handleMessage = useCallback(() => {
    onMessage?.(user.id);
  }, [onMessage, user.id]);

  const handleAddFriend = useCallback(() => {
    onAddFriend?.(user.id);
  }, [onAddFriend, user.id]);

  const handleGithub = useCallback(() => {
    if (user.githubUrl) {
      Linking.openURL(user.githubUrl);
    }
  }, [user.githubUrl]);

  return (
    <View style={styles.container}>
      {/* Avatar + basic info */}
      <View style={styles.header}>
        {user.avatarUrl ? (
          <Image
            source={{ uri: user.avatarUrl }}
            style={styles.avatar}
          />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarText}>
              {(user.displayName || 'U').slice(0, 1).toUpperCase()}
            </Text>
          </View>
        )}
        <View style={styles.headerInfo}>
          <Text style={styles.name} numberOfLines={1}>
            {user.displayName}
          </Text>
          {user.username && (
            <Text style={styles.username}>@{user.username}</Text>
          )}
          {user.devRole && (
            <View style={styles.roleTag}>
              <Text style={styles.roleText}>{user.devRole}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Bio */}
      {user.bio && (
        <Text style={styles.bio} numberOfLines={3}>
          {user.bio}
        </Text>
      )}

      {/* Skills */}
      {user.skills && user.skills.length > 0 && (
        <View style={styles.skillsRow}>
          {user.skills.slice(0, 4).map((skill) => (
            <View key={skill} style={styles.skillChip}>
              <Text style={styles.skillText}>{skill}</Text>
            </View>
          ))}
          {user.skills.length > 4 && (
            <View style={styles.skillChip}>
              <Text style={styles.skillText}>+{user.skills.length - 4}</Text>
            </View>
          )}
        </View>
      )}

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.friendCount}>
          {user.friendCount} bạn bè
        </Text>
        <View style={styles.actions}>
          {user.githubUrl && (
            <TouchableOpacity
              onPress={handleGithub}
              style={styles.iconButton}
            >
              <ExternalLink size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={handleAddFriend}
            style={styles.iconButton}
          >
            <UserPlus size={16} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleMessage}
            style={[styles.iconButton, styles.primaryButton]}
          >
            <MessageCircle size={16} color={colors.textOnAccent} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export const DeveloperCard = memo(DeveloperCardComponent);

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: colors.glassPanel,
    padding: 16,
    marginBottom: 12,
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
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
    fontSize: 20,
  },
  headerInfo: {
    flex: 1,
  },
  name: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 16,
    marginBottom: 2,
  },
  username: {
    color: colors.textSubtle,
    fontFamily: fonts.regular,
    fontSize: 13,
    marginBottom: 4,
  },
  roleTag: {
    backgroundColor: colors.glassSoft,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  roleText: {
    color: colors.primary,
    fontFamily: fonts.medium,
    fontSize: 11,
  },
  bio: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 10,
  },
  skillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  skillChip: {
    backgroundColor: colors.glassUltra,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  skillText: {
    color: colors.primary,
    fontFamily: fonts.medium,
    fontSize: 12,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.glassBorderSoft,
  },
  friendCount: {
    color: colors.textSubtle,
    fontFamily: fonts.regular,
    fontSize: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.glassSoft,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
});
