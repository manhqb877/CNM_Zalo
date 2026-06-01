'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchUserProfile, type PublicUserProfile } from '@/services/users';
import { sendFriendRequest } from '@/services/friends';

interface UserProfileModalProps {
  userId: string | null;
  onClose: () => void;
  onFriendRequestSent?: () => void;
}

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'U';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

export function UserProfileModal({
  userId,
  onClose,
  onFriendRequestSent,
}: UserProfileModalProps) {
  const [profile, setProfile] = useState<PublicUserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendingRequest, setSendingRequest] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      return;
    }
    setLoading(true);
    setError(null);
    setRequestSent(false);
    setRequestError(null);
    fetchUserProfile(userId)
      .then(setProfile)
      .catch(() => setError('Không thể tải thông tin người dùng.'))
      .finally(() => setLoading(false));
  }, [userId]);

  const handleSendRequest = useCallback(async () => {
    if (!userId) return;
    setSendingRequest(true);
    setRequestError(null);
    try {
      await sendFriendRequest(userId);
      setRequestSent(true);
      onFriendRequestSent?.();
    } catch {
      setRequestError('Không thể gửi lời mời. Có thể đã gửi rồi hoặc đã là bạn bè.');
    } finally {
      setSendingRequest(false);
    }
  }, [userId, onFriendRequestSent]);

  if (!userId) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-[92%] max-w-md overflow-hidden rounded-3xl border border-[#104638] bg-[#041f18] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-[#0d3228]/80 text-[#d7f3e9] transition hover:bg-[#14463a]"
          aria-label="Đóng"
        >
          ✕
        </button>

        {loading && (
          <div className="flex h-72 items-center justify-center">
            <div className="text-[#30d7ab] animate-pulse">Đang tải...</div>
          </div>
        )}

        {error && (
          <div className="flex h-72 flex-col items-center justify-center gap-3 px-6">
            <p className="text-sm text-[#ffc3c3]">{error}</p>
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-xl border border-[#1a5444] px-4 text-sm text-[#bbebdc] hover:bg-[#10382d]"
            >
              Đóng
            </button>
          </div>
        )}

        {!loading && !error && profile && (
          <>
            {/* Cover gradient + avatar */}
            <div className="relative h-40 bg-[linear-gradient(135deg,#1a6f58_0%,#0d3228_50%,#062920_100%)]">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(48,215,171,0.15)_0,transparent_60%)]" />
              <div className="absolute -bottom-12 left-1/2 -translate-x-1/2">
                <div className="h-24 w-24 overflow-hidden rounded-full border-4 border-[#041f18] bg-[#d9ece4]">
                  {profile.avatarUrl ? (
                    <img
                      src={profile.avatarUrl}
                      alt={profile.displayName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-[#0a2d24]">
                      {getInitials(profile.displayName)}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="px-5 pb-5 pt-14 text-center">
              <h3 className="font-ui-title text-xl text-[#e4fff5]">
                {profile.displayName}
              </h3>
              {profile.username && (
                <p className="font-ui-content text-sm text-[#a9dccb]">@{profile.username}</p>
              )}
              {profile.bio && (
                <p className="mt-1.5 font-ui-content text-sm text-[#9fcabd]">
                  {profile.bio}
                </p>
              )}

              {/* Stats row */}
              <div className="mt-4 flex items-center justify-center gap-6">
                <div className="text-center">
                  <p className="font-ui-title text-xl text-[#41e8ba]">
                    {profile.friendCount}
                  </p>
                  <p className="font-ui-meta text-[0.6rem] uppercase tracking-[0.1em] text-[#7cb3a1]">
                    Bạn bè
                  </p>
                </div>
                <div className="h-8 w-px bg-[#1a5444]" />
                <div className="text-center">
                  <p className="font-ui-title text-xl text-[#41e8ba]">
                    {profile.mutualFriends}
                  </p>
                  <p className="font-ui-meta text-[0.6rem] uppercase tracking-[0.1em] text-[#7cb3a1]">
                    Bạn chung
                  </p>
                </div>
                {profile.createdAt && (
                  <>
                    <div className="h-8 w-px bg-[#1a5444]" />
                    <div className="text-center">
                      <p className="font-ui-title text-xl text-[#41e8ba]">
                        {new Date(profile.createdAt).getFullYear()}
                      </p>
                      <p className="font-ui-meta text-[0.6rem] uppercase tracking-[0.1em] text-[#7cb3a1]">
                        Tham gia
                      </p>
                    </div>
                  </>
                )}
              </div>

              {/* Info items */}
              <div className="mt-4 space-y-2">
                {profile.username && (
                  <div className="flex items-center gap-3 rounded-xl bg-[#0b2f25] px-3 py-2.5 text-left">
                    <span className="text-sm text-[#4cf0bf]">@</span>
                    <div>
                      <p className="font-ui-meta text-[0.6rem] uppercase tracking-[0.1em] text-[#78ad9d]">
                        Username
                      </p>
                      <p className="font-ui-content text-sm text-[#d4f8eb]">
                        @{profile.username}
                      </p>
                    </div>
                  </div>
                )}
                {profile.emailMasked && (
                  <div className="flex items-center gap-3 rounded-xl bg-[#0b2f25] px-3 py-2.5 text-left">
                    <span className="text-sm text-[#4cf0bf]">✉</span>
                    <div>
                      <p className="font-ui-meta text-[0.6rem] uppercase tracking-[0.1em] text-[#78ad9d]">
                        Email
                      </p>
                      <p className="font-ui-content text-sm text-[#d4f8eb]">
                        {profile.emailMasked}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="mt-5 flex items-center justify-center gap-3">
                {requestSent ? (
                  <p className="font-ui-content text-sm text-[#4cf0bf]">
                    ✓ Đã gửi lời mời kết bạn
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={handleSendRequest}
                    disabled={sendingRequest}
                    className="font-ui-title inline-flex h-10 items-center gap-2 rounded-full bg-[#2fe0b4] px-5 text-sm text-[#04342a] transition hover:brightness-110 disabled:opacity-60"
                  >
                    {sendingRequest ? 'Đang gửi...' : '➕ Kết bạn'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="font-ui-title h-10 rounded-full border border-[#1a5444] px-5 text-sm text-[#bbebdc] hover:bg-[#10382d]"
                >
                  Đóng
                </button>
              </div>
              {requestError && (
                <p className="mt-2 text-xs text-[#ffb8b8]">{requestError}</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
