import { lightTheme } from './colors';

export const mobileTheme = {
  colors: {
    bg: lightTheme.bg,
    surface: lightTheme.surface,
    surfaceSoft: lightTheme.surfaceSoft,
    accent: lightTheme.accent,
    accentDark: lightTheme.accentHover,
    accentSoft: lightTheme.accentSoft,
    textPrimary: lightTheme.textPrimary,
    textSecondary: lightTheme.textSecondary,
    textMuted: lightTheme.textMuted,
    border: lightTheme.border,
    danger: lightTheme.danger,
    dangerSoft: lightTheme.dangerSoft,
    dangerBorder: lightTheme.dangerBorder,
    warning: lightTheme.warning,
    info: lightTheme.info,
    success: lightTheme.success,
    textOnAccent: lightTheme.textOnAccent,
  },
  radius: {
    radiusCard: 18,
    radiusInput: 16,
    radiusPill: 999,
  },
  shadow: {
    shadowSoft: {
      shadowColor: '#0F172A',
      shadowOpacity: 0.05,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 2,
    },
    shadowFloating: {
      shadowColor: '#0F172A',
      shadowOpacity: 0.12,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 10 },
      elevation: 10,
    },
  },
  spacing: {
    screenPadding: 16,
    sectionGap: 16,
    cardPadding: 16,
  },
};

export const mobileColors = mobileTheme.colors;
export const mobileRadius = mobileTheme.radius;
export const mobileShadow = mobileTheme.shadow;
export const mobileSpacing = mobileTheme.spacing;
