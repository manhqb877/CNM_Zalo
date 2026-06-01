'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type { DashboardHomeMockData } from '../home-dashboard.types';
import { DashboardIcon } from '../atoms/dashboard-icon';
import { DashboardStatCard } from '../molecules/dashboard-stat-card';
import { DashboardActivityItemRow } from '../molecules/dashboard-activity-item';

import type { DashboardActivityItem } from '../home-dashboard.types';

interface HomeDashboardScreenProps {
  data: DashboardHomeMockData;
  chatSlot?: React.ReactNode;
  profileSlot?: React.ReactNode;
  settingsSlot?: React.ReactNode;
  friendsSlot?: React.ReactNode;
  communitySlot?: React.ReactNode;
  exploreSlot?: React.ReactNode;
  notificationSlot?: React.ReactNode;
  activeNavId?: string;
  onNavSelect?: (id: string) => void;
  onViewUserProfile?: (userId: string) => void;
  onActivityClick?: (item: DashboardActivityItem) => void;
  onLogout?: () => void;
  theme?: string;
  onToggleTheme?: () => void;
}

export function HomeDashboardScreen({
  data,
  chatSlot,
  profileSlot,
  settingsSlot,
  friendsSlot,
  communitySlot,
  exploreSlot,
  notificationSlot,
  activeNavId,
  onNavSelect,
  onViewUserProfile,
  onActivityClick,
  onLogout,
  theme,
  onToggleTheme,
}: HomeDashboardScreenProps) {
  const selectedNavId = activeNavId ?? data.navItems.find((item) => item.active)?.id ?? data.navItems[0]?.id;
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Panel types that need full height with overflow hidden
  const fullHeightNavIds = new Set(['chat', 'friends', 'community', 'explore']);
  const isFullHeight = fullHeightNavIds.has(selectedNavId ?? '');

  const sectionClassName = 'flex min-h-0 flex-1 flex-col overflow-hidden';

  const handleSelectNav = (id: string) => {
    if (id === 'logout') {
      onLogout?.();
      return;
    }
    onNavSelect?.(id);
    setIsMobileMenuOpen(false);
  };

  return (
    <main className="zync-page-shell zync-dashboard-main flex h-[100dvh] flex-col overflow-hidden text-text-primary">
      <header className="sticky top-0 z-30 px-2 pt-2 pb-2 sm:px-4 sm:pt-4 sm:pb-4">
        <div className="zync-soft-topbar flex h-16 items-center justify-between rounded-[1.75rem] px-4 lg:px-6">
          <div className="flex items-center gap-4 lg:gap-6">
            <div className="flex items-center gap-3">
              <span className="relative block h-10 w-10 overflow-hidden rounded-2xl bg-white ring-1 ring-border shadow-sm">
                <Image src="/favicon.svg" alt="Logo Zync" fill className="object-contain p-1" sizes="40px" priority />
              </span>
              <div className="hidden sm:block">
                <p className="font-ui-brand text-xl leading-none text-text-primary">{data.brand}</p>
                <p className="font-ui-meta mt-1 text-[0.65rem] uppercase tracking-[0.18em] text-text-tertiary">Cộng đồng nhà phát triển</p>
              </div>
            </div>

            <nav className="hidden items-center gap-1 md:flex">
              {data.navItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectNav(item.id)}
                  className={`rounded-full px-4 py-2 text-sm transition ${
                    selectedNavId === item.id
                      ? 'bg-accent text-[var(--bg-primary)] shadow-sm'
                      : 'border border-border bg-[var(--surface-glass)] text-text-secondary hover:text-text-primary'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <DashboardIcon name={item.icon} className="h-4 w-4" />
                    {item.label}
                  </span>
                </button>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={onToggleTheme}
              className={`zync-soft-badge hidden text-xs sm:inline-flex ${theme === 'dark' ? 'zync-soft-badge-active' : ''}`}
              title="Chuyển đổi giao diện"
            >
              {theme === 'dark' ? 'Sáng' : 'Tối'}
            </button>

            {notificationSlot ?? (
              <button type="button" className="zync-soft-badge h-10 w-10 p-0">
                <DashboardIcon name="bell" className="h-4 w-4" />
              </button>
            )}

            <div className="hidden items-center gap-2 border-l border-border pl-3 sm:flex">
              {data.sideFooterItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectNav(item.id)}
                  className={`rounded-full px-3 py-2 text-sm transition ${
                    selectedNavId === item.id
                      ? 'bg-accent text-[var(--bg-primary)] shadow-sm'
                      : 'border border-border bg-[var(--surface-glass)] text-text-secondary hover:text-text-primary'
                  }`}
                  title={item.label}
                >
                  <span className="flex items-center gap-2">
                    <DashboardIcon name={item.icon} className="h-4 w-4" />
                    <span className="hidden lg:inline">{item.label}</span>
                  </span>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => handleSelectNav('profile')}
              className="flex items-center gap-2 rounded-full border border-border bg-[var(--surface-glass)] p-1 pl-2 transition hover:bg-[var(--surface-glass-strong)]"
            >
              <span className="font-ui-title hidden text-sm text-text-primary lg:block">{data.user.displayName}</span>
              <span className="inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-accent-light text-xs font-semibold text-accent-strong">
                {data.user.avatarUrl ? (
                  <Image src={data.user.avatarUrl} alt={data.user.displayName} width={32} height={32} className="h-full w-full object-cover" />
                ) : (
                  data.user.initials
                )}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-[var(--surface-glass)] text-text-secondary md:hidden"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
                <path d="M4 7h16" />
                <path d="M4 12h16" />
                <path d="M4 17h16" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 md:hidden" onClick={() => setIsMobileMenuOpen(false)}>
          <aside className="absolute right-3 top-3 bottom-3 w-[min(82vw,320px)] rounded-[1.8rem] zync-soft-card zync-soft-card-elevated p-5" onClick={(event) => event.stopPropagation()}>
            <div className="mb-6 flex items-center justify-between">
              <div>
                <span className="zync-soft-kicker">Điều hướng</span>
                <p className="font-ui-title mt-3 text-lg text-text-primary">Menu workspace</p>
              </div>
              <button onClick={() => setIsMobileMenuOpen(false)} className="zync-soft-button-ghost h-10 w-10 p-0 text-base">
                <span className="font-ui-content text-xs">Đóng</span>
              </button>
            </div>

            <nav className="flex flex-col gap-2">
              {data.navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleSelectNav(item.id)}
                  className={`flex items-center gap-3 rounded-[1rem] px-4 py-3 text-left transition ${
                    selectedNavId === item.id
                      ? 'bg-accent text-[var(--bg-primary)] shadow-sm'
                      : 'border border-border bg-[var(--surface-glass)] text-text-secondary'
                  }`}
                >
                  <DashboardIcon name={item.icon} className="h-[18px] w-[18px]" />
                  {item.label}
                </button>
              ))}

              <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
                {data.sideFooterItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleSelectNav(item.id)}
                    className={`flex items-center gap-3 rounded-[1rem] px-4 py-3 text-left transition ${
                      selectedNavId === item.id
                        ? 'bg-accent text-[var(--bg-primary)] shadow-sm'
                        : 'border border-border bg-[var(--surface-glass)] text-text-secondary'
                    }`}
                  >
                    <DashboardIcon name={item.icon} className="h-[18px] w-[18px]" />
                    {item.label}
                  </button>
                ))}
              </div>
            </nav>

            <button
              onClick={() => handleSelectNav('logout')}
              className="zync-soft-button-danger mt-6 h-11 w-full text-sm"
            >
              Đăng xuất
            </button>
          </aside>
        </div>
      )}

      <div className="flex-1 overflow-hidden px-2 pb-2 sm:px-4 sm:pb-4">
        <section className={`${sectionClassName} zync-soft-card zync-soft-card-elevated h-full rounded-[2rem]`}>
          {selectedNavId === 'home' && (
            <header className="border-b border-border-light px-4 py-4 sm:px-6 sm:py-5">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="font-ui-meta text-[0.72rem] uppercase tracking-[0.18em] text-text-tertiary">Trung tâm</p>
                  <h1 className="font-ui-title mt-1.5 text-2xl text-text-primary">{data.greeting}</h1>
                  <p className="font-ui-content mt-1 text-sm text-text-secondary">Chúc bạn một ngày làm việc hiệu quả</p>
                </div>
                <span className="zync-soft-badge">
                  <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Trực tuyến
                </span>
              </div>
            </header>
          )}

          <div className={`flex-1 ${isFullHeight ? 'overflow-hidden px-2 py-2 sm:px-4 sm:py-4' : 'overflow-y-auto px-4 py-4 pb-20 sm:px-6 sm:py-6'}`}>
            {selectedNavId === 'chat' ? (
              <div className="flex h-full w-full overflow-hidden">
                <div className="h-full w-full overflow-hidden">
                  {chatSlot}
                </div>
              </div>
            ) : selectedNavId === 'settings' ? (
              <div className="h-full w-full">{settingsSlot}</div>
            ) : selectedNavId === 'profile' ? (
              <div className="h-full w-full">{profileSlot}</div>
            ) : selectedNavId === 'friends' ? (
              <div className="flex h-full w-full overflow-hidden">
                <div className="h-full w-full overflow-hidden">
                  {friendsSlot}
                </div>
              </div>
            ) : selectedNavId === 'community' ? (
              <div className="flex h-full w-full overflow-hidden">
                <div className="h-full w-full overflow-hidden">
                  {communitySlot}
                </div>
              </div>
            ) : selectedNavId === 'explore' ? (
              <div className="flex h-full w-full overflow-hidden">
                <div className="h-full w-full overflow-hidden">
                  {exploreSlot}
                </div>
              </div>
            ) : (
              <div className="w-full space-y-6">
                {/* Stats Grid */}
                <div className="grid shrink-0 grid-cols-3 gap-3 sm:gap-4">
                  {data.stats.map((item) => (
                    <DashboardStatCard key={item.id} item={item} />
                  ))}
                </div>

                {/* Activity Feed */}
                <section className="shrink-0 rounded-[1.8rem] p-4 shadow-sm zync-soft-card-muted sm:p-5">
                  <div className="mb-4 flex items-center justify-between gap-3 border-b border-border-light pb-3">
                    <h2 className="font-ui-title text-lg text-text-primary">{data.activityTitle}</h2>
                    {data.activities.length > 0 && (
                      <Link href="/friends" className="zync-soft-badge text-sm hover:text-text-primary">
                        {data.activityCtaLabel}
                      </Link>
                    )}
                  </div>

                  {data.activities.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 py-10 text-center">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-bg-hover">
                        <svg className="h-6 w-6 text-text-tertiary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                        </svg>
                      </div>
                      <div>
                        <p className="font-ui-title text-sm text-text-primary">Chưa có hoạt động nào</p>
                        <p className="font-ui-content mt-1 text-xs text-text-secondary">
                          Bắt đầu trò chuyện để xem tin nhắn tại đây
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {data.activities.map((item) => (
                        <DashboardActivityItemRow
                          key={item.id}
                          item={item}
                          onClick={onActivityClick}
                        />
                      ))}
                    </div>
                  )}
                </section>
                <div className="h-10 shrink-0" tabIndex={-1} />
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
