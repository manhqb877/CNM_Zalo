'use client';

import Image from 'next/image';
import { DashboardNavItemRow } from '../home-dashboard/molecules/dashboard-nav-item';
import type { DashboardHomeMockData } from '../home-dashboard/home-dashboard.types';

interface SidebarProps {
  data: DashboardHomeMockData;
  activeNavId: string;
  onNavSelect: (id: string) => void;
  isMobileSidebarOpen: boolean;
  onMobileSidebarClose: () => void;
}

export function Sidebar({
  data,
  activeNavId,
  onNavSelect,
  isMobileSidebarOpen,
  onMobileSidebarClose,
}: SidebarProps) {
  return (
    <>
      {/* Mobile Drawer */}
      {isMobileSidebarOpen && (
        <div className="fixed inset-0 z-50 bg-black/55 lg:hidden" onClick={onMobileSidebarClose}>
          <aside
            className="h-full w-[84%] max-w-[320px] overflow-y-auto rounded-r-[2rem] border-r border-border bg-bg-sidebar px-4 py-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3 px-1">
                <span className="relative block h-9 w-9 overflow-hidden rounded-xl bg-accent ring-1 ring-border-light">
                  <Image src="/favicon.svg" alt="Logo Zync" fill className="object-contain p-1" sizes="36px" priority />
                </span>
                <p className="font-ui-brand text-3xl leading-none text-accent">{data.brand}</p>
              </div>
              <button
                type="button"
                onClick={onMobileSidebarClose}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-bg-hover text-text-secondary hover:bg-border-light"
                aria-label="Đóng thanh điều hướng"
              >
                ✕
              </button>
            </div>

            <div className="mt-6 flex items-center gap-3 rounded-2xl bg-bg-card border border-border-light px-3 py-3 shadow-sm">
              <span className="inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-accent-light text-sm font-semibold text-accent">
                {data.user.avatarUrl ? (
                  <Image
                    src={data.user.avatarUrl}
                    alt={data.user.displayName}
                    width={40}
                    height={40}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  data.user.initials
                )}
              </span>
              <div>
                <p className="font-ui-title text-[0.97rem] text-text-primary">{data.user.displayName}</p>
                <p className="font-ui-content text-xs text-text-tertiary">{data.user.roleLabel}</p>
              </div>
            </div>

            <div className="mt-6 space-y-1">
              {data.navItems.map((item) => (
                <DashboardNavItemRow
                  key={item.id}
                  item={item}
                  isActive={item.id === activeNavId}
                  onClick={(navItem) => onNavSelect(navItem.id)}
                />
              ))}
            </div>

            <button
              type="button"
              className="font-ui-title mt-8 h-12 w-full rounded-xl bg-accent text-lg text-white shadow-md transition hover:bg-accent-hover"
            >
              {data.primaryAction}
            </button>

            <div className="mt-6 space-y-1 border-t border-border-light pt-4">
              {data.sideFooterItems.map((item) => (
                <DashboardNavItemRow
                  key={item.id}
                  item={item}
                  isActive={item.id === activeNavId}
                  onClick={(navItem) => onNavSelect(navItem.id)}
                />
              ))}
            </div>
          </aside>
        </div>
      )}

      {/* Desktop Sidebar */}
      <aside className="hidden h-full w-[260px] md:w-[80px] lg:w-[260px] flex-col overflow-y-auto rounded-3xl border border-border bg-bg-sidebar px-4 md:px-2 lg:px-4 py-6 shadow-md md:flex transition-all duration-300">
        <div className="flex items-center gap-3 px-2 md:justify-center lg:justify-start">
          <span className="relative block h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-accent ring-1 ring-border-light">
            <Image src="/favicon.svg" alt="Logo Zync" fill className="object-contain p-1" sizes="40px" priority />
          </span>
          <p className="font-ui-brand text-4xl leading-none text-accent md:max-lg:hidden">{data.brand}</p>
        </div>

        <div className="mt-8 flex items-center gap-3 rounded-2xl bg-bg-card border border-border-light px-3 md:px-0 lg:px-3 py-3 md:py-2 lg:py-3 shadow-sm md:max-lg:bg-transparent md:max-lg:border-none md:max-lg:shadow-none md:max-lg:justify-center">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-light text-sm font-semibold text-accent">
            {data.user.avatarUrl ? (
              <Image
                src={data.user.avatarUrl}
                alt={data.user.displayName}
                width={40}
                height={40}
                className="h-full w-full object-cover"
              />
            ) : (
              data.user.initials
            )}
          </span>
          <div className="md:max-lg:hidden overflow-hidden">
            <p className="font-ui-title text-[0.97rem] text-text-primary truncate">{data.user.displayName}</p>
            <p className="font-ui-content text-xs text-text-tertiary truncate">{data.user.roleLabel}</p>
          </div>
        </div>

        <div className="mt-6 space-y-1">
          {data.navItems.map((item) => (
            <DashboardNavItemRow
              key={item.id}
              item={item}
              isActive={item.id === activeNavId}
              onClick={(navItem) => onNavSelect(navItem.id)}
              hideTextOnTablet={true}
            />
          ))}
        </div>

        <button
          type="button"
          className="font-ui-title mt-auto h-12 w-full rounded-xl bg-accent text-lg text-white shadow-md transition hover:bg-accent-hover md:max-lg:hidden"
        >
          {data.primaryAction}
        </button>

        <div className="mt-6 space-y-1 border-t border-border-light pt-4">
          {data.sideFooterItems.map((item) => (
            <DashboardNavItemRow
              key={item.id}
              item={item}
              isActive={item.id === activeNavId}
              onClick={(navItem) => onNavSelect(navItem.id)}
              hideTextOnTablet={true}
            />
          ))}
        </div>
      </aside>
    </>
  );
}
