import React from 'react';
import { View, TextInput, StyleSheet, StyleProp, ViewStyle, TouchableOpacity } from 'react-native';
import { Search, X } from 'lucide-react-native';
import { lightTheme } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { radius } from '../theme/spacing';

interface AppSearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  style?: StyleProp<ViewStyle>;
  onClear?: () => void;
}

export function AppSearchBar({ 
  value, 
  onChangeText, 
  placeholder = 'Tìm kiếm...', 
  style,
  onClear
}: AppSearchBarProps) {
  const handleClear = () => {
    onChangeText('');
    if (onClear) onClear();
  };

  return (
    <View style={[styles.container, style]}>
      <Search size={18} color={lightTheme.textTertiary} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={lightTheme.textTertiary}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {value.length > 0 && (
        <TouchableOpacity onPress={handleClear} style={styles.clearBtn}>
          <X size={16} color={lightTheme.textTertiary} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: lightTheme.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: lightTheme.border,
    paddingHorizontal: 16,
    height: 46,
  },
  input: {
    flex: 1,
    marginLeft: 10,
    fontSize: 15,
    fontFamily: fonts.regular,
    color: lightTheme.textPrimary,
  },
  clearBtn: {
    padding: 4,
  },
});
