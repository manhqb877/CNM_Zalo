import {
  Bell,
  Bot,
  BookOpen,
  CheckCircle2,
  MessageCircle,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react';

import type { HomeFeatureItem } from '../home.types';

interface HomeFeatureCardProps {
  item: HomeFeatureItem;
}

const iconMap: Record<HomeFeatureItem['icon'], LucideIcon> = {
  chat: MessageCircle,
  community: Users,
  knowledge: BookOpen,
  ai: Bot,
  realtime: Zap,
  safety: CheckCircle2,
};

export function HomeFeatureCard({ item }: HomeFeatureCardProps) {
  const Icon = iconMap[item.icon] ?? Bell;

  return (
    <article className="group rounded-[1.5rem] border border-border bg-white/75 p-5 shadow-sm backdrop-blur transition duration-200 hover:-translate-y-1 hover:border-teal-200 hover:shadow-md">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#DDFBF5] text-[#0F766E] transition group-hover:bg-[#0F766E] group-hover:text-white">
        <Icon size={21} strokeWidth={2.2} aria-hidden />
      </div>
      <h3 className="font-ui-title mt-5 text-lg leading-tight text-[#082F49]">{item.title}</h3>
      <p className="font-ui-content mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
    </article>
  );
}
