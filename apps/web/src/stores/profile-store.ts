'use client';

import { fetchMyProfile, type MeUser } from '@/services/users';

type ProfileStore = {
  profile: MeUser | null;
  isLoading: boolean;
  isReady: boolean;
  error: string | null;
  load: (force?: boolean) => Promise<void>;
  setProfile: (profile: MeUser | null) => void;
  reset: () => void;
};

let _profile: MeUser | null = null;
let _isLoading = false;
let _isReady = false;
let _error: string | null = null;
let _listeners: Array<(profile: MeUser | null, isLoading: boolean, isReady: boolean, error: string | null) => void> = [];

function notify() {
  for (const listener of _listeners) {
    listener(_profile, _isLoading, _isReady, _error);
  }
}

export const profileStore: ProfileStore = {
  get profile() { return _profile; },
  get isLoading() { return _isLoading; },
  get isReady() { return _isReady; },
  get error() { return _error; },
  async load(force = false) {
    if (_isLoading || (_isReady && !force)) return;
    if (force) {
      _isReady = false;
      _error = null;
    }
    _isLoading = true;
    notify();
    try {
      const p = await fetchMyProfile();
      _profile = p;
      _isReady = true;
      _error = null;
    } catch {
      _isReady = true;
      _profile = null;
      _error = 'Không thể tải hồ sơ người dùng. Vui lòng thử lại.';
    } finally {
      _isLoading = false;
      notify();
    }
  },
  setProfile(profile) {
    _profile = profile;
    _isReady = true;
    _isLoading = false;
    _error = null;
    notify();
  },
  reset() {
    _profile = null;
    _isReady = false;
    _isLoading = false;
    _error = null;
    notify();
  },
};

export function subscribeToProfileStore(
  listener: (profile: MeUser | null, isLoading: boolean, isReady: boolean, error: string | null) => void,
): () => void {
  _listeners.push(listener);
  listener(_profile, _isLoading, _isReady, _error);
  return () => {
    _listeners = _listeners.filter((l) => l !== listener);
  };
}
