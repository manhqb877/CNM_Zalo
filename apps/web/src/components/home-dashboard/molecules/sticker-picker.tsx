'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import type { IStickerPack, ISticker } from '@zync/shared-types';

interface StickerPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSticker: (mediaUrl: string) => void;
  triggerRef?: React.RefObject<HTMLButtonElement>;
}

export function StickerPicker({ isOpen, onClose, onSelectSticker, triggerRef }: StickerPickerProps) {
  const [stickerPacks, setStickerPacks] = useState<(IStickerPack & { stickers: ISticker[] })[]>([]);
  const [selectedPackId, setSelectedPackId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState({ bottom: 0, left: 0 });
  const pickerRef = useRef<HTMLDivElement>(null);

  // Fetch sticker packs when picker opens
  useEffect(() => {
    if (isOpen && stickerPacks.length === 0) {
      fetchStickerPacks();
    }
  }, [isOpen, stickerPacks.length]);

  // Calculate position based on trigger button
  useEffect(() => {
    if (isOpen && triggerRef?.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({
        bottom: 180, // Position just above the button (picker height ~400px + 10px gap)
        left: rect.left - 200, // Center horizontally
      });
    }
  }, [isOpen, triggerRef]);

  const fetchStickerPacks = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/stickers');
      const data = await response.json();

      if (data.success && Array.isArray(data.data)) {
        setStickerPacks(data.data);
        if (data.data.length > 0) {
          setSelectedPackId(data.data[0].packId);
        }
      } else {
        setError('Failed to load sticker packs');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load stickers';
      console.error('Failed to fetch sticker packs:', err);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  const selectedPack = stickerPacks.find(p => p.packId === selectedPackId);
  const filteredStickers = (selectedPack?.stickers || []).filter(s =>
    s.alt?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.stickerId.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div 
      ref={pickerRef} 
      className="sticker-picker-container fixed z-[9999] rounded-2xl shadow-2xl border w-80 max-h-96 flex flex-col overflow-hidden"
      style={{
        bottom: `${position.bottom}px`,
        left: `${position.left}px`,
      }}
    >
      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center h-40 sticker-picker-text text-sm">
          Đang tải...
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="flex items-center justify-center h-40 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Content */}
      {!loading && !error && (
        <>
          {/* Pack Tabs */}
          <div className="flex gap-2 px-3 py-2 overflow-x-auto border-b border-current scrollbar-hide">
            {stickerPacks.map(pack => (
              <button
                key={pack.packId}
                onClick={() => {
                  setSelectedPackId(pack.packId);
                  setSearchQuery('');
                }}
                className={`flex-shrink-0 p-1.5 rounded-lg transition-all ${
                  selectedPackId === pack.packId
                    ? 'sticker-picker-tab-active'
                    : 'sticker-picker-tab hover:opacity-80'
                }`}
                title={pack.packName}
              >
                {pack.icon ? (
                  <div className="relative w-6 h-6">
                    <Image
                      src={pack.icon}
                      alt={pack.packName}
                      fill
                      className="rounded object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-6 h-6 flex items-center justify-center text-xs font-semibold sticker-picker-text">
                    {pack.packName[0]}
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Search Bar */}
          <div className="px-3 py-2 border-b border-current">
            <input
              type="text"
              placeholder="Tìm..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="sticker-picker-search w-full px-3 py-1.5 border rounded-lg text-xs focus:outline-none focus:ring-2"
            />
          </div>

          {/* Sticker Grid */}
          <div className="flex-1 overflow-y-auto p-3">
            {filteredStickers.length > 0 ? (
              <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(4, minmax(60px, 1fr))' }}>
                {filteredStickers.map(sticker => (
                  <button
                    key={sticker.stickerId}
                    onClick={() => {
                      onSelectSticker(sticker.mediaUrl);
                      onClose();
                    }}
                    className="relative hover:scale-110 transition-transform duration-200 h-[60px] w-[60px]"
                    title={sticker.alt || sticker.stickerId}
                  >
                    <div className="sticker-picker-tab relative w-full h-full rounded-lg overflow-hidden border hover:opacity-80 transition-opacity">
                      <Image
                        src={sticker.mediaUrl}
                        alt={sticker.alt || sticker.stickerId}
                        fill
                        className="object-cover transition-transform"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-16 sticker-picker-text text-xs">
                {searchQuery ? 'Không tìm thấy' : 'Chọn pack'}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
