// Module: home | Component: HomePage | Type: container
// Depends: home screen data
'use client';

import { useEffect, useState } from 'react';
import { HOME_MOCK_DATA } from '@/components/home/mockData';
import { HomeScreen } from '@/components/home/organisms/home-screen';
import { PageLoading } from '@/components/shared/page-loading';

export default function HomePage() {
  const [isPageLoading, setIsPageLoading] = useState(true);

  useEffect(() => {
    const timer = globalThis.setTimeout(() => {
      setIsPageLoading(false);
    }, 700);

    return () => {
      globalThis.clearTimeout(timer);
    };
  }, []);

  if (isPageLoading) {
    return <PageLoading />;
  }

  return <HomeScreen data={HOME_MOCK_DATA} />;
}
