/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: 'var(--bg-primary)',
          secondary: 'var(--bg-secondary)',
          sidebar: 'var(--bg-sidebar)',
          hover: 'var(--bg-hover)',
          active: 'var(--bg-active)',
          code: 'var(--bg-code)',
          card: 'var(--bg-card)',
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          tertiary: 'var(--text-tertiary)',
          link: 'var(--text-link)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
          light: 'var(--accent-light)',
          strong: 'var(--accent-strong)',
        },
        border: {
          DEFAULT: 'var(--border)',
          light: 'var(--border-light)',
          mint: 'var(--border-mint)',
          soft: 'var(--border-soft)',
          strong: 'var(--border-strong)',
        },
        surface: {
          DEFAULT: 'var(--surface-card)',
          soft: 'var(--surface-soft)',
          strong: 'var(--surface-card-strong)',
          muted: 'var(--surface-muted)',
          tint: 'var(--surface-tint)',
          panel: 'var(--surface-panel)',
          glass: 'var(--surface-glass)',
        },
        status: {
          bg: 'var(--status-bg)',
          border: 'var(--status-border)',
          text: 'var(--status-text)',
        },
        icon: {
          block: 'var(--icon-block-bg)',
          text: 'var(--icon-block-text)',
        },
      },
      fontFamily: {
        body: ['var(--font-body)', 'sans-serif'],
        display: ['var(--font-display)', 'sans-serif'],
        code: ['var(--font-code)', 'monospace'],
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        soft: 'var(--shadow-soft)',
        'soft-hover': 'var(--shadow-soft-hover)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        card: 'var(--radius-card)',
        pill: 'var(--radius-pill)',
      },
      animation: {
        // Preview
        'preview-slide-in': 'preview-slide-in 0.4s cubic-bezier(0.22,1,0.36,1) both',
        'preview-slide-out': 'preview-slide-out 0.3s cubic-bezier(0.55,0,1,0.45) both',
        'preview-progress': 'preview-progress 8s linear both',

      },
      keyframes: {
        'preview-slide-in': {
          from: { opacity: '0', transform: 'translateY(24px) scale(0.95)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'preview-slide-out': {
          from: { opacity: '1', transform: 'translateY(0) scale(1)' },
          to: { opacity: '0', transform: 'translateY(24px) scale(0.95)' },
        },
        'preview-progress': {
          from: { width: '100%' },
          to: { width: '0%' },
        },
      },
    },
  },
  plugins: [],
};
