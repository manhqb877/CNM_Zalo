import { Users, Mail, Search } from 'lucide-react';

interface FriendsTabNavigationProps {
  activeTab: 'all' | 'requests' | 'search';
  onTabChange: (tab: 'all' | 'requests' | 'search') => void;
  pendingCount: number;
}

export function FriendsTabNavigation({ activeTab, onTabChange, pendingCount }: FriendsTabNavigationProps) {
  const tabs = [
    { id: 'all' as const, label: 'Tất cả bạn bè', Icon: Users },
    { id: 'requests' as const, label: 'Lời mời', Icon: Mail },
    { id: 'search' as const, label: 'Tìm kiếm', Icon: Search },
  ];

  return (
    <nav className="zync-page-tabs" aria-label="Điều hướng bạn bè">
      {tabs.map((tab) => {
        const Icon = tab.Icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`zync-tab-pill relative shrink-0 px-4 py-1.5 ${
              isActive
                ? 'zync-tab-pill-active'
                : ''
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{tab.label}</span>
            {tab.id === 'requests' && pendingCount > 0 && (
              <span
                className={`ml-0.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-bold ${
                  isActive ? 'bg-[var(--bg-primary)]/15 text-[var(--bg-primary)]' : 'bg-accent/15 text-accent'
                }`}
              >
                {pendingCount > 99 ? '99+' : pendingCount}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
