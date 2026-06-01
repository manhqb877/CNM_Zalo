'use client';

import { showSystemToast } from '@/components/notifications/InAppNotificationToasts';

export const Toaster = () => null;

export const toast = {
  success: (message: string) => showSystemToast({ id: 'system-success', title: 'Thành công', body: message, variant: 'success' }),
  error: (message: string) => showSystemToast({ id: 'system-error', title: 'Không thể thực hiện', body: message, variant: 'error' }),
  info: (message: string) => showSystemToast({ id: 'system-info', title: 'Thông báo', body: message, variant: 'info' }),
  warning: (message: string) => showSystemToast({ id: 'system-warning', title: 'Lưu ý', body: message, variant: 'warning' }),
  dismiss: () => undefined,
};
