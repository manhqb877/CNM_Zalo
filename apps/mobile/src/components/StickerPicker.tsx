import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ScrollView,
  TextInput,
  StyleSheet,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useEffect, useState } from 'react';
import { colors } from '../theme/colors';
import api from '../services/api';

interface ISticker {
  stickerId: string;
  mediaUrl: string;
  alt?: string;
  category?: string;
}

interface IStickerPack {
  _id?: string;
  packId: string;
  packName: string;
  packDescription?: string;
  stickers: ISticker[];
  icon?: string;
  order: number;
  createdAt?: string;
  updatedAt?: string;
}

interface StickerPickerProps {
  isOpen: boolean;
  onSelectSticker: (mediaUrl: string) => void;
}

export function StickerPicker({ isOpen, onSelectSticker }: StickerPickerProps) {
  const [stickerPacks, setStickerPacks] = useState<IStickerPack[]>([]);
  const [selectedPackId, setSelectedPackId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && stickerPacks.length === 0) {
      fetchStickerPacks();
    }
  }, [isOpen, stickerPacks.length]);

  const fetchStickerPacks = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/stickers');
      const data = response.data;

      if (data.success && Array.isArray(data.data)) {
        setStickerPacks(data.data);
        if (data.data.length > 0) {
          setSelectedPackId(data.data[0].packId);
        }
      } else {
        setError('Failed to load sticker packs');
      }
    } catch (err) {
      setError('Failed to load stickers');
      console.error('Failed to fetch sticker packs:', err);
    } finally {
      setLoading(false);
    }
  };

  const selectedPack = stickerPacks.find(p => p.packId === selectedPackId);
  const filteredStickers = selectedPack?.stickers.filter(s =>
    s.alt?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.stickerId.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const handleSelectSticker = (mediaUrl: string) => {
    onSelectSticker(mediaUrl);
  };

  if (!isOpen) {
    return null;
  }

  return (
    <View style={[styles.pickerContainer, { backgroundColor: colors.backgroundMid }]}>
      <View style={styles.searchContainer}>
        <TextInput
          style={[styles.searchInput, { color: colors.text, borderColor: colors.border }]}
          placeholder="Tim kiem sticker..."
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {loading && (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      )}

      {error && (
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {!loading && !error && (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tabsContainer}
            contentContainerStyle={styles.tabsContent}
          >
            {stickerPacks.map((pack) => (
              <TouchableOpacity
                key={pack.packId}
                onPress={() => {
                  setSelectedPackId(pack.packId);
                  setSearchQuery('');
                }}
                style={[
                  styles.tabButton,
                  selectedPackId === pack.packId && styles.tabButtonActive,
                ]}
              >
                {pack.icon ? (
                  <Image
                    source={{ uri: pack.icon }}
                    style={styles.tabIcon}
                  />
                ) : (
                  <Text style={styles.tabLabel}>{pack.packName[0]}</Text>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>

          {filteredStickers.length > 0 ? (
            <FlatList
              data={filteredStickers}
              keyExtractor={(item) => item.stickerId}
              numColumns={4}
              columnWrapperStyle={styles.gridRow}
              scrollEnabled
              style={styles.grid}
              contentContainerStyle={styles.gridContent}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => handleSelectSticker(item.mediaUrl)}
                  style={styles.stickerButton}
                >
                  <Image
                    source={{ uri: item.mediaUrl }}
                    style={styles.stickerImage}
                    resizeMode="contain"
                  />
                </TouchableOpacity>
              )}
            />
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                {searchQuery ? 'Không tìm thấy sticker' : 'Chọn một bộ sticker'}
              </Text>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pickerContainer: {
    marginTop: 8,
    marginHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2d6a58',
    height: 330,
    overflow: 'hidden',
  },
  searchContainer: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2d6a58',
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
    fontSize: 13,
    fontFamily: 'BeVietnamPro_400Regular',
  },
  tabsContainer: {
    maxHeight: 56,
    borderBottomWidth: 1,
    borderBottomColor: '#2d6a58',
  },
  tabsContent: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  tabButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#164336',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabButtonActive: {
    backgroundColor: '#0f7a5e',
    borderWidth: 1,
    borderColor: '#35e1b7',
  },
  tabIcon: {
    width: 24,
    height: 24,
    borderRadius: 4,
  },
  tabLabel: {
    fontSize: 12,
    fontFamily: 'BeVietnamPro_600SemiBold',
    color: '#dffcf2',
  },
  grid: {
    flex: 1,
    minHeight: 210,
  },
  gridContent: {
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 12,
  },
  gridRow: {
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  stickerButton: {
    width: '23%',
    aspectRatio: 1,
    borderRadius: 10,
    backgroundColor: '#0d2c24',
    borderWidth: 1,
    borderColor: 'rgba(45, 122, 102, 0.55)',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stickerImage: {
    width: '100%',
    height: '100%',
  },
  centerContainer: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    minHeight: 210,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: 'BeVietnamPro_400Regular',
  },
  errorText: {
    color: '#f87171',
    fontSize: 12,
    fontFamily: 'BeVietnamPro_500Medium',
  },
});
