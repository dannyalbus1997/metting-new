'use client';

export const MeetingDetailSkeleton = () => {
  return (
    <div className="flex h-full flex-col bg-gray-50">
      {/* Back Button */}
      <div className="border-b border-gray-200 bg-white px-6 py-4 sm:px-8">
        <div className="h-5 w-32 animate-skeleton rounded bg-gray-200"></div>
      </div>

      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-6 sm:px-8">
        <div className="mb-4 space-y-3">
          <div className="h-8 w-2/3 animate-skeleton rounded bg-gray-200"></div>
          <div className="h-5 w-1/2 animate-skeleton rounded bg-gray-200"></div>
        </div>

        {/* Meeting Info Grid */}
        <div className="mb-6 grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-4 w-20 animate-skeleton rounded bg-gray-200"></div>
              <div className="h-5 w-1/2 animate-skeleton rounded bg-gray-200"></div>
            </div>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-10 w-40 animate-skeleton rounded-lg bg-gray-200"
            ></div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 bg-white">
        <div className="flex px-6 sm:px-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 w-24 animate-skeleton rounded bg-gray-200"></div>
          ))}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto px-6 py-6 sm:px-8">
        <div className="max-w-4xl space-y-4 rounded-lg bg-white p-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-4 animate-skeleton rounded bg-gray-200"></div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MeetingDetailSkeleton;
