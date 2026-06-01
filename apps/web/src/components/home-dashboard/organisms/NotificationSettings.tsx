'use client';

import { useEffect, useRef } from 'react';
import type { NotificationPreferences } from '@/services/notifications';
import { AppLoader } from '@/components/shared/loading-system';

interface NotificationSettingsProps {
  preferences: NotificationPreferences | null;
  onUpdate: (prefs: { enablePush?: boolean; enableSound?: boolean; enableBadge?: boolean }) => void;
  onClose: () => void;
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="zync-soft-card-muted flex cursor-pointer items-center justify-between gap-3 rounded-[1.1rem] px-3 py-3">
      <span className="font-ui-content text-sm text-text-primary">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-10 flex-shrink-0 rounded-full transition-colors duration-200 ${
          checked ? 'bg-accent' : 'bg-border'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 translate-y-1 rounded-full bg-white shadow transition-transform duration-200 ${
            checked ? 'translate-x-5' : 'translate-x-1'
          }`}
        />
      </button>
    </label>
  );
}

export function NotificationSettings({ preferences, onUpdate, onClose }: NotificationSettingsProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  if (!preferences) {
    return (
      <div
        ref={panelRef}
        className="absolute right-0 top-[calc(100%+10px)] z-50 w-[400px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[var(--radius-card)] p-4 zync-notification-panel"
      >
        <AppLoader layout="bare" size="sm" tone="teal" message="Đang tải..." className="py-6" />
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-[calc(100%+10px)] z-50 w-[400px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[var(--radius-card)] zync-notification-panel"
      style={{ animation: 'settingsSlide 0.2s ease-out' }}
    >
      <div className="flex items-center justify-between border-b border-border-soft bg-[var(--surface)] px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          className="zync-soft-button-ghost h-8 w-8 p-0"
          aria-label="Quay lai"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
            <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h3 className="font-ui-title text-sm text-text-primary">Cài đặt thông báo</h3>
        <div className="w-8" />
      </div>

      <div className="space-y-3 px-3 py-3">
        <Toggle
          checked={preferences.enablePush}
          onChange={(value) => onUpdate({ enablePush: value })}
          label="Thông báo đẩy"
        />
        <Toggle
          checked={preferences.enableSound}
          onChange={(value) => onUpdate({ enableSound: value })}
          label="Âm thanh thông báo"
        />
        <Toggle
          checked={preferences.enableBadge}
          onChange={(value) => onUpdate({ enableBadge: value })}
          label="Hiển thị badge đếm"
        />
      </div>

      {preferences.mutedConversations.length > 0 && (
        <div className="border-t border-border-soft px-4 py-3">
          <p className="font-ui-content text-xs text-text-secondary">
            {preferences.mutedConversations.length} cuộc trò chuyện đang tắt tiếng
          </p>
        </div>
      )}

      <style jsx>{`
        @keyframes settingsSlide {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
