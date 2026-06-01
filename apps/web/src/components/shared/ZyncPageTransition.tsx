'use client';

import React from 'react';

export interface ZyncPageTransitionProps {
  children: React.ReactNode;
  className?: string;
}

export function ZyncPageTransition({ children, className = '' }: ZyncPageTransitionProps) {
  return (
    <div className={`zync-page-enter ${className}`}>
      {children}
    </div>
  );
}

export default ZyncPageTransition;
