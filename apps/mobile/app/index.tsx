import { Redirect } from 'expo-router';
import { useAuthStore } from '../src/store/useAuthStore';
import { getPostAuthRoute } from '../src/utils/onboarding';

export default function Index() {
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const userInfo = useAuthStore((s) => s.userInfo);

  if (!isHydrated) {
    return null;
  }

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/welcome" />;
  }

  return <Redirect href={getPostAuthRoute(userInfo)} />;
}
