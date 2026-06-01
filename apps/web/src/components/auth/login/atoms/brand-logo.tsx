import { ZyncLogo } from '@/components/shared/zync-logo';

interface BrandLogoProps {
  brand: string;
  variant?: 'default' | 'large';
}

export function BrandLogo({ variant = 'default' }: BrandLogoProps) {
  return <ZyncLogo size={variant === 'large' ? 'lg' : 'md'} />;
}
