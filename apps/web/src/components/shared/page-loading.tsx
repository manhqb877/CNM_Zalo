'use client';

import { useEffect, useState, Suspense } from 'react';
import {
  SkeletonChatPage,
  SkeletonFriendsPage,
  SkeletonCommunityPage,
  SkeletonProfilePage,
  SkeletonExplorePage,
  SkeletonHomePage,
  SkeletonSettingsPage,
} from './ZyncPageSkeleton';
import { AppLoader, PageSkeleton } from './loading-system';

export type PageLoadingVariant =
  | 'generic'
  | 'chat'
  | 'friends'
  | 'community'
  | 'profile'
  | 'explore'
  | 'home'
  | 'settings';

export interface PageLoadingProps {
  minDurationMs?: number;
  mode?: 'page' | 'panel';
  className?: string;
  message?: string;
  description?: string;
  /** Render a specific page skeleton instead of the default generic card */
  variant?: PageLoadingVariant;
}

/** Maps variant → actual skeleton component */
function SkeletonForVariant({ variant }: { variant: PageLoadingVariant }) {
  switch (variant) {
    case 'chat':
      return <SkeletonChatPage />;
    case 'friends':
      return <SkeletonFriendsPage />;
    case 'community':
      return <SkeletonCommunityPage />;
    case 'profile':
      return <SkeletonProfilePage />;
    case 'explore':
      return <SkeletonExplorePage />;
    case 'home':
      return <SkeletonHomePage />;
    case 'settings':
      return <SkeletonSettingsPage />;
    default:
      return null;
  }
}

export function PageLoading({
  minDurationMs,
  mode = 'page',
  className,
  message,
  description,
  variant = 'generic',
}: PageLoadingProps) {
  const [visible, setVisible] = useState(!minDurationMs);

  useEffect(() => {
    if (!minDurationMs) return;
    const timer = globalThis.setTimeout(() => setVisible(true), minDurationMs);
    return () => globalThis.clearTimeout(timer);
  }, [minDurationMs]);

  if (!visible) return null;

  /* Variant-specific page skeleton */
  if (variant !== 'generic') {
    const containerClassName = [
      mode === 'panel'
        ? 'flex h-full w-full overflow-hidden bg-[var(--loader-bg)]'
        : 'flex min-h-screen w-full overflow-hidden bg-[var(--loader-bg)]',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div className={containerClassName} role="status" aria-live="polite" aria-busy="true">
        <SkeletonForVariant variant={variant} />
      </div>
    );
  }

  /* Generic loader card */
  const containerClassName = [
    mode === 'panel'
      ? 'flex h-full w-full items-center justify-center px-4 text-text-primary bg-[var(--loader-card)]'
      : 'flex min-h-screen w-full items-center justify-center px-4 text-text-primary bg-[var(--loader-bg)]',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={containerClassName} role="status" aria-live="polite" aria-busy="true">
      {mode === 'panel' ? (
        <PageSkeleton className="max-w-md" rows={3} />
      ) : (
        <AppLoader
          message={message ?? 'Đang tải ZYNC...'}
          description={description ?? 'Chuẩn bị dữ liệu và giao diện.'}
        />
      )}
    </div>
  );
}

/* ============================================================
 * Page-level Suspense wrapper with PageLoading skeleton
 * Usage: <PageSuspense variant="home"><ActualContent /></PageSuspense>
 * ============================================================ */
export interface PageSuspenseProps {
  variant?: PageLoadingVariant;
  mode?: 'page' | 'panel';
  children: React.ReactNode;
}

export function PageSuspense({ variant = 'generic', mode = 'page', children }: PageSuspenseProps) {
  return (
    <Suspense fallback={<PageLoading variant={variant} mode={mode} />}>
      {children}
    </Suspense>
  );
}
