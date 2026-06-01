'use client';

import type { JSX } from 'react';
import { InAppNotificationToasts } from '@/components/notifications/InAppNotificationToasts';

const SystemToasts = InAppNotificationToasts as unknown as () => JSX.Element | null;

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <SystemToasts />
    </>
  );
}

