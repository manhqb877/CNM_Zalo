import clsx from 'clsx';

interface ZyncLogoProps {
  variant?: 'full' | 'mark';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeMap = {
  sm: {
    mark: 'h-9 w-9',
    word: 'text-xl',
    gap: 'gap-2.5',
  },
  md: {
    mark: 'h-11 w-11',
    word: 'text-2xl',
    gap: 'gap-3',
  },
  lg: {
    mark: 'h-14 w-14',
    word: 'text-4xl',
    gap: 'gap-4',
  },
};

function ZyncMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <path
        d="M18 7h28c7.18 0 13 5.82 13 13v24c0 7.18-5.82 13-13 13H18C10.82 57 5 51.18 5 44V20C5 12.82 10.82 7 18 7Z"
        fill="url(#zync-mark-bg)"
      />
      <path
        d="M21 21.5h22.5L21.7 42.5H43"
        stroke="white"
        strokeWidth="5.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M44.5 21.5h1.8c3.15 0 5.7 2.55 5.7 5.7v9.6c0 3.15-2.55 5.7-5.7 5.7h-1.8"
        stroke="#A7FFF0"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M19.5 42.5h-1.8c-3.15 0-5.7-2.55-5.7-5.7v-9.6c0-3.15 2.55-5.7 5.7-5.7h1.8"
        stroke="#A7FFF0"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <circle cx="21" cy="21.5" r="3.2" fill="#CFFDF5" />
      <circle cx="43" cy="42.5" r="3.2" fill="#CFFDF5" />
      <defs>
        <linearGradient id="zync-mark-bg" x1="8" y1="8" x2="58" y2="58" gradientUnits="userSpaceOnUse">
          <stop stopColor="#093047" />
          <stop offset="0.52" stopColor="#0E7C73" />
          <stop offset="1" stopColor="#1ED8B5" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function ZyncLogo({ variant = 'full', size = 'md', className }: ZyncLogoProps) {
  const sizing = sizeMap[size];

  return (
    <span className={clsx('inline-flex items-center', sizing.gap, className)}>
      <ZyncMark className={clsx('shrink-0 drop-shadow-[0_12px_24px_rgba(15,118,110,0.22)]', sizing.mark)} />
      {variant === 'full' ? (
        <span className={clsx('font-ui-brand font-black leading-none tracking-[0.08em] text-[#082F49]', sizing.word)}>
          ZYNC
        </span>
      ) : null}
    </span>
  );
}
