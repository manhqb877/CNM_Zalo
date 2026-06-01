import type { DashboardActivityItem } from '../home-dashboard.types';
import { DashboardIcon } from '../atoms/dashboard-icon';

interface DashboardActivityItemProps {
  item: DashboardActivityItem;
  onClick?: (item: DashboardActivityItem) => void;
}

export function DashboardActivityItemRow({ item, onClick }: DashboardActivityItemProps) {
  return (
    <article
      className="grid cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[1.2rem] border border-transparent px-3 py-3.5 transition-all hover:border-border hover:bg-bg-hover active:scale-[0.99]"
      onClick={() => onClick?.(item)}
    >
      <span className={`flex h-11 w-11 items-center justify-center rounded-xl text-sm font-semibold text-white shadow-sm ${item.toneClass}`}>
        {item.icon ? <DashboardIcon name={item.icon} className="h-[18px] w-[18px]" /> : item.initials}
      </span>

      <div className="min-w-0">
        <p className="font-ui-title truncate text-sm font-semibold text-text-primary">{item.title}</p>
        <p className="font-ui-content mt-0.5 truncate text-xs font-medium text-text-secondary">{item.message}</p>
      </div>

      <div className="flex flex-col items-end gap-1.5">
        <span className="font-ui-meta whitespace-nowrap text-[10px] font-medium text-text-secondary">{item.timeLabel}</span>
        {item.isUnread && <span className="h-2 w-2 flex-shrink-0 rounded-full bg-accent shadow-sm" />}
      </div>
    </article>
  );
}
