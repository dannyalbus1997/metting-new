'use client';

import React from 'react';

type BadgeVariant =
  | 'completed'
  | 'processing'
  | 'pending'
  | 'failed'
  | 'default';
type BadgeSize = 'sm' | 'md';

interface BadgeProps {
  variant?: BadgeVariant;
  size?: BadgeSize;
  showDot?: boolean;
  children: React.ReactNode;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  completed: 'bg-green-100 text-green-800',
  processing: 'bg-yellow-100 text-yellow-800',
  pending: 'bg-gray-100 text-gray-800',
  failed: 'bg-red-100 text-red-800',
  default: 'bg-indigo-100 text-indigo-800',
};

const sizeClasses: Record<BadgeSize, string> = {
  sm: 'px-2 py-1 text-xs',
  md: 'px-3 py-1 text-sm',
};

const dotColors: Record<BadgeVariant, string> = {
  completed: 'bg-green-500',
  processing: 'bg-yellow-500',
  pending: 'bg-gray-400',
  failed: 'bg-red-500',
  default: 'bg-indigo-500',
};

export default function Badge({
  variant = 'default',
  size = 'md',
  showDot = false,
  children,
  className = '',
}: BadgeProps) {
  const baseClasses = 'inline-flex items-center gap-2 font-semibold rounded-full';

  const combinedClassName = [
    baseClasses,
    variantClasses[variant],
    sizeClasses[size],
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={combinedClassName}>
      {showDot && (
        <span
          className={`inline-block w-2 h-2 rounded-full ${
            dotColors[variant]
          }`}
        />
      )}
      {children}
    </span>
  );
}
