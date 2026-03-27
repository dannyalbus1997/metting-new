'use client';

import React from 'react';

interface SkeletonLineProps {
  width?: 'full' | 'sm' | 'md' | 'lg';
  height?: 'sm' | 'md' | 'lg';
}

const widthClasses: Record<string, string> = {
  full: 'w-full',
  sm: 'w-1/3',
  md: 'w-2/3',
  lg: 'w-5/6',
};

const heightClasses: Record<string, string> = {
  sm: 'h-3',
  md: 'h-4',
  lg: 'h-5',
};

export function SkeletonLine({
  width = 'full',
  height = 'md',
}: SkeletonLineProps) {
  return (
    <div
      className={`${widthClasses[width]} ${heightClasses[height]} bg-gray-200 rounded animate-pulse`}
    />
  );
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonLine
          key={i}
          width={i === lines - 1 ? 'md' : 'full'}
          height="md"
        />
      ))}
    </div>
  );
}

export function SkeletonAvatar({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
  };

  return (
    <div
      className={`${sizeClasses[size]} rounded-full bg-gray-200 animate-pulse`}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4 animate-pulse">
      <SkeletonLine width="lg" height="md" />
      <div className="space-y-2">
        <SkeletonLine width="full" height="sm" />
        <SkeletonLine width="md" height="sm" />
      </div>
      <div className="flex gap-2">
        <SkeletonAvatar size="sm" />
        <SkeletonAvatar size="sm" />
      </div>
    </div>
  );
}

export function MeetingCardSkeleton() {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
      <div className="space-y-3">
        <SkeletonLine width="lg" height="md" />
        <SkeletonLine width="sm" height="sm" />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <SkeletonAvatar size="sm" />
          <SkeletonAvatar size="sm" />
        </div>
        <SkeletonLine width="sm" height="sm" />
      </div>
    </div>
  );
}

export function MeetingDetailSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <SkeletonLine width="lg" height="md" />
        <SkeletonLine width="md" height="sm" />
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
            <SkeletonLine width="sm" height="md" />
            <SkeletonText lines={5} />
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
            <SkeletonLine width="sm" height="md" />
            <SkeletonText lines={3} />
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-3">
            <SkeletonLine width="sm" height="md" />
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonLine key={i} width="full" height="sm" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
