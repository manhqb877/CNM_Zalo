import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { fonts } from '../theme/fonts';
import { mobileColors, mobileRadius, mobileShadow, mobileSpacing } from '../theme/tokens';

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  cancelLabel?: string;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDialog({
  visible,
  title,
  message,
  cancelLabel = 'Hủy',
  confirmLabel = 'Xác nhận',
  danger = false,
  loading = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.root}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onCancel} />
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={onCancel} disabled={loading}>
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, danger ? styles.dangerButton : styles.confirmButton, loading && styles.disabled]}
              onPress={onConfirm}
              disabled={loading}
            >
              <Text style={[styles.confirmText, danger && styles.dangerText]}>
                {loading ? 'Đang xử lý...' : confirmLabel}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.32)',
  },
  card: {
    width: '100%',
    borderRadius: mobileRadius.radiusCard,
    borderWidth: 1,
    borderColor: mobileColors.border,
    backgroundColor: mobileColors.surface,
    padding: mobileSpacing.cardPadding,
    ...mobileShadow.shadowFloating,
  },
  title: {
    color: mobileColors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: 18,
  },
  message: {
    color: mobileColors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 18,
  },
  button: {
    minHeight: 42,
    minWidth: 104,
    borderRadius: mobileRadius.radiusPill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  cancelButton: {
    backgroundColor: mobileColors.surfaceSoft,
  },
  confirmButton: {
    backgroundColor: mobileColors.accent,
  },
  dangerButton: {
    backgroundColor: mobileColors.dangerSoft,
    borderWidth: 1,
    borderColor: mobileColors.dangerBorder,
  },
  disabled: {
    opacity: 0.72,
  },
  cancelText: {
    color: mobileColors.textPrimary,
    fontFamily: fonts.semiBold,
    fontSize: 14,
  },
  confirmText: {
    color: mobileColors.textOnAccent,
    fontFamily: fonts.bold,
    fontSize: 14,
  },
  dangerText: {
    color: mobileColors.danger,
  },
});
