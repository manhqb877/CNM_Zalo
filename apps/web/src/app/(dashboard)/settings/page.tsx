'use client';

import { Suspense } from 'react';
import { HomeDashboardSettingsPanel } from '@/components/home-dashboard/organisms/home-dashboard-settings-panel';
import { PageLoading } from '@/components/shared/page-loading';
import { ZyncPageTransition } from '@/components/shared/ZyncPageTransition';

export default function SettingsPage() {
  return (
    <Suspense fallback={<PageLoading variant="settings" mode="panel" />}>
      <ZyncPageTransition className="flex h-full w-full min-h-0 min-w-0 flex-1 flex-col">
        <SettingsPageContent />
      </ZyncPageTransition>
    </Suspense>
  );
}

function SettingsPageContent() {
  return (
    <div className="h-full w-full overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
      <HomeDashboardSettingsPanel />
    </div>
  );
}
