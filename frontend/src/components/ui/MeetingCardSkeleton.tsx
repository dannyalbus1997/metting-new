'use client';

export const MeetingCardSkeleton = () => {
  return (
    <div className="card p-5">
      {/* Header Skeleton */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <div className="h-6 w-3/4 animate-skeleton rounded bg-gray-200"></div>
        </div>
        <div className="h-6 w-20 animate-skeleton rounded-full bg-gray-200"></div>
      </div>

      {/* Date and Time Skeleton */}
      <div className="mb-4 space-y-2">
        <div className="h-4 w-1/2 animate-skeleton rounded bg-gray-200"></div>
        <div className="h-3 w-2/5 animate-skeleton rounded bg-gray-200"></div>
      </div>

      {/* Participants Skeleton */}
      <div className="mb-4 flex items-center gap-2">
        <div className="flex -space-x-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-7 w-7 animate-skeleton rounded-full bg-gray-200"
            ></div>
          ))}
        </div>
      </div>

      {/* Action Items Skeleton */}
      <div className="border-t border-gray-200 pt-4">
        <div className="h-4 w-1/3 animate-skeleton rounded bg-gray-200"></div>
      </div>
    </div>
  );
};

export default MeetingCardSkeleton;
