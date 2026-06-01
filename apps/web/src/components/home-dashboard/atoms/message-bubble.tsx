'use client';

import Image from 'next/image';
import { useState } from 'react';
import type { MessageStatus, MessageReplyTo, MessageReadParticipantWithTime } from '@zync/shared-types';
import { useMediaViewer } from '@/context/media-viewer-context';
import { GetFileIcon } from './file-type-icons';
import { ButtonSpinner } from '@/components/shared/loading-system';

function ReplyIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 17 4 12 9 7" />
      <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
    </svg>
  );
}

function SentIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function DeliveredIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
      <polyline points="20 12 9 23 4 18" />
    </svg>
  );
}

function LikeIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function MoreIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <circle cx="12" cy="5" r="1" fill="currentColor" />
      <circle cx="12" cy="19" r="1" fill="currentColor" />
    </svg>
  );
}

interface ReactionSummary {
  emojiCounts: Record<string, number>;
  totalCount: number;
}

interface MessageBubbleProps {
  isOwn: boolean;
  content: string;
  type: string;
  mediaUrl?: string;
  replyTo?: MessageReplyTo;
  onJumpToMessage?: (messageRef: string) => void;
  status?: MessageStatus;
  readByPreview?: MessageReadParticipantWithTime[];
  readByCount?: number;
  onReadPreviewPress?: () => void;
  timestamp: string;
  senderAvatar?: string;
  senderDisplayName?: string;
  showSenderInfo?: boolean;
  reactionSummary?: ReactionSummary;
  userReaction?: string | null;
  onReactionClick: () => void;
  isFirstInGroup?: boolean;
  isConsecutive?: boolean;
  seenByAvatar?: string;
  seenByAvatarUrl?: string;
  onImageLike?: () => void;
  onImageOptions?: () => void;
}

export function MessageBubble({
  isOwn,
  content,
  type,
  mediaUrl,
  replyTo,
  onJumpToMessage,
  status,
  readByPreview = [],
  readByCount = 0,
  onReadPreviewPress,
  timestamp,
  senderAvatar,
  senderDisplayName,
  showSenderInfo = true,
  reactionSummary,
  userReaction,
  onReactionClick,
  isFirstInGroup = true,
  isConsecutive = false,
  seenByAvatar,
  seenByAvatarUrl,
  onImageLike,
  onImageOptions,
}: MessageBubbleProps) {
  const [imageHovered, setImageHovered] = useState(false);
  const { openViewer } = useMediaViewer();
  const isPendingLocalMedia = Boolean(mediaUrl?.startsWith('blob:'));

  const timeStr = new Date(timestamp).toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const hasImageAvatar = Boolean(senderAvatar && /^(https?:\/\/|\/)/.test(senderAvatar));
  const avatarLabel = senderAvatar && !hasImageAvatar
    ? senderAvatar.slice(0, 2).toUpperCase()
    : (senderDisplayName || 'U').slice(0, 2).toUpperCase();

  const hasReactions = reactionSummary && reactionSummary.totalCount > 0;
  const previewReaders = Array.isArray(readByPreview) ? readByPreview : [];
  const visibleReadCount = readByCount > 0 ? readByCount : previewReaders.length;
  const hasReadPreview = isOwn && type !== 'system-recall' && status === 'read' && previewReaders.length > 0;

  const bubbleClass = isOwn ? 'chat-bubble-own' : 'chat-bubble-other';
  const bubbleModifiers = isFirstInGroup ? 'bubble-first' : 'bubble-consecutive';

  const showSeenIndicator = isOwn && status === 'read' && seenByAvatarUrl;

  return (
    <div className={`chat-message-row ${isOwn ? 'own' : 'other'}`}>
      {/* Avatar Column */}
      <div className={`chat-avatar-column ${!showSenderInfo || !isFirstInGroup ? 'hidden' : ''}`}>
        {showSenderInfo && isFirstInGroup && !isOwn && (
          hasImageAvatar && senderAvatar ? (
            <Image
              src={senderAvatar}
              alt="avatar"
              width={36}
              height={36}
              className="chat-avatar"
            />
          ) : (
            <div className="chat-avatar-placeholder">
              {avatarLabel}
            </div>
          )
        )}
      </div>

      {/* Message Content Column */}
      <div className={`chat-message-content ${isOwn ? 'own' : 'other'}`}>
        {/* Sender Name */}
        {!isOwn && showSenderInfo && isFirstInGroup && senderDisplayName && (
          <span className="chat-sender-name">{senderDisplayName}</span>
        )}

        {/* Bubble Wrapper with Relative Positioning */}
        <div className="chat-bubble-wrapper">
          {/* Reply Quote */}
          {replyTo?.messageRef && (
            <button
              type="button"
              onClick={() => onJumpToMessage?.(replyTo.messageRef)}
              className="chat-reply-quote max-w-[240px] text-left block"
              title="Đi đến tin nhắn gốc"
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                <ReplyIcon className="w-3 h-3 text-accent flex-shrink-0" />
                <span className="text-[10px] uppercase tracking-wide font-semibold text-accent">
                  Trả lời
                </span>
              </div>
              {replyTo.senderDisplayName && (
                <p className="chat-reply-sender">{replyTo.senderDisplayName}</p>
              )}
              <p className="chat-reply-preview">{replyTo.contentPreview || '[Tin nhắn]'}</p>
            </button>
          )}

          {/* Image Message */}
          {mediaUrl && type === 'image' && (
            <div
              className="chat-image-wrapper cursor-pointer"
              onMouseEnter={() => setImageHovered(true)}
              onMouseLeave={() => setImageHovered(false)}
              onClick={() => openViewer({ mediaUrl, type: 'image', senderAvatar, senderDisplayName, createdAt: timestamp })}
            >
              {isPendingLocalMedia ? (
                <img
                  src={mediaUrl}
                  alt="message-image"
                  className="max-w-[240px] max-h-[320px] object-cover rounded-xl"
                />
              ) : (
                <Image
                  src={mediaUrl}
                  alt="message-image"
                  width={240}
                  height={240}
                  className="max-w-[240px] max-h-[320px] object-cover rounded-xl"
                />
              )}
              <div className={`chat-image-overlay ${imageHovered ? 'opacity-100' : 'opacity-0'}`}>
                {onImageLike && (
                  <button
                    type="button"
                    onClick={onImageLike}
                    className="chat-image-action"
                    title="Thả cảm xúc"
                  >
                    <LikeIcon className="w-4 h-4" />
                  </button>
                )}
                {onImageOptions && (
                  <button
                    type="button"
                    onClick={onImageOptions}
                    className="chat-image-action"
                    title="Tùy chọn"
                  >
                    <MoreIcon className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Video Message */}
          {mediaUrl && type === 'video' && (
            <div className="relative rounded-xl overflow-hidden max-w-[240px]">
              <video
                src={mediaUrl}
                controls={!isPendingLocalMedia}
                className="max-w-[240px] max-h-[320px] rounded-xl"
              />
              {isPendingLocalMedia && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/25">
                  <ButtonSpinner size="md" tone="light" />
                </div>
              )}
            </div>
          )}

          {/* Sticker Message */}
          {mediaUrl && type === 'sticker' && (
            <div className="max-w-[120px]">
              {isPendingLocalMedia ? (
                <img src={mediaUrl} alt="sticker" className="w-[80px] h-auto object-contain" />
              ) : (
                <Image
                  src={mediaUrl}
                  alt="sticker"
                  width={80}
                  height={80}
                  className="w-[80px] h-auto object-contain cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => window.open(mediaUrl, '_blank')}
                />
              )}
            </div>
          )}

          {/* File Message */}
          {mediaUrl && type?.startsWith('file/') && (
            <a
              href={mediaUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-3 rounded-2xl border border-border-light bg-surface-muted px-3 py-2.5 text-sm text-text-primary shadow-sm transition-all hover:border-accent hover:bg-bg-hover"
            >
              <div className="flex-shrink-0 flex items-center justify-center w-8 h-8">
                <GetFileIcon extension={(type as string).split('.').pop() || ''} />
              </div>
              <span className="truncate max-w-[200px]">{type.replace('file/', '')}</span>
            </a>
          )}

          {/* Text Bubble */}
          {content && (
            <div className={`${bubbleClass} ${bubbleModifiers} ${hasReactions ? 'chat-bubble-with-reaction' : ''}`}>
              <p className="chat-bubble-text">{content}</p>
            </div>
          )}

          {/* Reaction Badge - Single instance, positioned at bottom-right of bubble */}
          {hasReactions && (
            <button
              type="button"
              onClick={() => {
                onReactionClick();
              }}
              className={`chat-reaction-pill ${userReaction ? 'own-reaction' : ''} ${isOwn ? 'sent-reaction' : 'received-reaction'}`}
            >
              {Object.keys(reactionSummary!.emojiCounts).slice(0, 3).map((emoji) => (
                <span key={emoji} className="mr-0.5">{emoji}</span>
              ))}
              {reactionSummary!.totalCount > 1 && (
                <span className="ml-0.5 font-medium">{reactionSummary!.totalCount}</span>
              )}
            </button>
          )}
        </div>

        {/* Seen Avatar Indicator - anchored to last read message */}
        {showSeenIndicator && seenByAvatarUrl && (
          <div className="chat-seen-indicator">
            <Image
              src={seenByAvatarUrl}
              alt="seen"
              width={18}
              height={18}
              className="chat-seen-avatar"
            />
          </div>
        )}

        {/* Timestamp + Status Row */}
        <div className={`chat-timestamp-row ${isOwn ? 'own' : ''}`}>
          <span className="chat-timestamp">{timeStr}</span>

          {type !== 'system-recall' && isOwn && (
            <span className="chat-status-icon">
              {status === 'sent' && <SentIcon className="h-3.5 w-3.5" />}
              {status === 'delivered' && <DeliveredIcon className="h-3.5 w-3.5" />}
            </span>
          )}

          {hasReadPreview && (
            <button
              type="button"
              onClick={onReadPreviewPress}
              className="inline-flex items-center gap-1 rounded-full border border-border-light bg-bg-hover px-1.5 py-0.5 hover:bg-border"
              title="Xem chi tiết đã xem"
            >
              <span className="inline-flex -space-x-2">
                {previewReaders.map((reader) => {
                  const hasAvatar = Boolean(reader.avatarUrl && /^(https?:\/\/|\/)/.test(reader.avatarUrl));
                  return hasAvatar ? (
                    <Image
                      key={`read-${reader.userId}`}
                      src={reader.avatarUrl!}
                      alt={reader.displayName || 'reader'}
                      width={16}
                      height={16}
                      className="h-4 w-4 rounded-full border border-white object-cover"
                    />
                  ) : (
                    <span
                      key={`read-${reader.userId}`}
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-white bg-accent-light text-[9px] font-semibold text-accent"
                    >
                      {(reader.displayName || 'U').slice(0, 1).toUpperCase()}
                    </span>
                  );
                })}
              </span>
              {visibleReadCount > previewReaders.length && (
                <span className="text-[10px] text-text-tertiary">+{visibleReadCount - previewReaders.length}</span>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
