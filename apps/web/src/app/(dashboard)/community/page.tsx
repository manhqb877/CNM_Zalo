'use client';

import { Suspense } from 'react';
import CommunityContent from './community-content';
import { PageLoading } from '@/components/shared/page-loading';
import { ZyncPageTransition } from '@/components/shared/ZyncPageTransition';

export default function CommunityPage() {
  return (
    <Suspense fallback={<PageLoading variant="community" mode="panel" />}>
      <ZyncPageTransition className="flex h-full w-full min-h-0 min-w-0 flex-1 flex-col">
        <CommunityContent />
      </ZyncPageTransition>
    </Suspense>
  );
}
