'use client';

import { Suspense } from 'react';
import ExploreContent from './explore-content';
import { PageLoading } from '@/components/shared/page-loading';
import { ZyncPageTransition } from '@/components/shared/ZyncPageTransition';

export default function ExplorePage() {
  return (
    <Suspense fallback={<PageLoading variant="explore" mode="panel" />}>
      <ZyncPageTransition className="flex h-full w-full min-h-0 min-w-0 flex-1 flex-col">
        <ExploreContent />
      </ZyncPageTransition>
    </Suspense>
  );
}
