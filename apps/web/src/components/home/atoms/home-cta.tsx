import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

interface HomeCtaProps {
  label: string;
  href: string;
  variant: 'primary' | 'secondary';
}

export function HomeCta({ label, href, variant }: HomeCtaProps) {
  const className =
    variant === 'primary'
      ? 'inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#0F766E] px-6 text-sm font-bold text-white shadow-[0_20px_45px_-22px_rgba(15,118,110,0.9)] transition hover:-translate-y-0.5 hover:bg-[#0B5F59]'
      : 'inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white/70 px-6 text-sm font-bold text-[#082F49] shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:border-teal-200 hover:text-[#0F766E]';

  return (
    <Link href={href} className={className}>
      <span>{label}</span>
      {variant === 'primary' ? <ArrowRight size={17} strokeWidth={2.4} aria-hidden /> : null}
    </Link>
  );
}
