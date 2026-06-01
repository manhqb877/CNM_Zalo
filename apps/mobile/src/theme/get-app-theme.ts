import { darkTheme, lightTheme } from './colors';
import type { AppThemeMode } from '../store/useAppPreferencesStore';

export function getAppTheme(mode: AppThemeMode) {
  return lightTheme;
}
