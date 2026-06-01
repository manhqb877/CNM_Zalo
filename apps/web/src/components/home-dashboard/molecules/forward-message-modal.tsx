'use client';

import { useState, useCallback, useMemo } from 'react';
import type { Message } from '@zync/shared-types';
import { ButtonSpinner } from '@/components/shared/loading-system';

// ─── Icons ───
function CloseIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function SearchIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

// ─── Types ───
export interface Conversation {
  _id: string;
  name: string;
  avatarUrl?: string;
  isGroup?: boolean;
  memberCount?: number;
}

interface ForwardMessageModalProps {
  open: boolean;
  message: Message | null;
  conversations: Conversation[];
  currentConversationId?: string;
  isLoading?: boolean;
  onClose: () => void;
  onForward: (message: Message, toConversationId: string) => void;
}

// ─── Main Component ───
export function ForwardMessageModal({
  open,
  message,
  conversations,
  currentConversationId,
  isLoading = false,
  onClose,
  onForward,
}: ForwardMessageModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);

  // Filter conversations (exclude current one)
  const filteredConversations = useMemo(() => {
    return conversations
      .filter((conv) => conv._id !== currentConversationId)
      .filter((conv) => {
        if (!searchQuery.trim()) return true;
        return conv.name.toLowerCase().includes(searchQuery.toLowerCase());
      });
  }, [conversations, currentConversationId, searchQuery]);

  const handleForward = useCallback(() => {
    if (!message || !selectedConversationId) return;
    onForward(message, selectedConversationId);
    setSearchQuery('');
    setSelectedConversationId(null);
  }, [message, selectedConversationId, onForward]);

  if (!open || !message) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl bg-[#06271f] border border-[#2f6657] shadow-lg">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#2f6657] px-6 py-4">
            <h3 className="text-lg font-semibold text-[#e2fff4]">Chuyển tiếp tin nhắn</h3>
            <button
              onClick={onClose}
              className="rounded-full hover:bg-[#1a4a3e] transition-colors p-1"
            >
              <CloseIcon className="h-5 w-5 text-[#99c2b3]" />
            </button>
          </div>

          {/* Search */}
          <div className="px-6 py-3 border-b border-[#2f6657]">
            <label className="flex h-11 items-center gap-2 rounded-xl bg-[#12392f] px-3 text-[#88bca9]">
              <SearchIcon className="h-4 w-4 flex-shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm kiếm cuộc hội thoại..."
                className="w-full bg-transparent text-sm text-[#d8f7ec] outline-none placeholder:text-[#90b8a9]"
              />
            </label>
          </div>

          {/* Conversations List */}
          <div className="max-h-96 overflow-y-auto">
            {filteredConversations.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-center text-[#99c2b3]">
                <p>{searchQuery ? 'Không tìm thấy cuộc hội thoại.' : 'Không có cuộc hội thoại nào.'}</p>
              </div>
            ) : (
              <div className="space-y-1 p-1">
                {filteredConversations.map((conv) => (
                  <button
                    key={conv._id}
                    onClick={() => setSelectedConversationId(conv._id)}
                    className={`w-full rounded-lg px-4 py-3 text-left transition-colors ${
                      selectedConversationId === conv._id
                        ? 'bg-[#2de3b3]/20 border border-[#2de3b3]'
                        : 'hover:bg-[#103a30] border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {/* Avatar */}
                      <div className="h-10 w-10 rounded-full bg-[#2f6657] text-[#dffef1] flex-shrink-0 flex items-center justify-center text-sm font-semibold">
                        {conv.avatarUrl ? (
                          <img src={conv.avatarUrl} alt={conv.name} className="h-full w-full rounded-full object-cover" />
                        ) : (
                          conv.name.charAt(0).toUpperCase()
                        )}
                      </div>

                      {/* Name */}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-[#e6fff6]">{conv.name}</p>
                        {conv.isGroup && <p className="truncate text-xs text-[#9ac7b7]">{conv.memberCount} thành viên</p>}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex gap-3 border-t border-[#2f6657] px-6 py-4">
            <button
              onClick={onClose}
              className="flex-1 rounded-lg bg-[#103a30] hover:bg-[#0b3027] text-[#d8f7ec] py-2 text-sm font-medium transition-colors"
            >
              Hủy
            </button>
            <button
              onClick={handleForward}
              disabled={!selectedConversationId || isLoading}
              className="flex-1 rounded-lg bg-[#2de3b3] hover:bg-[#25d09a] disabled:opacity-50 disabled:cursor-not-allowed text-[#05382e] py-2 text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              {isLoading && <ButtonSpinner size="sm" tone="teal" />}
              {isLoading ? 'Đang gửi...' : 'Chuyển tiếp'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
