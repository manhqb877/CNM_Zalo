// Unified teal palette matching Web design tokens (--accent: #0f9d8e / #22c7b5)
export const lightTheme = {
  bg: '#F4FBF8',
  surface: '#FFFFFF',
  surfaceSoft: '#EAF8F4',
  accentSoft: '#D8F3EC',
  textMuted: '#8AA0A0',

  bgPrimary: '#F4FBF8',
  bgSecondary: '#EAF8F4',
  bgSidebar: 'rgba(255, 255, 255, 0.65)',
  bgHover: '#D8F3EC',
  bgActive: '#CBD5E1',
  bgCode: '#F1F5F9',
  bgCard: '#FFFFFF',

  textPrimary: '#111827',
  textSecondary: '#64748B',
  textTertiary: '#94A3B8',
  textLink: '#0f9d8e',

  accent: '#0f9d8e',
  accentDark: '#0b8073',
  accentHover: '#0b8073',
  accentLight: '#D8F3EC',
  accentStrong: '#07544b',
  textOnAccent: '#FFFFFF',

  info: '#3B82F6',
  warning: '#F59E0B',
  danger: '#EF4444',
  violet: '#8B5CF6',
  pink: '#EC4899',
  neutral: '#64748B',
  success: '#10B981',
  dangerSoft: 'rgba(239, 68, 68, 0.08)',
  dangerBorder: 'rgba(239, 68, 68, 0.2)',

  border: '#D7E8E3',
  borderLight: '#ECF4F1',

  surfaceCard: '#FFFFFF',
  surfaceCardStrong: '#FFFFFF',
  surfaceMuted: '#F2FAF7',
  surfaceGlass: 'rgba(255, 255, 255, 0.8)',
  surfaceGlassStrong: 'rgba(255, 255, 255, 0.95)',

  glassBorder: 'rgba(15, 157, 142, 0.1)',
  glassBorderSoft: 'rgba(15, 157, 142, 0.05)',
  glassGlow: 'rgba(15, 157, 142, 0.1)',
  glassShadow: 'rgba(0, 0, 0, 0.04)',
  divider: '#E2E8F0',
};

export const darkTheme = {
  bgPrimary: '#08111f',
  bgSecondary: '#0d1727',
  bgSidebar: 'rgba(9, 18, 33, 0.86)',
  bgHover: '#162235',
  bgActive: '#1c3140',
  bgCode: '#0d1727',
  bgCard: '#111d31',

  textPrimary: '#edf4fb',
  textSecondary: '#9fb0c4',
  textTertiary: '#74859b',
  textLink: '#53ddcf',

  accent: '#22c7b5',
  accentHover: '#1ab1a1',
  accentLight: 'rgba(34, 199, 181, 0.16)',
  accentStrong: '#0d6b62',
  textOnAccent: '#FFFFFF',

  info: '#60A5FA',
  warning: '#FBBF24',
  danger: '#F87171',
  violet: '#A78BFA',
  pink: '#F472B6',
  neutral: '#94A3B8',
  dangerSoft: 'rgba(248, 113, 113, 0.12)',
  dangerBorder: 'rgba(248, 113, 113, 0.28)',

  border: '#30363D',
  borderLight: '#21262D',

  surfaceCard: 'rgba(17, 29, 49, 0.84)',
  surfaceCardStrong: 'rgba(17, 29, 49, 0.96)',
  surfaceMuted: 'rgba(14, 24, 40, 0.82)',
  surfaceGlass: 'rgba(12, 21, 36, 0.74)',
  surfaceGlassStrong: 'rgba(12, 21, 36, 0.86)',

  glassBorder: 'rgba(34, 199, 181, 0.24)',
  glassBorderSoft: 'rgba(34, 199, 181, 0.14)',
  glassGlow: 'rgba(34, 199, 181, 0.22)',
  glassShadow: 'rgba(2, 6, 23, 0.5)',
  divider: 'rgba(255, 255, 255, 0.1)',
};

// Flat color aliases kept for older screens. Mobile is light-only, so these
// aliases intentionally mirror the web light mode instead of dark fallbacks.
export const colors = {
  // Teal accent (Web-aligned)
  primary: '#0f9d8e',
  primaryHover: '#0b8073',
  accent: '#0f9d8e',
  accentLight: '#D8F3EC',
  accentSoft: '#D8F3EC',
  textOnAccent: '#FFFFFF',
  info: '#2563EB',
  warning: '#F59E0B',
  danger: '#EF4444',
  violet: '#8B5CF6',
  pink: '#EC4899',
  neutral: '#64748B',

  backgroundDeep: '#E8F5F1',
  backgroundMid: '#F4FBF8',
  backgroundSoft: '#ffffff',
  backgroundAuth: '#f6f9fc',

  background: '#F4FBF8',
  surface: '#FFFFFF',
  surfaceSoft: '#EAF8F4',
  surfaceHover: '#D8F3EC',

  glassUltra: 'rgba(15, 157, 142, 0.08)',
  glassSoft: 'rgba(255, 255, 255, 0.72)',
  glassStrong: 'rgba(255, 255, 255, 0.94)',
  glassPanel: 'rgba(255, 255, 255, 0.86)',
  glassPanelStrong: 'rgba(255, 255, 255, 0.98)',

  glassBorder: 'rgba(15, 157, 142, 0.24)',
  glassBorderSoft: 'rgba(15, 157, 142, 0.14)',
  glassGlow: 'rgba(15, 157, 142, 0.22)',
  glassShadow: 'rgba(11, 17, 32, 0.16)',
  divider: 'rgba(11, 17, 32, 0.1)',

  text: '#0b1120',
  textPrimary: '#0b1120',
  textSecondary: '#1e293b',
  textTertiary: '#5c6c85',
  textMuted: '#5c6c85',
  textSubtle: '#5c6c85',

  error: '#EF4444',
  success: '#22c7b5',
  dangerSoft: 'rgba(239, 68, 68, 0.08)',
  dangerBorder: 'rgba(239, 68, 68, 0.2)',

  border: '#D0D7DE',
};

export const mobileTokens = {
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
    warning: lightTheme.warning,
    info: lightTheme.info,
    success: lightTheme.success,
  },
  shadow: {
    soft: {
      shadowColor: '#0F172A',
      shadowOpacity: 0.05,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 2,
    },
    floating: {
      shadowColor: '#0F172A',
      shadowOpacity: 0.12,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 10 },
      elevation: 10,
    },
  },
};
