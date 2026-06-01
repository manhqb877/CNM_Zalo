'use client';

import { useCallback, useEffect, useState } from 'react';
import { useNotifications } from '@/hooks/use-notifications';
import { NotificationBell } from '../molecules/NotificationBell';
import { NotificationPanel } from './NotificationPanel';
import { NotificationSettings } from './NotificationSettings';
import type { Notification } from '@/services/notifications';

type PanelView = 'closed' | 'list' | 'settings';

interface NotificationHubProps {
  onNavigate?: (notification: Notification) => void;
  openSignal?: string | null;
}

export function NotificationHub({ onNavigate, openSignal }: NotificationHubProps) {
  const {
    notifications,
    unreadCount,
    preferences,
    isLoading,
    hasMore,
    loadNotifications,
    loadMore,
    markRead,
    markAllRead,
    loadPreferences,
    updatePreferences,
  } = useNotifications();

  const [view, setView] = useState<PanelView>('closed');

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  // Allow external trigger (from toast deep link) to open list
  useEffect(() => {
    if (!openSignal) return;
    setView('list');
  }, [openSignal]);

  const handleBellClick = useCallback(() => {
    setView((prev) => (prev === 'closed' ? 'list' : 'closed'));
  }, []);

  const handleClose = useCallback(() => setView('closed'), []);

  const handleOpenSettings = useCallback(() => {
    void loadPreferences();
    setView('settings');
  }, [loadPreferences]);

  const handleClickNotification = useCallback(
    (n: Notification) => {
      onNavigate?.(n);
      setView('closed');
    },
    [onNavigate],
  );

  return (
    <div className="relative">
      <NotificationBell
        unreadCount={unreadCount}
        onClick={handleBellClick}
        isOpen={view !== 'closed'}
      />

      {view === 'list' && (
        <NotificationPanel
          notifications={notifications}
          isLoading={isLoading}
          hasMore={hasMore}
          onLoadMore={loadMore}
          onMarkAllRead={markAllRead}
          onMarkRead={markRead}
          onClickNotification={handleClickNotification}
          onClose={handleClose}
          onOpenSettings={handleOpenSettings}
        />
      )}

      {view === 'settings' && (
        <NotificationSettings
          preferences={preferences}
          onUpdate={updatePreferences}
          onClose={handleClose}
        />
      )}
    </div>
  );
}
