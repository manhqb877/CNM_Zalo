import type { HomeMetricItem } from '../home.types';

interface HomeMetricCardProps {
  item: HomeMetricItem;
}

export function HomeMetricCard({ item }: HomeMetricCardProps) {
  return (
    <article className="zync-reveal-up zync-soft-card rounded-[1.6rem] p-5">
      <p className="zync-soft-stat-value">{item.value}</p>
      <p className="font-ui-title mt-2 text-base text-text-primary">{item.label}</p>
      <p className="font-ui-content mt-1 text-sm leading-6 text-text-secondary">{item.description}</p>
    </article>
  );
}
