interface FriendsAvatarProps {
  name: string;
  avatarUrl?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function FriendsAvatar({ name, avatarUrl, size = 'md' }: FriendsAvatarProps) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  const sizeClasses = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-11 w-11 text-sm',
    lg: 'h-14 w-14 text-base',
  };

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={`${sizeClasses[size]} rounded-full border border-border object-cover shadow-sm`}
      />
    );
  }

  return (
    <span className={`${sizeClasses[size]} font-ui-title inline-flex items-center justify-center rounded-full border border-border bg-[var(--accent-light)] text-[var(--accent-strong)] shadow-sm`}>
      {initials || 'U'}
    </span>
  );
}
