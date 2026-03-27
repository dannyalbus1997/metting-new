'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  fetchMeetings,
  syncMeetings,
  setSearchQuery,
  clearError as clearMeetingError,
} from '@/store/slices/meetingSlice';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { MeetingCard } from '@/components/meeting/MeetingCard';
import { MeetingCardSkeleton } from '@/components/ui/MeetingCardSkeleton';
import { AlertCircle, RefreshCw, Search } from 'lucide-react';
import Link from 'next/link';

const DashboardPage = () => {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { isAuthenticated } = useAppSelector((state) => state.auth);
  const { meetings, loading, error, pagination, searchQuery } = useAppSelector(
    (state) => state.meetings
  );

  const [isSyncing, setIsSyncing] = useState(false);
  const [searchInput, setSearchInput] = useState(searchQuery);
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, router]);

  // Fetch meetings on mount
  useEffect(() => {
    if (isAuthenticated) {
      dispatch(
        fetchMeetings({
          page: 1,
          limit: 12,
        }) as any
      );
    }
  }, [dispatch, isAuthenticated]);

  // Handle search with debounce
  const handleSearch = useCallback(
    (query: string) => {
      setSearchInput(query);

      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      const timer = setTimeout(() => {
        dispatch(setSearchQuery(query));
        dispatch(
          fetchMeetings({
            page: 1,
            limit: 12,
            search: query || undefined,
          }) as any
        );
      }, 500);

      setDebounceTimer(timer);
    },
    [debounceTimer, dispatch]
  );

  // Handle sync meetings from Microsoft Graph, then refresh list
  const handleSync = async () => {
    setIsSyncing(true);
    try {
      // First, call the sync endpoint to pull from Microsoft Calendar
      await dispatch(syncMeetings() as any).unwrap();

      // Then refresh the meetings list
      await dispatch(
        fetchMeetings({
          page: 1,
          limit: 12,
          search: searchQuery || undefined,
        }) as any
      );
    } catch (err) {
      console.error('Sync failed:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Handle pagination
  const handleNextPage = () => {
    if (pagination?.hasNextPage) {
      dispatch(
        fetchMeetings({
          page: (pagination?.page || 1) + 1,
          limit: pagination?.limit || 12,
          search: searchQuery || undefined,
        }) as any
      );
    }
  };

  const handlePreviousPage = () => {
    if (pagination?.hasPreviousPage) {
      dispatch(
        fetchMeetings({
          page: (pagination?.page || 1) - 1,
          limit: pagination?.limit || 12,
          search: searchQuery || undefined,
        }) as any
      );
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <DashboardLayout>
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="border-b border-gray-200 bg-white px-6 py-6 sm:px-8">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900">Your Meetings</h1>
            <p className="mt-1 text-gray-600">
              View and analyze all your upcoming and past meetings
            </p>
          </div>

          {/* Search and Controls */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search meetings..."
                value={searchInput}
                onChange={(e) => handleSearch(e.target.value)}
                className="input pl-10 w-full"
              />
            </div>

            {/* Sync Button */}
            <button
              onClick={handleSync}
              disabled={isSyncing || loading}
              className="btn btn-secondary gap-2 whitespace-nowrap"
            >
              <RefreshCw
                className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`}
              />
              {isSyncing ? 'Syncing...' : 'Sync'}
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto bg-gray-50 px-6 py-6 sm:px-8">
          {/* Error State */}
          {error && (
            <div className="mb-6 flex gap-3 rounded-lg bg-red-50 p-4 text-red-700">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-medium">{error}</p>
                <button
                  onClick={() => {
                    dispatch(clearMeetingError());
                    handleSync();
                  }}
                  className="mt-2 text-sm font-medium underline hover:no-underline"
                >
                  Try again
                </button>
              </div>
            </div>
          )}

          {/* Loading State */}
          {loading && meetings?.length === 0 ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <MeetingCardSkeleton key={i} />
              ))}
            </div>
          ) : meetings?.length === 0 ? (
            /* Empty State */
            <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 py-12">
              <div className="mb-4 rounded-full bg-gray-100 p-3">
                <Search className="h-6 w-6 text-gray-400" />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-gray-900">
                No meetings found
              </h3>
              <p className="mb-6 text-gray-600">
                {searchQuery
                  ? 'Try adjusting your search terms'
                  : 'Your meetings will appear here once synced from your calendar'}
              </p>
              <button
                onClick={handleSync}
                className="btn btn-primary gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Sync Meetings
              </button>
            </div>
          ) : (
            /* Meetings Grid */
            <>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {meetings?.map((meeting) => (
                  <Link
                    key={meeting.id}
                    href={`/meeting/${meeting.id}`}
                  >
                    <MeetingCard meeting={meeting} />
                  </Link>
                ))}
              </div>

              {/* Loading indicator for pagination */}
              {loading && meetings?.length > 0 && (
                <div className="flex justify-center py-6">
                  <div className="inline-flex items-center gap-2 text-gray-600">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600"></div>
                    Loading...
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Pagination */}
        {!loading && meetings?.length > 0 && pagination && (
          <div className="border-t border-gray-200 bg-white px-6 py-4 sm:px-8">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600">
                Page {pagination.page} of {pagination.totalPages} (
                {pagination.total} total)
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handlePreviousPage}
                  disabled={!pagination.hasPreviousPage || loading}
                  className="btn btn-secondary disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={handleNextPage}
                  disabled={!pagination.hasNextPage || loading}
                  className="btn btn-secondary disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default DashboardPage;
