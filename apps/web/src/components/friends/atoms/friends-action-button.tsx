interface FriendsActionButtonProps {
  label: string;
  variant?: 'primary' | 'danger' | 'neutral';
  onClick: () => void;
  disabled?: boolean;
}

export function FriendsActionButton({
  label,
  variant = 'neutral',
  onClick,
  disabled,
}: FriendsActionButtonProps) {
  const classes =
    variant === 'primary'
      ? 'zync-soft-button'
      : variant === 'danger'
        ? 'zync-soft-button-danger'
        : 'zync-soft-button-secondary';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`h-9 px-3 text-xs ${classes}`}
    >
      {label}
    </button>
  );
}
