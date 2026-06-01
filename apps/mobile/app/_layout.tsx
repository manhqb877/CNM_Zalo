import { useEffect, useState, useRef } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { Platform, Text, TextInput } from 'react-native';
import {
  useFonts,
  BeVietnamPro_400Regular,
  BeVietnamPro_500Medium,
  BeVietnamPro_600SemiBold,
  BeVietnamPro_700Bold
} from '@expo-google-fonts/be-vietnam-pro';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../src/store/useAuthStore';
import { socketService } from '../src/services/socket';
import { NotificationsProvider } from '../src/context/notifications-context';
import {
  configureNotificationHandler,
  addNotificationResponseListener,
  getPushToken,
  registerPushToken,
} from '../src/services/push-notifications';
import { IncomingCallOverlay } from '../src/components/IncomingCallOverlay';
import { ActiveCallBar } from '../src/components/ActiveCallBar';
import { ToastProvider } from '../src/components/Toast';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const MAX_FONT_SCALE = 1.15;
(Text as any).defaultProps = {
  ...((Text as any).defaultProps || {}),
  maxFontSizeMultiplier: MAX_FONT_SCALE,
};
(TextInput as any).defaultProps = {
  ...((TextInput as any).defaultProps || {}),
  maxFontSizeMultiplier: MAX_FONT_SCALE,
};

export default function RootLayout() {
  const router = useRouter();
  const pushTokenRegisteredRef = useRef(false);
  const [fontsLoaded, fontError] = useFonts({
    BeVietnamPro_400Regular,
    BeVietnamPro_500Medium,
    BeVietnamPro_600SemiBold,
    BeVietnamPro_700Bold,
  });

  const isHydrated = useAuthStore((s) => s.isHydrated);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // Connect socket when authenticated
  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    if (isAuthenticated) {
      socketService.connect();
    } else {
      socketService.disconnect();
    }
  }, [isHydrated, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      pushTokenRegisteredRef.current = false;
    }

    if (!isHydrated || !isAuthenticated || pushTokenRegisteredRef.current) {
      return;
    }

    pushTokenRegisteredRef.current = true;
    void (async () => {
      const token = await getPushToken();
      if (token) {
        await registerPushToken(token, Platform.OS);
      }
    })();
  }, [isHydrated, isAuthenticated]);

  // Configure push notification handler and tap listener
  useEffect(() => {
    configureNotificationHandler();

    const subscription = addNotificationResponseListener((conversationId, type) => {
      if (conversationId) {
        router.push({
          pathname: '/chat-room',
          params: { conversationId, name: 'Chat', isGroup: type === 'group_invite' || type === 'group_update' ? 'true' : 'false' },
        });
        return;
      }

      if (type === 'friend_request' || type === 'friend_accepted') {
        router.push('/(tabs)/friends');
        return;
      }

      router.push('/notifications');
    });

    return () => {
      subscription.remove();
    };
  }, [router]);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ToastProvider>
        <NotificationsProvider>
          <Stack>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            <Stack.Screen name="chat-room" options={{ headerShown: false }} />
            <Stack.Screen name="call-screen" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
            <Stack.Screen name="settings" options={{ headerShown: false }} />
            <Stack.Screen name="group-info" options={{ headerShown: false }} />
            <Stack.Screen name="create-group" options={{ headerShown: false }} />
            <Stack.Screen name="post-detail" options={{ headerShown: false }} />
            <Stack.Screen name="explore" options={{ headerShown: false }} />
            <Stack.Screen name="notifications" options={{ headerShown: false }} />
          </Stack>
          <IncomingCallOverlay />
          <ActiveCallBar />
        </NotificationsProvider>
      </ToastProvider>
    </GestureHandlerRootView>
  );
}
