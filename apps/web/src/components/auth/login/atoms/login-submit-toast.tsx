'use client';

import { useEffect, useRef } from 'react';
import { showSystemToast } from '@/components/notifications/InAppNotificationToasts';

type ToastVariant = 'info' | 'success' | 'error';

interface LoginSubmitToastProps {
  message: string | null;
  variant?: ToastVariant;
  onDismiss: () => void;
  duration?: number;
}

export function LoginSubmitToast({ message, variant = 'info', onDismiss, duration = 4000 }: LoginSubmitToastProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!message) return;

    showSystemToast({
      id: 'login-submit',
      type: 'community_post',
      title: variant === 'success' ? 'Thành công' : variant === 'error' ? 'Không thể thực hiện' : 'Thông báo',
      body: message,
      variant,
      durationMs: duration,
      actions: [
        {
          label: 'Đóng',
          variant: 'secondary',
          onClick: onDismiss,
        },
      ],
    });

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(onDismiss, duration);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [message, variant, duration, onDismiss]);

  return null;
}
