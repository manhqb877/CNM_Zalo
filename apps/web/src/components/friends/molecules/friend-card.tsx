"use client";

import type { FriendUser } from "@/services/friends";
import type { ReactNode } from "react";
import { MessageSquare, MoreHorizontal, UserMinus, UserX } from "lucide-react";
import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { FriendsAvatar } from "../atoms/friends-avatar";
import { FriendsStatusBadge } from "../atoms/friends-status-badge";

const MENU_WIDTH_PX = 192; // w-48

interface FriendCardProps {
  friend: FriendUser;
  onUnfriend: (friendId: string) => Promise<void>;
  onBlock: (userId: string) => Promise<void>;
  isLoading: boolean;
  onMessage?: (friendId: string) => void;
}

export function FriendCard({
  friend,
  onUnfriend,
  onBlock,
  isLoading,
  onMessage,
}: FriendCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [menuRect, setMenuRect] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (!showMenu || !menuTriggerRef.current) {
      setMenuRect(null);
      return;
    }
    const update = () => {
      const el = menuTriggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const left = Math.min(
        Math.max(8, r.right - MENU_WIDTH_PX),
        window.innerWidth - MENU_WIDTH_PX - 8,
      );
      setMenuRect({ top: r.bottom + 4, left });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [showMenu]);

  useEffect(() => {
    if (!showMenu) return;

    const handleClickOutside = (event: MouseEvent) => {
      const t = event.target as Node;
      if (menuPanelRef.current?.contains(t)) return;
      if (menuTriggerRef.current?.contains(t)) return;
      setShowMenu(false);
    };

    const closeOnScroll = () => setShowMenu(false);

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("scroll", closeOnScroll, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", closeOnScroll, true);
    };
  }, [showMenu]);

  const handleUnfriend = async () => {
    setShowMenu(false);
    await onUnfriend(friend.id);
  };

  const handleBlock = async () => {
    setShowMenu(false);
    await onBlock(friend.id);
  };

  const handleMessage = () => {
    setShowMenu(false);
    onMessage?.(friend.id);
  };

  return (
    <article className="group relative flex h-full min-h-0 w-full max-w-full min-w-0 flex-col gap-2.5 overflow-visible rounded-[var(--radius-card)] border border-border-soft bg-[var(--surface)] px-3 pb-3 pt-3 shadow-soft transition-all hover:border-border-strong hover:shadow-soft-hover sm:px-3.5">
      <div className="absolute right-1.5 top-1.5 z-20 sm:right-2 sm:top-2">
        <button
          ref={menuTriggerRef}
          type="button"
          onClick={() => setShowMenu(!showMenu)}
          className="flex h-7 w-7 items-center justify-center rounded-full text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary"
          aria-label="Tùy chọn"
          aria-expanded={showMenu}
          aria-haspopup="menu"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>

        {showMenu &&
          menuRect &&
          typeof document !== "undefined" &&
          (createPortal(
            <div
              ref={menuPanelRef}
              className="zync-glass-panel-strong fixed z-[300] w-48 overflow-hidden rounded-xl bg-[var(--surface-card)]/95 p-1 shadow-2xl backdrop-blur-xl"
              style={{ top: menuRect.top, left: menuRect.left }}
              role="menu"
            >
              {onMessage ? (
                <button
                  type="button"
                  onClick={handleMessage}
                  disabled={isLoading}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-accent"
                  role="menuitem"
                >
                  <MessageSquare className="h-4 w-4" />
                  Nhắn tin
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleUnfriend}
                disabled={isLoading}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-amber-600"
                role="menuitem"
              >
                <UserMinus className="h-4 w-4" />
                Hủy kết bạn
              </button>
              <button
                type="button"
                onClick={handleBlock}
                disabled={isLoading}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-red-500 transition-colors hover:bg-[var(--danger-bg)]"
                role="menuitem"
              >
                <UserX className="h-4 w-4" />
                Chặn người dùng
              </button>
            </div>,
            document.body,
          ) as unknown as ReactNode)}
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1.5 px-0.5 text-center">
        <div className="relative isolate inline-flex shrink-0">
          <FriendsAvatar
            name={friend.displayName}
            avatarUrl={friend.avatarUrl}
            size="md"
          />
          <div className="absolute -bottom-px -right-px z-10">
            <FriendsStatusBadge status={friend.status} size="sm" />
          </div>
        </div>

        <div className="w-full min-w-0">
          <h3 className="font-ui-title line-clamp-2 text-sm leading-snug text-text-primary">
            {friend.displayName}
          </h3>
          {friend.username ? (
            <p className="font-ui-meta mt-0.5 truncate text-xs text-text-tertiary">
              @{friend.username}
            </p>
          ) : null}
          {friend.bio ? (
            <p className="font-ui-content mt-1 line-clamp-1 text-[0.7rem] leading-relaxed text-text-secondary sm:text-xs">
              {friend.bio}
            </p>
          ) : null}
        </div>
      </div>

      {onMessage ? (
        <button
          type="button"
          onClick={() => onMessage(friend.id)}
          disabled={isLoading}
          className="zync-soft-button !mx-auto flex w-[92%] shrink-0 items-center justify-center gap-1.5 !px-4 !py-2 text-sm font-semibold leading-none"
        >
          <MessageSquare className="h-4 w-4 shrink-0" aria-hidden />
          <span>Nhắn tin</span>
        </button>
      ) : null}
    </article>
  );
}
