'use client';

import Image from 'next/image';
import { useEffect } from 'react';

function CloseIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function ExternalLinkIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

interface MediaViewerProps {
  open: boolean;
  mediaUrl: string;
  type: 'image' | 'video';
  senderAvatar?: string;
  senderDisplayName?: string;
  createdAt?: string;
  onClose: () => void;
}

export function MediaViewer({
  open,
  mediaUrl,
  type,
  senderAvatar,
  senderDisplayName,
  createdAt,
  onClose,
}: MediaViewerProps) {
  // Đóng modal khi nhấn Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onClose();
      }
    };

    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const hasImageAvatar = Boolean(senderAvatar && /^(https?:\/\/|\/)/.test(senderAvatar));
  const avatarLabel = senderAvatar && !hasImageAvatar
    ? senderAvatar.slice(0, 2).toUpperCase()
    : (senderDisplayName || 'U').slice(0, 2).toUpperCase();

  const displayTime = createdAt
    ? new Date(createdAt).toLocaleString('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
    : '';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Media Container */}
      <div
        className="relative h-full w-full flex items-center justify-center px-4 py-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left Overlay - Sender Info */}
        <div className="absolute left-5 top-5 z-20 flex items-center gap-3">
          <div className="flex items-center gap-3 rounded-2xl bg-black/40 backdrop-blur-md border border-white/10 px-4 py-3">
            {hasImageAvatar && senderAvatar ? (
              <Image
                src={senderAvatar}
                alt="avatar"
                width={40}
                height={40}
                className="h-10 w-10 rounded-full object-cover flex-shrink-0"
              />
            ) : (
              <div className="h-10 w-10 rounded-full bg-accent text-white text-xs font-semibold flex items-center justify-center flex-shrink-0">
                {avatarLabel}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">{senderDisplayName || 'Unknown'}</p>
              <p className="text-xs text-white/60">{displayTime}</p>
            </div>
          </div>
        </div>

        {/* Right Overlay - Action Buttons */}
        <div className="absolute right-5 top-5 z-20 flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.open(mediaUrl, '_blank')}
            className="inline-flex items-center justify-center h-9 w-9 rounded-lg bg-black/40 backdrop-blur-md border border-white/10 text-white hover:bg-black/60 hover:border-white/20 transition-all"
            title="Mở trong trình duyệt"
          >
            <ExternalLinkIcon className="h-4.5 w-4.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center h-9 w-9 rounded-lg bg-black/40 backdrop-blur-md border border-white/10 text-white hover:bg-black/60 hover:border-white/20 transition-all"
            title="Đóng"
          >
            <CloseIcon className="h-4.5 w-4.5" />
          </button>
        </div>

        {/* Media Content */}
        <div className="relative max-h-[90vh] w-auto">
          {type === 'image' ? (
            <Image
              src={mediaUrl}
              alt="media-viewer"
              width={1920}
              height={1080}
              className="h-auto w-auto max-h-[90vh] object-contain rounded-lg"
              priority
            />
          ) : (
            <video
              src={mediaUrl}
              controls
              className="h-auto w-auto max-h-[90vh] object-contain rounded-lg"
              autoPlay
            />
          )}
        </div>
      </div>
    </div>
  );
}
