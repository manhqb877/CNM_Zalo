'use client';

import React from 'react';

export type SkeletonVariant = 'text' | 'avatar' | 'card' | 'button' | 'image' | 'code';
export type SkeletonRounded = 'sm' | 'md' | 'lg' | 'full';

export interface ZyncSkeletonProps {
  variant?: SkeletonVariant;
  width?: string | number;
  height?: string | number;
  rounded?: SkeletonRounded;
  lines?: number;
  animated?: boolean;
  className?: string;
}

const ROUNDED_MAP: Record<SkeletonRounded, string> = {
  sm: 'rounded-[4px]',
  md: 'rounded-[8px]',
  lg: 'rounded-[12px]',
  full: 'rounded-full',
};

const VARIANT_DEFAULTS: Record<SkeletonVariant, { width: string; height: string; rounded: SkeletonRounded }> = {
  text: { width: '100%', height: '1rem', rounded: 'sm' },
  avatar: { width: '3rem', height: '3rem', rounded: 'full' },
  card: { width: '100%', height: '8rem', rounded: 'lg' },
  button: { width: '6rem', height: '2.5rem', rounded: 'lg' },
  image: { width: '100%', height: '12rem', rounded: 'lg' },
  code: { width: '100%', height: '6rem', rounded: 'md' },
};

function resolveClass(
  variant: SkeletonVariant,
  rounded?: SkeletonRounded,
  className?: string,
): string {
  const base = variant === 'text' ? 'zync-skeleton-text-line' : 'zync-skeleton';
  const rClass = rounded ? ROUNDED_MAP[rounded] : '';
  return [base, rClass, className].filter(Boolean).join(' ');
}

function resolveStyle(
  variant: SkeletonVariant,
  width?: string | number,
  height?: string | number,
  rounded?: SkeletonRounded,
): React.CSSProperties {
  const defaults = VARIANT_DEFAULTS[variant];
  const resolvedWidth = width ?? defaults.width;
  const resolvedHeight = height ?? defaults.height;

  if (rounded === 'full') {
    return { width: resolvedWidth, height: resolvedHeight };
  }
  return { width: resolvedWidth, height: resolvedHeight };
}

interface SkeletonLineProps {
  index: number;
  lastLineFull?: boolean;
}

function SkeletonTextLines({ lines = 3 }: { lines?: number }) {
  return (
    <div className="flex w-full flex-col gap-2">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="zync-skeleton-text-line"
          style={{
            width: i === lines - 1 ? '75%' : '100%',
          }}
        />
      ))}
    </div>
  );
}

export function ZyncSkeleton({
  variant = 'text',
  width,
  height,
  rounded,
  lines,
  animated = true,
  className,
}: ZyncSkeletonProps) {
  const style = resolveStyle(variant, width, height, rounded);
  const cls = resolveClass(variant, rounded, className);

  if (variant === 'text' && lines && lines > 1) {
    return <SkeletonTextLines lines={lines} />;
  }

  if (!animated) {
    return (
      <div
        className={[cls, 'opacity-40'].join(' ')}
        style={style}
        role="presentation"
      />
    );
  }

  return (
    <div className={cls} style={style} role="presentation" />
  );
}

/* ============================================================
 * Preset compositions
 * ============================================================ */

interface SkeletonCardProps {
  lines?: number;
  showAvatar?: boolean;
  className?: string;
}

export function SkeletonCard({ lines = 3, showAvatar = true, className }: SkeletonCardProps) {
  return (
    <div className={['flex w-full flex-col gap-3', className].filter(Boolean).join(' ')}>
      {showAvatar && (
        <div className="flex items-center gap-3">
          <div className="zync-skeleton h-10 w-10 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <div className="zync-skeleton h-3 w-32 rounded-[4px]" />
            <div className="zync-skeleton h-2.5 w-20 rounded-[4px]" />
          </div>
        </div>
      )}
      <div className="flex flex-col gap-2">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className="zync-skeleton h-2.5 rounded-[4px]"
            style={{ width: i === lines - 1 ? '60%' : '100%' }}
          />
        ))}
      </div>
    </div>
  );
}

interface SkeletonChatBubbleProps {
  senderIsSelf?: boolean;
  className?: string;
}

export function SkeletonChatBubble({ senderIsSelf = false, className }: SkeletonChatBubbleProps) {
  return (
    <div
      className={[
        'flex items-end gap-2',
        senderIsSelf ? 'flex-row-reverse' : 'flex-row',
        className,
      ].filter(Boolean).join(' ')}
    >
      <div className="zync-skeleton h-8 w-8 shrink-0 rounded-full" />
      <div className="flex flex-col gap-1.5">
        <div
          className="zync-skeleton rounded-[14px]"
          style={{ width: '12rem', height: '2.5rem' }}
        />
        <div
          className="zync-skeleton rounded-[14px]"
          style={{ width: '8rem', height: '2.5rem' }}
        />
      </div>
    </div>
  );
}

interface SkeletonCodeBlockProps {
  lines?: number;
  className?: string;
}

export function SkeletonCodeBlock({ lines = 5, className }: SkeletonCodeBlockProps) {
  return (
    <div
      className={[
        'flex w-full flex-col gap-2 rounded-[12px] border p-4',
        className,
      ].filter(Boolean).join(' ')}
      style={{ borderColor: 'var(--border)', background: 'var(--bg-code)' }}
    >
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="zync-skeleton h-3.5 rounded-[4px]"
          style={{ width: i === 0 ? '30%' : i === 1 ? '55%' : i === lines - 1 ? '45%' : '80%' }}
        />
      ))}
    </div>
  );
}

interface SkeletonAvatarProps {
  size?: number;
  className?: string;
}

export function SkeletonAvatar({ size = 40, className }: SkeletonAvatarProps) {
  return (
    <div
      className={['zync-skeleton shrink-0 rounded-full', className].filter(Boolean).join(' ')}
      style={{ width: size, height: size }}
      role="presentation"
    />
  );
}
