'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  fetchAccountSettings,
  loadCachedAccountSettings,
  persistAccountSettings,
  updateAccountSettings,
  type AccountSettings,
} from '@/services/account-settings';

interface SettingSwitchProps {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}

function SettingSwitch({ label, description, checked, disabled = false, onChange }: SettingSwitchProps) {
  return (
    <div className={`zync-soft-card-muted flex items-start justify-between gap-4 rounded-[1.2rem] p-4 ${disabled ? 'opacity-60' : ''}`}>
      <div>
        <p className="font-ui-title text-sm text-text-primary">{label}</p>
        <p className="font-ui-content mt-1 text-xs leading-6 text-text-secondary">{description}</p>
      </div>
      <button
        type="button"
        onClick={() => {
          if (!disabled) {
            onChange(!checked);
          }
        }}
        disabled={disabled}
        className={`relative inline-flex h-6 w-11 rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-border'} ${disabled ? 'cursor-not-allowed' : ''}`}
        aria-pressed={checked}
      >
        <span
          className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${checked ? 'left-6' : 'left-1'}`}
        />
      </button>
    </div>
  );
}

export function HomeDashboardSettingsPanel() {
  const [settings, setSettings] = useState<AccountSettings>(loadCachedAccountSettings());
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadSettings = async () => {
      try {
        const remote = await fetchAccountSettings();
        if (!active) return;
        setSettings(remote);
        persistAccountSettings(remote);
        setErrorMessage(null);
      } catch {
        if (!active) return;
        setSettings(loadCachedAccountSettings());
        setErrorMessage('Không thể tải cài đặt. Đang dùng cấu hình gần nhất.');
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void loadSettings();
    return () => {
      active = false;
    };
  }, []);

  const applySettings = async (patch: Partial<AccountSettings>) => {
    const prev = settings;
    const next = { ...settings, ...patch };
    setSettings(next);
    persistAccountSettings(next);

    try {
      const saved = await updateAccountSettings(patch);
      setSettings(saved);
      persistAccountSettings(saved);
      setErrorMessage(null);
    } catch {
      setSettings(prev);
      persistAccountSettings(prev);
      setErrorMessage('Cập nhật cài đặt thất bại. Vui lòng thử lại.');
    }
  };

  const summary = useMemo(() => {
    const enabled = [
      settings.toastNotifications,
      settings.allowSearchProfile,
      settings.allowFriendRequest,
      settings.allowMessagesFrom === 'everyone',
      settings.showOnlineStatus,
    ].filter(Boolean).length;
    return `${enabled}/5 tùy chọn đang bật`;
  }, [settings.allowFriendRequest, settings.allowMessagesFrom, settings.allowSearchProfile, settings.showOnlineStatus, settings.toastNotifications]);

  return (
    <section className="mt-5 space-y-5">
      <header className="zync-soft-card rounded-[1.8rem] px-5 py-5">
        <p className="font-ui-meta text-xs uppercase tracking-wider text-accent-strong">Trung tâm điều khiển</p>
        <h2 className="font-ui-title mt-2 text-2xl text-text-primary">Cài đặt tài khoản</h2>
          <p className="font-ui-content mt-2 max-w-2xl text-sm leading-7 text-text-secondary">
          Tinh chỉnh thông báo, quyền riêng tư và trạng thái hoạt động để kiểm soát trải nghiệm tài khoản của bạn.
        </p>
        {errorMessage && (
          <p className="font-ui-content mt-2 text-xs text-red-500">{errorMessage}</p>
        )}
        <p className="font-ui-title mt-4 text-sm text-text-primary">{summary}</p>
      </header>

      <section className="zync-soft-card rounded-[1.8rem] p-4 sm:p-5">
        <h3 className="font-ui-title text-lg text-text-primary">Cài đặt nhanh</h3>

        <div className="mt-4 space-y-3">
          <SettingSwitch
            label="Thông báo trôi vào"
            description="Hiển thị toast thông báo nổi khi có sự kiện mới."
            checked={settings.toastNotifications}
            disabled={isLoading}
            onChange={(value) => void applySettings({ toastNotifications: value })}
          />

          <SettingSwitch
            label="Cho phép tìm kiếm tài khoản"
            description="Người dùng khác có thể tìm thấy bạn qua tìm kiếm."
            checked={settings.allowSearchProfile}
            disabled={isLoading}
            onChange={(value) => void applySettings({ allowSearchProfile: value })}
          />

          <SettingSwitch
            label="Cho phép gửi lời mời kết bạn"
            description="Người dùng khác có thể gửi lời mời kết bạn cho bạn."
            checked={settings.allowFriendRequest}
            disabled={isLoading}
            onChange={(value) => void applySettings({ allowFriendRequest: value })}
          />

          <SettingSwitch
            label="Cho phép người lạ nhắn tin"
            description="Tắt tùy chọn này để chỉ bạn bè có thể mở hội thoại 1-1 với bạn."
            checked={settings.allowMessagesFrom === 'everyone'}
            disabled={isLoading}
            onChange={(value) => void applySettings({ allowMessagesFrom: value ? 'everyone' : 'friends_only' })}
          />

          <SettingSwitch
            label="Trạng thái hoạt động"
            description="Cho phép bạn bè nhìn thấy khi bạn đang online."
            checked={settings.showOnlineStatus}
            disabled={isLoading}
            onChange={(value) => void applySettings({ showOnlineStatus: value })}
          />
        </div>
      </section>
    </section>
  );
}
