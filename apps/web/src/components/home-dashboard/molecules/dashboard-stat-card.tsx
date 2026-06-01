import type { DashboardStatItem } from '../home-dashboard.types';
import { DashboardIcon } from '../atoms/dashboard-icon';

interface DashboardStatCardProps {
  item: DashboardStatItem;
}

export function DashboardStatCard({ item }: DashboardStatCardProps) {
  const hasBadge = Boolean(item.badge);

  return (
    <article className="zync-soft-card group relative overflow-hidden rounded-[1.6rem] p-5 transition-all hover:shadow-md">
      {/* Subtle gradient accent */}
      <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

      <div className="relative flex items-start justify-between gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent-light text-accent-strong">
          <DashboardIcon name={item.icon} className="h-4 w-4" />
        </span>
        {hasBadge && (
          <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
            <span className="font-ui-meta text-[10px] uppercase tracking-wider text-accent-strong">{item.badge}</span>
          </span>
        )}
      </div>

      <div className="relative mt-4">
        <p className="font-ui-title text-[2.4rem] font-bold leading-none tracking-tight text-text-primary">{item.value}</p>
        <p className="font-ui-content mt-1.5 text-[0.875rem] font-medium text-text-secondary">{item.label}</p>
      </div>
    </article>
  );
}
