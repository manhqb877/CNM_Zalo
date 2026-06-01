import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { colors } from '../../src/theme/colors';
import { typography } from '../../src/theme/fonts';

interface AuthHeaderProps {
  title: string;
  subtitle?: string;
  showBackButton?: boolean;
  rightAction?: React.ReactNode;
}

export function AuthHeader({ title, subtitle, showBackButton = false, rightAction }: AuthHeaderProps) {
  const router = useRouter();

  return (
    <View style={styles.container}>
      {showBackButton && (
        <TouchableOpacity 
          onPress={() => router.back()} 
          style={styles.iconButton}
          activeOpacity={0.7}
        >
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
      )}
      
      <View style={styles.titleContainer}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle && (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>

      <View style={styles.rightAction}>
        {rightAction}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 56,
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  iconButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: -8,
  },
  titleContainer: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  title: {
    ...typography.h2,
    fontSize: 20,
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSubtle,
    textAlign: 'center',
    marginTop: 2,
  },
  rightAction: {
    width: 40,
    alignItems: 'flex-end',
  },
});
