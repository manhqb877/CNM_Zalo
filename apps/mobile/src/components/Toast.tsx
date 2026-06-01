import React, { createContext, useContext, useState, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppPreferencesStore } from '../store/useAppPreferencesStore';
import { getAppTheme } from '../theme/get-app-theme';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastOptions {
  message: string;
  type?: ToastType;
  duration?: number;
}

interface ToastContextData {
  show: (options: ToastOptions | string) => void;
  hide: () => void;
}

const ToastContext = createContext<ToastContextData>({
  show: () => {},
  hide: () => {},
});

export const useToast = () => useContext(ToastContext);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const mode = useAppPreferencesStore((s) => s.theme);
  const theme = getAppTheme(mode);
  const [toast, setToast] = useState<ToastOptions | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-20)).current;
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const show = (options: ToastOptions | string) => {
    const opts = typeof options === 'string' ? { message: options } : options;
    setToast(opts);

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
      }),
    ]).start();

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      hide();
    }, opts.duration || 3000);
  };

  const hide = () => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: -20,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setToast(null);
    });
  };

  const getBackgroundColor = (type?: ToastType) => {
    switch (type) {
      case 'success': return theme.accent;
      case 'error': return theme.danger;
      case 'warning': return theme.warning;
      case 'info':
      default: return theme.bgCard;
    }
  };

  const getTextColor = (type?: ToastType) => {
    if (type === 'info' || !type) return theme.textPrimary;
    return theme.textOnAccent;
  };

  return (
    <ToastContext.Provider value={{ show, hide }}>
      {children}
      {toast && (
        <SafeAreaView style={styles.container} pointerEvents="none">
          <Animated.View
            style={[
              styles.toast,
              {
                opacity,
                transform: [{ translateY }],
                backgroundColor: getBackgroundColor(toast.type),
              },
            ]}
          >
            <Text style={[styles.text, { color: getTextColor(toast.type) }]}>
              {toast.message}
            </Text>
          </Animated.View>
        </SafeAreaView>
      )}
    </ToastContext.Provider>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 20,
    left: 0,
    right: 0,
    zIndex: 9999,
    alignItems: 'center',
  },
  toast: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
    maxWidth: '90%',
  },
  text: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
});
