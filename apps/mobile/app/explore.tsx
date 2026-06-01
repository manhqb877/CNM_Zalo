import { Redirect } from 'expo-router';

export default function ExploreRedirect() {
  return <Redirect href={{ pathname: '/(tabs)/community', params: { tab: 'explore' } }} />;
}
