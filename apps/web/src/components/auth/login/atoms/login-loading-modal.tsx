'use client';

import { LoadingOverlay } from '@/components/shared/loading-system';

interface LoginLoadingModalProps {
  open: boolean;
  message?: string;
}

export function LoginLoadingModal({ open, message = 'Đang xử lý...' }: LoginLoadingModalProps) {
  return <LoadingOverlay open={open} message={message} />;
}
