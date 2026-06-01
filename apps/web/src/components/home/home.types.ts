export type HomeFeatureIcon = 'chat' | 'community' | 'knowledge' | 'ai' | 'realtime' | 'safety';

export interface HomeFeatureItem {
  id: string;
  icon: HomeFeatureIcon;
  title: string;
  description: string;
}

export interface HomeMetricItem {
  id: string;
  value: string;
  label: string;
  description: string;
}

export interface HomeNavItem {
  id: string;
  label: string;
  href: string;
}

export interface HomeUseCaseItem {
  id: string;
  title: string;
  description: string;
}

export interface HomeFooterLink {
  id: string;
  label: string;
  href: string;
}

export interface HomeMockData {
  brand: string;
  releaseLabel: string;
  title: string;
  titleAccent: string;
  subtitle: string;
  ctaPrimary: string;
  ctaSecondary: string;
  navItems: HomeNavItem[];
  navAuthLabel: string;
  navPrimaryLabel: string;
  features: HomeFeatureItem[];
  metrics: HomeMetricItem[];
  benefits: string[];
  useCases: HomeUseCaseItem[];
  communityTitle: string;
  communitySubtitle: string;
  aiTitle: string;
  aiSubtitle: string;
  aiHighlights: string[];
  ctaBlockTitle: string;
  ctaBlockSubtitle: string;
  ctaBlockButton: string;
  footerBrand: string;
  footerCopyright: string;
  footerLinks: HomeFooterLink[];
}

export interface HomeScreenProps {
  data: HomeMockData;
}
