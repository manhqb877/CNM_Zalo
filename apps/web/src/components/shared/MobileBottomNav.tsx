'use client';

import Link from 'next/link';
import { DashboardIcon } from '../home-dashboard/atoms/dashboard-icon';
import type { DashboardHomeMockData, DashboardNavItem } from '../home-dashboard/home-dashboard.types';

interface MobileBottomNavProps {
  navItems: DashboardHomeMockData['navItems'];
  activeNavId: string;
}

export function MobileBottomNav({ navItems, activeNavId }: MobileBottomNavProps) {
  const getNavHref = (id: string): string => {
    switch (id) {
      case 'home': return '/home';
      case 'chat': return '/chat';
      case 'friends': return '/friends';
      case 'community': return '/community';
      case 'profile': return '/profile';
      default: return '#';
    }
  };

  // We only want to show a few items on mobile (e.g. Home, Chat, Friends, Community, Profile)
  const mobileItems = navItems.filter(item => ['home', 'chat', 'friends', 'community'].includes(item.id));
  
  // Add Profile explicitly since it might not be in navItems
  const allItems: DashboardNavItem[] = [...mobileItems, { id: 'profile', label: 'Hồ sơ', icon: 'profile' }];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex h-[68px] items-center justify-around border-t border-border bg-[var(--surface-glass)] px-2 pb-safe backdrop-blur-md md:hidden shadow-[0_-4px_24px_rgba(0,0,0,0.04)]">
      {allItems.map((item) => {
        const isActive = activeNavId === item.id || (activeNavId === 'explore' && item.id === 'home');
        
        return (
          <Link
            key={item.id}
            href={getNavHref(item.id)}
            className={`flex flex-col items-center justify-center gap-1 w-full h-full min-w-[64px] transition-all duration-200 active:scale-95 ${
              isActive 
                ? 'text-accent' 
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <div className={`flex items-center justify-center w-8 h-8 rounded-xl transition-all duration-300 ${
              isActive ? 'bg-accent/15' : 'bg-transparent'
            }`}>
              <DashboardIcon name={item.icon} className={`h-5 w-5 ${isActive ? 'scale-110' : ''}`} />
            </div>
            <span className={`text-[10px] font-medium tracking-wide ${isActive ? 'font-bold' : ''}`}>
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
