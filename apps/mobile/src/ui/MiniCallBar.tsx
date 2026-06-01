import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useActiveCallStore } from '../store/useActiveCallStore';
import { fonts } from '../theme/fonts';

export function MiniCallBar() {
  const router = useRouter();
  const activeCall = useActiveCallStore((s) => s.activeCall);

  if (!activeCall || activeCall.status === 'ended' || activeCall.status === 'rejected' || activeCall.status === 'missed') {
    return null;
  }

  const handlePress = () => {
    router.push({
      pathname: '/call-screen',
    });
  };

  return (
    <TouchableOpacity style={styles.container} onPress={handlePress} activeOpacity={0.8}>
      <View style={styles.iconContainer}>
        <Ionicons name={activeCall.callType === 'audio' ? 'call' : 'videocam'} size={16} color="#fff" />
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.title} numberOfLines={1}>
          Chạm để quay lại cuộc gọi
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {activeCall.status === 'connected' ? 'Đang diễn ra' : 'Đang kết nối...'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    backgroundColor: '#10b981',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 9999,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    color: '#fff',
    fontFamily: fonts.semiBold,
    fontSize: 14,
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontFamily: fonts.medium,
    fontSize: 12,
    marginTop: 2,
  },
});
