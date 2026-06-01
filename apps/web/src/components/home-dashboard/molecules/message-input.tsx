'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { generateUploadSignature, verifyUpload } from '@/services/chat';
import type { Message, MessageType } from '@zync/shared-types';
import { StickerPicker } from './sticker-picker';
import { ButtonSpinner } from '@/components/shared/loading-system';

function PaperclipIcon({ className }: { className: string }) {
  return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>;
}

function ImageIcon({ className }: { className: string }) {
  return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><rect x={3} y={3} width={18} height={18} rx={2} /><circle cx={8.5} cy={8.5} r={1.5} /><path d="M3 15l6-6.5 4 4.5 8-8" /></svg>;
}

function SendIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M2 21L23 12 2 3 10 12 2 21Z" />
    </svg>
  );
}

function EmojiIcon({ className }: { className: string }) {
return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="9" cy="10" r="1" fill="currentColor" />
      <circle cx="15" cy="10" r="1" fill="currentColor" />
      <path d="M8.3 14.2c.8 1.2 2 1.8 3.7 1.8s3-.6 3.7-1.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function StickerIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <circle cx="9" cy="9" r="1.5" fill="currentColor" />
      <circle cx="15" cy="9" r="1.5" fill="currentColor" />
      <path d="M8 15c0 1 2 2 4 2s4-1 4-2" />
    </svg>
  );
}

interface UploadedMedia {
  file: File;
  previewUrl: string;
  type: MessageType;
  uploadType: 'image' | 'video' | 'document';
  fileName?: string;
}

interface SendMessageOptions {
  idempotencyKey?: string;
  deferEmit?: boolean;
  replyTo?: Message['replyTo'];
}

interface QueuedMediaSend {
  idempotencyKey: string;
  previewUrl: string;
  content: string;
  type: MessageType;
}

interface MessageInputProps {
  conversationId?: string;
  onSend: (content: string, type: MessageType, mediaUrl?: string, options?: SendMessageOptions) => Promise<string | null | undefined>;
  onCancelPendingMessage?: (idempotencyKey: string) => void;
  onStartTyping: () => void;
  onStopTyping: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  replyingTo?: Message['replyTo'] | null;
  onCancelReply?: () => void;
}

export function MessageInput({
  conversationId,
  onSend,
  onCancelPendingMessage,
  onStartTyping,
  onStopTyping,
  isLoading = false,
  disabled = false,
  replyingTo,
  onCancelReply,
}: MessageInputProps) {
  const [input, setInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedMedia, setUploadedMedia] = useState<UploadedMedia | null>(null);
  const [queuedMediaSend, setQueuedMediaSend] = useState<QueuedMediaSend | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const stickerButtonRef = useRef<HTMLButtonElement>(null);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const typingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const uploadedMediaRef = useRef<UploadedMedia | null>(null);
  const queuedMediaSendRef = useRef<QueuedMediaSend | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const QUICK_EMOJIS = ['😀', '😂', '😍', '👍', '❤️', '🔥', '👏', '🎉'];

  useEffect(() => {
    uploadedMediaRef.current = uploadedMedia;
  }, [uploadedMedia]);

  useEffect(() => {
    queuedMediaSendRef.current = queuedMediaSend;
  }, [queuedMediaSend]);

  useEffect(() => {
    return () => {
      const latestUploaded = uploadedMediaRef.current;
      const latestQueued = queuedMediaSendRef.current;

      if (latestUploaded?.previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(latestUploaded.previewUrl);
      }

      if (
        latestQueued?.previewUrl.startsWith('blob:')
        && latestQueued.previewUrl !== latestUploaded?.previewUrl
      ) {
        URL.revokeObjectURL(latestQueued.previewUrl);
      }
    };
  }, []);

  const resetTypingState = useCallback(() => {
    onStopTyping();

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }

    if (typingIntervalRef.current) {
      clearInterval(typingIntervalRef.current);
      typingIntervalRef.current = null;
    }
  }, [onStopTyping]);

  const finalizeQueuedMediaSend = useCallback(async (pending: QueuedMediaSend, remoteUrl: string) => {
    try {
      await onSend(pending.content, pending.type, remoteUrl, {
        idempotencyKey: pending.idempotencyKey,
        replyTo: replyingTo ?? undefined,
      });
      onCancelReply?.();
    } catch (error) {
      onCancelPendingMessage?.(pending.idempotencyKey);
      console.error('Finalize media message failed:', error);
    } finally {
      if (pending.previewUrl.startsWith('blob:')) {
        setTimeout(() => URL.revokeObjectURL(pending.previewUrl), 1200);
      }

      setQueuedMediaSend(null);
      setUploadedMedia(null);
      setIsSending(false);
      setUploading(false);
      setUploadProgress(0);

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [onCancelPendingMessage, onCancelReply, onSend, replyingTo]);

  const uploadMediaToCloudinary = useCallback(async (media: UploadedMedia): Promise<string> => {
    const signatureData = await generateUploadSignature(media.uploadType);

    const formData = new FormData();
    formData.append('file', media.file);
    formData.append('api_key', signatureData.apiKey);
    formData.append('signature', signatureData.signature);
    formData.append('timestamp', signatureData.timestamp.toString());
    formData.append('folder', signatureData.folder);

    const uploadedData = await new Promise<{ public_id: string; secure_url: string }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(
        'POST',
        `https://api.cloudinary.com/v1_1/${signatureData.cloudName}/${media.uploadType === 'document' ? 'raw' : media.uploadType}/upload`,
      );

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) {
          return;
        }

        const percent = Math.round((event.loaded / event.total) * 100);
        setUploadProgress(percent);
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText) as { public_id: string; secure_url: string });
          } catch {
            reject(new Error('Cloudinary upload failed: invalid response'));
          }
          return;
        }

        try {
          const failed = JSON.parse(xhr.responseText) as { error?: { message?: string } };
          reject(new Error(`Cloudinary upload failed: ${failed.error?.message ?? xhr.status}`));
        } catch {
          reject(new Error(`Cloudinary upload failed: ${xhr.status}`));
        }
      };

      xhr.onerror = () => {
        reject(new Error('Cloudinary upload failed: network error'));
      };

      xhr.send(formData);
    });

    const verifyResult = await verifyUpload(uploadedData.public_id, media.uploadType);
    setUploadProgress(100);
    return verifyResult.secureUrl;
  }, []);

  const handleInputChange = (value: string) => {
    setInput(value);

    if (value.length > 0) {
      if (!typingIntervalRef.current) {
        onStartTyping();

        typingIntervalRef.current = setInterval(() => {
          onStartTyping();
        }, 2000);
      }

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      typingTimeoutRef.current = setTimeout(() => {
        onStopTyping();
        if (typingIntervalRef.current) {
          clearInterval(typingIntervalRef.current);
          typingIntervalRef.current = null;
        }
      }, 3000);
    } else {
      onStopTyping();
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      if (typingIntervalRef.current) {
        clearInterval(typingIntervalRef.current);
        typingIntervalRef.current = null;
      }
    }
  };

  useEffect(() => {
    if (!conversationId || typeof window === 'undefined') return;

    const storageKey = `zync.chatDraft.${conversationId}`;
    const applyDraft = (draft: string | null) => {
      const value = draft?.trim();
      if (!value) return;
      handleInputChange(value);
      window.sessionStorage.removeItem(storageKey);
      requestAnimationFrame(() => textareaRef.current?.focus());
    };

    applyDraft(window.sessionStorage.getItem(storageKey));

    const handleDraftEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ conversationId?: string; draft?: string }>).detail;
      if (detail?.conversationId !== conversationId) return;
      applyDraft(detail.draft ?? null);
    };

    window.addEventListener('zync:chat-draft', handleDraftEvent);
    return () => window.removeEventListener('zync:chat-draft', handleDraftEvent);
  }, [conversationId]);

  const handleSend = async () => {
    if ((input.trim() || uploadedMedia) && !isLoading && !disabled && !isSending) {
      const messageContent = input.trim();

      if (uploadedMedia) {
        if (queuedMediaSendRef.current) {
          return;
        }

        setIsSending(true);
        const pendingId = await onSend(messageContent, uploadedMedia.type, uploadedMedia.previewUrl, {
          deferEmit: true,
          replyTo: replyingTo ?? undefined,
        });

        if (!pendingId) {
          setIsSending(false);
          return;
        }

        const pendingMessage: QueuedMediaSend = {
          idempotencyKey: pendingId,
          previewUrl: uploadedMedia.previewUrl,
          content: messageContent,
          type: uploadedMedia.type,
        };

        setQueuedMediaSend(pendingMessage);
        setInput('');
        resetTypingState();

        setUploading(true);
        setUploadProgress(0);

        try {
          const remoteUrl = await uploadMediaToCloudinary(uploadedMedia);
          await finalizeQueuedMediaSend(pendingMessage, remoteUrl);
        } catch (error) {
          onCancelPendingMessage?.(pendingMessage.idempotencyKey);
          if (pendingMessage.previewUrl.startsWith('blob:')) {
            URL.revokeObjectURL(pendingMessage.previewUrl);
          }
          setQueuedMediaSend(null);
          setUploadedMedia(null);
          setIsSending(false);
          setUploading(false);
          setUploadProgress(0);
          console.error('File upload failed:', error);
          alert(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        return;
      }

      setIsSending(true);
      await onSend(messageContent, 'text', undefined, { replyTo: replyingTo ?? undefined });
      setInput('');
      resetTypingState();
      onCancelReply?.();

      setTimeout(() => setIsSending(false), 500);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleUploadFile = async (file: File) => {
    const messageType: MessageType = file.type.startsWith('image/')
      ? 'image'
      : file.type.startsWith('video/')
        ? 'video'
        : `file/${file.name}`;
    const previewUrl = URL.createObjectURL(file);

    setUploadedMedia((prev) => {
      if (prev?.previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(prev.previewUrl);
      }

      return {
        file,
        previewUrl,
        type: messageType,
        uploadType: file.type.startsWith('image/')
          ? 'image'
          : file.type.startsWith('video/')
            ? 'video'
            : 'document',
        fileName: file.name,
      };
    });

    setUploading(false);
    setUploadProgress(0);
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file' && items[i].type.startsWith('image/')) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (file) {
          await handleUploadFile(file);
        }
        break;
      }
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    await handleUploadFile(file);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const canSendMedia = Boolean(uploadedMedia);
  const isButtonDisabled = (!input.trim() && !canSendMedia) || disabled || isLoading || isSending;

  const handleSendEmoji = (emoji: string) => {
    if (disabled || isLoading || isSending) {
      return;
    }

    void onSend(emoji, 'sticker', undefined, { replyTo: replyingTo ?? undefined });
    setIsEmojiPickerOpen(false);
    onCancelReply?.();
  };

  const handleSendSticker = async (mediaUrl: string) => {
    if (disabled || isLoading || isSending) {
      return;
    }

    try {
      setIsSending(true);
      await onSend('', 'sticker', mediaUrl, { replyTo: replyingTo ?? undefined });
      setShowStickerPicker(false);
      onCancelReply?.();
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="chat-input-container">
      {/* Reply Banner */}
      {replyingTo && (
        <div className="chat-reply-banner">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-accent-light">
              <svg className="h-3 w-3 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 17 4 12 9 7"/>
                <path d="M20 18v-2a4 4 0 0 0-4-4H4"/>
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">Đang trả lời</p>
              <p className="truncate text-[13px] text-text-secondary">{replyingTo.contentPreview || '[Tin nhắn]'}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            className="chat-reply-banner-cancel"
            title="Hủy trả lời"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      )}

      {/* Emoji Picker */}
      {isEmojiPickerOpen && (
        <div className="chat-quick-emoji-bar">
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => handleSendEmoji(emoji)}
              className="chat-input-action-btn w-10 h-10 text-xl hover:bg-bg-hover hover:text-accent"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {showStickerPicker && (
        <StickerPicker
          isOpen={showStickerPicker}
          onClose={() => setShowStickerPicker(false)}
          onSelectSticker={handleSendSticker}
          triggerRef={stickerButtonRef}
        />
      )}

      {/* Input Bar */}
      <div className="chat-input-bar">
        {/* Action Icons */}
        <div className="chat-input-actions">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || isLoading}
            className="chat-input-action-btn"
            title="Đính kèm tệp"
          >
            <PaperclipIcon className="w-5 h-5" />
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || isLoading}
            className="chat-input-action-btn"
            title="Gửi hình ảnh"
          >
            <ImageIcon className="w-5 h-5" />
          </button>

          <button
            onClick={() => setIsEmojiPickerOpen((prev) => !prev)}
            disabled={disabled || isLoading}
            className={`chat-input-action-btn ${isEmojiPickerOpen ? 'active' : ''}`}
            title="Biểu tượng cảm xúc"
          >
            <EmojiIcon className="w-5 h-5" />
          </button>

          <button
            ref={stickerButtonRef}
            onClick={() => setShowStickerPicker(true)}
            disabled={disabled || isLoading || isSending}
            className="chat-input-action-btn"
            title="Sticker"
          >
            <StickerIcon className="w-5 h-5" />
          </button>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden"
            accept="image/*,video/*,.pdf,.doc,.docx"
          />
        </div>

        {/* Input Field */}
        <div className="chat-input-field-wrapper">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Nhập tin nhắn..."
            disabled={disabled || isLoading}
            rows={1}
            className="chat-input-field"
          />
        </div>

        {/* Send Button */}
        <button
          onClick={() => {
            void handleSend();
          }}
          disabled={isButtonDisabled}
          className="chat-send-button"
        >
          <SendIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Media Preview */}
      {uploadedMedia && !queuedMediaSend && (
        <div className="mt-2 mx-3 relative inline-block">
          {uploadedMedia.type === 'image' ? (
            <img
              src={uploadedMedia.previewUrl}
              alt="Preview"
              className={`max-w-[200px] rounded-xl shadow-sm ${uploading ? 'opacity-50' : ''}`}
            />
          ) : uploadedMedia.type === 'video' ? (
            <video
              src={uploadedMedia.previewUrl}
              controls={!uploading}
              className={`max-w-[200px] rounded-xl shadow-sm ${uploading ? 'opacity-50' : ''}`}
            />
          ) : (
            <div className={`inline-flex max-w-xs items-center gap-2 rounded-2xl border border-border-light bg-surface-muted px-4 py-2.5 text-sm text-text-primary shadow-sm ${uploading ? 'opacity-50' : ''}`}>
              <svg className="h-5 w-5 text-accent flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              <span className="truncate">{uploadedMedia.fileName || 'Tep dinh kem'}</span>
            </div>
          )}

          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/20 backdrop-blur-[2px]">
              <ButtonSpinner size="md" tone="light" className="shadow-lg" />
            </div>
          )}

          <button
            onClick={() => {
              if (queuedMediaSendRef.current) {
                return;
              }
              if (uploadedMedia.previewUrl.startsWith('blob:')) {
                URL.revokeObjectURL(uploadedMedia.previewUrl);
              }
              setUploadedMedia(null);
            }}
            disabled={Boolean(queuedMediaSend)}
            className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--text-tertiary)] text-[var(--bg-primary)] shadow-md transition-all hover:bg-[var(--text-secondary)] hover:scale-110 disabled:opacity-50"
            title="Xóa tệp"
          >
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      )}

      {uploadedMedia && queuedMediaSend && uploading && (
        <p className="mt-2 mx-3 flex items-center gap-2 text-xs text-[#929292]">
          <ButtonSpinner size="xs" tone="muted" />
          Đang tải media...
        </p>
      )}
    </div>
  );
}
