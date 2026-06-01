import React from 'react';
import { StyleSheet, View, ViewStyle, StyleProp, StatusBar, ScrollView, RefreshControlProps } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { lightTheme } from '../theme/colors';

interface AppScreenProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  scrollable?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  hideStatusBar?: boolean;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  disableBottomSafeArea?: boolean;
}

export function AppScreen({
  children,
  style,
  scrollable = false,
  contentContainerStyle,
  hideStatusBar = false,
  refreshControl,
  disableBottomSafeArea = false,
}: AppScreenProps) {
  const insets = useSafeAreaInsets();
  const bottomInset = disableBottomSafeArea ? 0 : insets.bottom;
  
  const edges: ('top' | 'right' | 'bottom' | 'left')[] = ['top', 'left', 'right'];
  if (!disableBottomSafeArea) {
    edges.push('bottom');
  }

  const content = scrollable ? (
    <ScrollView
      style={styles.flex1}
      contentContainerStyle={[styles.scrollContent, { paddingBottom: 112 + bottomInset }, contentContainerStyle]}
      showsVerticalScrollIndicator={false}
      refreshControl={refreshControl}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex1, contentContainerStyle]}>{children}</View>
  );

  return (
    <SafeAreaView style={[styles.container, style]} edges={edges}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor="transparent"
        translucent
        hidden={hideStatusBar}
      />
      {content}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: lightTheme.bg,
  },
  flex1: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 112,
  },
});
