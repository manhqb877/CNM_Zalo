import Constants from 'expo-constants';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import api from './api';

/** Cau hinh notification handler cho foreground notifications */
export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      // Tra ve true de cho phep hien thi notification khi app dang o foreground
      return {
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      };
    },
  });
}

/** Kiem tra va yeu cau quyen push notification */
export async function requestNotificationPermissions(): Promise<boolean> {
  if (!Device.isDevice) {
    console.log('Push notifications chi hoat dong tren thiet bi that');
    return false;
  }

  // Chi yeu cau tren Android (iOS tu dong hoi khi goi getPermissionsAsync)
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Mac dinh',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  return finalStatus === 'granted';
}

/** Lay Expo Push Token cho FCM (Android) / APNs (iOS) */
export async function getPushToken(): Promise<string | null> {
  if (!Device.isDevice) return null;

  try {
    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) return null;

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: Constants.expoConfig?.extra?.eas?.projectId,
    });

    return tokenData.data;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes('Default FirebaseApp is not initialized')) {
      console.info('Bỏ qua push token: APK Android chưa cấu hình FCM.');
      return null;
    }
    console.warn('Không thể lấy push token:', e);
    return null;
  }
}

/** Dang ky push token voi backend */
export async function registerPushToken(token: string, platform: string): Promise<void> {
  try {
    await api.post('/users/me/device-token', {
      deviceToken: token,
      platform,
    });
  } catch (e) {
    console.warn('Không thể đăng ký push token:', e);
  }
}

/** Lang nghe notification response (khi nguoi dung bam notification) */
export function addNotificationResponseListener(
  onResponse: (conversationId?: string, type?: string) => void
): Notifications.Subscription {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as Record<string, string | undefined>;
    const conversationId = data?.conversationId;
    const type = data?.type;
    onResponse(conversationId, type);
  });
}

/** Lang nghe foreground notifications */
export function addForegroundNotificationListener(
  onNotification: (title: string, body: string, data?: Record<string, string>) => void
): Notifications.Subscription {
  return Notifications.addNotificationReceivedListener((notification) => {
    const { title, body, data } = notification.request.content;
    onNotification(
      title ?? '',
      body ?? '',
      data as Record<string, string> | undefined
    );
  });
}
