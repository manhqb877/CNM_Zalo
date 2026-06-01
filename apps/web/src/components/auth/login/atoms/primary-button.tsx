import { ButtonSpinner } from '@/components/shared/loading-system';

interface PrimaryButtonProps {
  isSubmitting: boolean;
  label: string;
}

export function PrimaryButton({ isSubmitting, label }: PrimaryButtonProps) {
  return (
    <button
      type="submit"
      disabled={isSubmitting}
      className="zync-soft-button inline-flex min-h-12 w-full items-center justify-center gap-2 px-6 text-base font-black disabled:cursor-not-allowed disabled:opacity-70"
    >
      {isSubmitting ? <ButtonSpinner size="sm" tone="light" /> : null}
      {isSubmitting ? 'Đang xử lý...' : label}
    </button>
  );
}
