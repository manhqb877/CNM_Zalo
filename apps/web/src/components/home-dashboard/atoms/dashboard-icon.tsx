import {
  Home,
  MessageCircle,
  User,
  Users,
  UserPlus,
  Settings,
  LogOut,
  Plus,
  Pencil,
  Search,
  Bell,
  Briefcase,
  Compass,
  Globe,
  Moon,
  Sun,
} from 'lucide-react';
import type { DashboardIconName } from '../home-dashboard.types';

interface DashboardIconProps {
  name: DashboardIconName;
  className?: string;
}

const ICON_MAP: Record<DashboardIconName, React.ElementType> = {
  home: Home,
  chat: MessageCircle,
  message: MessageCircle,
  profile: User,
  friends: UserPlus,
  group: Users,
  settings: Settings,
  gear: Settings,
  logout: LogOut,
  plus: Plus,
  edit: Pencil,
  search: Search,
  bell: Bell,
  bag: Briefcase,
  compass: Compass,
  moon: Moon,
  sun: Sun,
};

export function DashboardIcon({ name, className = 'h-4 w-4' }: DashboardIconProps) {
  const Icon = ICON_MAP[name] ?? Globe;
  return <Icon className={className} aria-hidden />;
}
