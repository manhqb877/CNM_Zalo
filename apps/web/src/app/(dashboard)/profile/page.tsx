'use client';

import { Suspense } from 'react';
import { useEffect, useState } from 'react';
import { HomeDashboardProfilePanel } from '@/components/home-dashboard/organisms/home-dashboard-profile-panel';
import { profileStore, subscribeToProfileStore } from '@/stores/profile-store';
import { PageLoading } from '@/components/shared/page-loading';
import { ZyncPageTransition } from '@/components/shared/ZyncPageTransition';
import type { MeUser } from '@/services/users';

export default function ProfilePage() {
  return (
    <Suspense fallback={<PageLoading variant="profile" mode="panel" />}>
      <ZyncPageTransition className="flex h-full w-full min-h-0 min-w-0 flex-1 flex-col">
        <ProfilePageContent />
      </ZyncPageTransition>
    </Suspense>
  );
}

function ProfilePageContent() {
  const [profile, setProfile] = useState<MeUser | null>(profileStore.profile);
  const [loading, setLoading] = useState(profileStore.isLoading || !profileStore.isReady);

  useEffect(() => {
    void profileStore.load();
  }, []);

  useEffect(() => {
    const unsub = subscribeToProfileStore((nextProfile, isLoading, isReady, _error) => {
      setProfile(nextProfile);
      setLoading(isLoading || !isReady);
    });
    return unsub;
  }, []);

  const handleProfileUpdated = (updated: MeUser) => {
    profileStore.setProfile(updated);
  };

  return (
    <div className="h-full w-full overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
      <HomeDashboardProfilePanel
        profile={profile}
        loading={loading}
        error={null}
        onProfileUpdated={handleProfileUpdated}
      />
    </div>
  );
}
