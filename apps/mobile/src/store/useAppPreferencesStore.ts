import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

export type AppThemeMode = 'light' | 'dark';

const THEME_KEY = 'zync.mobile.theme';

interface AppPreferencesState {
  hydrated: boolean;
  theme: AppThemeMode;
  hydrate: () => Promise<void>;
  setTheme: (theme: AppThemeMode) => Promise<void>;
  toggleTheme: () => Promise<void>;
}

export const useAppPreferencesStore = create<AppPreferencesState>((set, get) => ({
  hydrated: false,
  theme: 'light',

  hydrate: async () => {
    try {
      await AsyncStorage.setItem(THEME_KEY, 'light');
    } catch {
      // ignore storage errors and use default value
    }
    set({ hydrated: true, theme: 'light' });
  },

  setTheme: async (theme) => {
    set({ theme: 'light' });
    try {
      await AsyncStorage.setItem(THEME_KEY, 'light');
    } catch {
      // ignore storage errors to avoid blocking UI
    }
  },

  toggleTheme: async () => {
    await get().setTheme('light');
  },
}));
