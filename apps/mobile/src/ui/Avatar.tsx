import React from 'react';
import { View, Image, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { lightTheme } from '../theme/colors';
import { fonts } from '../theme/fonts';

interface AvatarProps {
  url?: string;
  name?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
  status?: 'online' | 'offline' | 'busy' | 'away';
  showStatus?: boolean;
}

export function Avatar({ url, name = 'User', size = 48, style, status, showStatus = false }: AvatarProps) {
  const statusColor = {
    online: '#10B981',
    offline: '#94A3B8',
    busy: '#EF4444',
    away: '#F59E0B',
  };

  const statusSize = size * 0.28;

  return (
    <View style={[styles.container, { width: size, height: size }, style]}>
      {url ? (
        <Image source={{ uri: url }} style={[styles.image, { borderRadius: size / 2 }]} />
      ) : (
        <View style={[styles.fallback, { borderRadius: size / 2 }]}>
          <Text style={[styles.fallbackText, { fontSize: size * 0.4 }]}>
            {name.charAt(0).toUpperCase()}
          </Text>
        </View>
      )}
      {showStatus && status && (
        <View 
          style={[
            styles.status, 
            { 
              width: statusSize, 
              height: statusSize, 
              borderRadius: statusSize / 2,
              backgroundColor: statusColor[status],
              right: size * 0.05,
              bottom: size * 0.05,
            }
          ]} 
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  fallback: {
    width: '100%',
    height: '100%',
    backgroundColor: lightTheme.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackText: {
    color: lightTheme.accentStrong,
    fontFamily: fonts.bold,
  },
  status: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
});
