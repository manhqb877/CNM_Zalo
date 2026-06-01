import { apiClient } from './api';

export interface AccountSettings {
  toastNotifications: boolean;
  allowSearchProfile: boolean;
  allowFriendRequest: boolean;
  allowMessagesFrom: 'everyone' | 'friends_only';
  showOnlineStatus: boolean;
}

export const DEFAULT_ACCOUNT_SETTINGS: AccountSettings = {
  toastNotifications: true,
  allowSearchProfile: true,
  allowFriendRequest: true,
  allowMessagesFrom: 'everyone',
  showOnlineStatus: true,
};

export const ACCOUNT_SETTINGS_STORAGE_KEY = 'zync.account.settings';
export const ACCOUNT_SETTINGS_EVENT = 'zync.account.settings.updated';

export function loadCachedAccountSettings(): AccountSettings {
  if (typeof window === 'undefined') return DEFAULT_ACCOUNT_SETTINGS;

  const raw = window.localStorage.getItem(ACCOUNT_SETTINGS_STORAGE_KEY);
  if (!raw) return DEFAULT_ACCOUNT_SETTINGS;

  try {
    const parsed = JSON.parse(raw) as Partial<AccountSettings>;
    return {
      toastNotifications: parsed.toastNotifications ?? DEFAULT_ACCOUNT_SETTINGS.toastNotifications,
      allowSearchProfile: parsed.allowSearchProfile ?? DEFAULT_ACCOUNT_SETTINGS.allowSearchProfile,
      allowFriendRequest: parsed.allowFriendRequest ?? DEFAULT_ACCOUNT_SETTINGS.allowFriendRequest,
      allowMessagesFrom: parsed.allowMessagesFrom ?? DEFAULT_ACCOUNT_SETTINGS.allowMessagesFrom,
      showOnlineStatus: parsed.showOnlineStatus ?? DEFAULT_ACCOUNT_SETTINGS.showOnlineStatus,
    };
  } catch {
    return DEFAULT_ACCOUNT_SETTINGS;
  }
}

export function persistAccountSettings(settings: AccountSettings): void {
  if (typeof window === 'undefined') return;

  window.localStorage.setItem(ACCOUNT_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent(ACCOUNT_SETTINGS_EVENT, { detail: settings }));
}

export async function fetchAccountSettings(): Promise<AccountSettings> {
  const { data } = await apiClient.get<{ success: boolean; settings: AccountSettings }>('/api/users/me/settings');
  return data.settings;
}

export async function updateAccountSettings(payload: Partial<AccountSettings>): Promise<AccountSettings> {
  const { data } = await apiClient.patch<{ success: boolean; settings: AccountSettings }>(
    '/api/users/me/settings',
    payload,
  );
  return data.settings;
}
