interface SocialButtonProps {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d="M21.6 12.23C21.6 11.51 21.53 10.82 21.41 10.16H12V13.96H17.38C17.15 15.18 16.45 16.21 15.41 16.91V19.36H18.57C20.42 17.66 21.6 15.16 21.6 12.23Z" fill="#34A853"/>
      <path d="M12 22C14.7 22 16.96 21.11 18.57 19.36L15.41 16.91C14.53 17.5 13.41 17.85 12 17.85C9.4 17.85 7.2 16.09 6.42 13.72H3.17V16.25C4.77 19.43 8.06 22 12 22Z" fill="#4285F4"/>
      <path d="M6.42 13.72C6.22 13.13 6.1 12.5 6.1 11.85C6.1 11.2 6.22 10.57 6.42 9.98V7.45H3.17C2.41 8.96 2 10.66 2 11.85C2 13.04 2.41 14.74 3.17 16.25L6.42 13.72Z" fill="#FBBC05"/>
      <path d="M12 5.84C13.54 5.84 14.92 6.37 16.01 7.41L18.64 4.78C16.96 3.21 14.7 2.25 12 2.25C8.06 2.25 4.77 4.82 3.17 7.45L6.42 9.98C7.2 7.61 9.4 5.84 12 5.84Z" fill="#EA4335"/>
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d="M16.72 12.85C16.74 14.78 18.41 15.41 18.43 15.42C18.42 15.47 18.16 16.36 17.53 17.28C16.99 18.07 16.43 18.85 15.54 18.86C14.67 18.88 14.39 18.35 13.39 18.35C12.39 18.35 12.08 18.85 11.26 18.88C10.4 18.91 9.75 18.01 9.2 17.22C8.09 15.62 7.24 12.7 8.38 10.73C8.95 9.75 9.97 9.13 11.08 9.11C11.92 9.09 12.71 9.67 13.22 9.67C13.73 9.67 14.68 8.98 15.69 9.08C16.11 9.1 17.31 9.25 18.06 10.34C18 10.38 16.7 11.14 16.72 12.85ZM15.02 7.97C15.48 7.42 15.78 6.66 15.69 5.9C15.03 5.93 14.22 6.34 13.75 6.9C13.33 7.39 12.95 8.17 13.06 8.91C13.8 8.97 14.56 8.52 15.02 7.97Z"/>
    </svg>
  );
}

export function SocialButton({ label, onClick, disabled = false }: SocialButtonProps) {
  const Icon = label === 'Google' ? GoogleIcon : AppleIcon;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-card)] border border-border-soft bg-[var(--surface)] px-3 text-sm font-black text-text-primary shadow-sm transition hover:-translate-y-0.5 hover:border-border-strong hover:text-accent disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
    >
      <span className="text-text-secondary">
        <Icon />
      </span>
      <span>{label}</span>
    </button>
  );
}
