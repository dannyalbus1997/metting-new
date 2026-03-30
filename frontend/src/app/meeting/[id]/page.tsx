'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  fetchMeetingById,
  processMeeting,
  clearError as clearMeetingError,
} from '@/store/slices/meetingSlice';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { MeetingDetailSkeleton } from '@/components/ui/MeetingDetailSkeleton';
import {
  ArrowLeft,
  Copy,
  Download,
  AlertCircle,
  Loader2,
  CheckCircle,
  Clock,
  Users,
  Languages,
} from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { TranscriptStatus } from '@/components/meeting/TranscriptStatus';
import { meetingsApi } from '@/services/api';
import toast from 'react-hot-toast';

const RecordingPlayer = ({ meetingId }: { meetingId: string }) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loadingRec, setLoadingRec] = useState(false);
  const [recError, setRecError] = useState<string | null>(null);

  const loadRecording = async () => {
    setLoadingRec(true);
    setRecError(null);
    try {
      const token = localStorage.getItem('accessToken');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
      const response = await fetch(`${apiUrl}/meetings/${meetingId}/recording-stream`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error(response.status === 404 ? 'Recording not found or expired' : `Failed to load recording (${response.status})`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setBlobUrl(url);
    } catch (err: any) {
      setRecError(err.message || 'Failed to load recording');
    } finally {
      setLoadingRec(false);
    }
  };

  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  if (blobUrl) {
    return (
      <div>
        <p className="mb-4 text-sm text-gray-600">
          Streamed from Microsoft Graph on demand — nothing stored on our servers.
        </p>
        <video controls className="w-full rounded-lg bg-black" src={blobUrl}>
          Your browser does not support the video element.
        </video>
      </div>
    );
  }

  return (
    <div className="text-center py-8">
      {recError && (
        <p className="mb-4 text-sm text-red-600">{recError}</p>
      )}
      <button
        onClick={loadRecording}
        disabled={loadingRec}
        className="btn btn-primary gap-2"
      >
        {loadingRec ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading recording...
          </>
        ) : (
          'Load Recording'
        )}
      </button>
      <p className="mt-3 text-xs text-gray-500">
        Recording is fetched from Microsoft Graph when you click play. Large recordings may take a moment.
      </p>
    </div>
  );
};

const MeetingDetailPage = () => {
  const router = useRouter();
  const params = useParams();
  const dispatch = useAppDispatch();
  const { isAuthenticated } = useAppSelector((state) => state.auth);
  const { selectedMeeting, loading, error } = useAppSelector(
    (state) => state.meetings
  );

  const [activeTab, setActiveTab] = useState<
    'summary' | 'actionItems' | 'decisions' | 'transcript' | 'recording' | 'productivity'
  >('summary');
  const [isProcessing, setIsProcessing] = useState(false);
  const [copiedNotification, setCopiedNotification] = useState(false);
  const [translatedTranscript, setTranslatedTranscript] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);

  const meetingId = params.id as string;

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, router]);

  // Fetch meeting on mount
  useEffect(() => {
    if (isAuthenticated && meetingId) {
      dispatch(fetchMeetingById(meetingId) as any);
    }
  }, [dispatch, isAuthenticated, meetingId]);

  // Load saved translation from meeting data and show English by default
  useEffect(() => {
    if (selectedMeeting?.translatedTranscript && !translatedTranscript) {
      setTranslatedTranscript(selectedMeeting.translatedTranscript);
      setShowTranslation(true); // Show English by default
    }
  }, [selectedMeeting?.translatedTranscript]);

  // Auto-poll while AI processing is pending or in progress
  // This ensures the page refreshes when background processing completes
  useEffect(() => {
    if (!isAuthenticated || !meetingId) return;

    const status = selectedMeeting?.aiProcessingStatus;
    const meetingStatus = selectedMeeting?.status;

    // Poll if: no summary yet, or status indicates processing, or meeting is pending
    const shouldPoll =
      status === 'pending' ||
      status === 'processing' ||
      (meetingStatus === 'pending' && !selectedMeeting?.notes) ||
      (meetingStatus === 'processing');

    if (!shouldPoll) return;

    const interval = setInterval(() => {
      dispatch(fetchMeetingById(meetingId) as any);
    }, 5000);

    return () => clearInterval(interval);
  }, [
    dispatch,
    isAuthenticated,
    meetingId,
    selectedMeeting?.aiProcessingStatus,
    selectedMeeting?.status,
    selectedMeeting?.notes,
  ]);

  // Handle re-process meeting
  const handleReprocess = async () => {
    if (!meetingId) return;

    setIsProcessing(true);
    const toastId = toast.loading('Re-running AI analysis...');
    try {
      await dispatch(processMeeting(meetingId) as any).unwrap();
      await dispatch(fetchMeetingById(meetingId) as any);
      toast.success('AI analysis complete!', { id: toastId });
    } catch (err) {
      console.error('Processing failed:', err);
      toast.error('AI processing failed. Try again.', { id: toastId });
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle copy summary
  const handleCopySummary = () => {
    if (!selectedMeeting?.notes) {
      toast.error('No summary to copy');
      return;
    }

    navigator.clipboard.writeText(selectedMeeting.notes);
    toast.success('Summary copied to clipboard');
  };

  // Handle export
  const handleExport = () => {
    if (!selectedMeeting) return;

    const content = `
Meeting: ${selectedMeeting.title}
Date: ${format(new Date(selectedMeeting.startTime), 'PPpp')}
Duration: ${selectedMeeting.duration} minutes
Participants: ${selectedMeeting.participants.map((p) => p.displayName).join(', ')}

SUMMARY
${selectedMeeting.notes || 'No summary available'}

ACTION ITEMS
${
  selectedMeeting.actionItems
    ?.map((item) => `- ${item.title} (${item.assignee.displayName}, Due: ${item.dueDate})`)
    .join('\n') || 'No action items'
}

KEY POINTS
${selectedMeeting.keyPoints?.map((point) => `- ${point}`).join('\n') || 'No key points'}
    `.trim();

    const blob = new Blob([content], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedMeeting.title
      .toLowerCase()
      .replace(/\s+/g, '-')}-${format(new Date(selectedMeeting.startTime), 'yyyy-MM-dd')}.txt`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    toast.success('Meeting exported successfully');
  };

  // Handle translate transcript
  const handleTranslate = async () => {
    if (!meetingId || translatedTranscript) {
      setShowTranslation(true);
      return;
    }
    setIsTranslating(true);
    const toastId = toast.loading('Translating transcript...');
    try {
      const result = await meetingsApi.translateTranscript(meetingId, 'English');
      setTranslatedTranscript(result.translatedTranscript);
      setShowTranslation(true);
      toast.success('Translation complete!', { id: toastId });
    } catch (err) {
      console.error('Translation failed:', err);
      toast.error('Translation failed. Try again.', { id: toastId });
    } finally {
      setIsTranslating(false);
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  if (loading && !selectedMeeting) {
    return (
      <DashboardLayout>
        <MeetingDetailSkeleton />
      </DashboardLayout>
    );
  }

  if (!selectedMeeting) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-16">
          <AlertCircle className="mb-4 h-12 w-12 text-gray-400" />
          <h1 className="mb-2 text-2xl font-bold text-gray-900">
            Meeting not found
          </h1>
          <p className="mb-6 text-gray-600">
            The meeting you're looking for doesn't exist.
          </p>
          <Link href="/dashboard" className="btn btn-primary">
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'badge-success';
      case 'in_progress':
        return 'badge-warning';
      case 'scheduled':
        return 'badge-primary';
      default:
        return 'badge-gray';
    }
  };

  const getProcessingStatusIcon = () => {
    switch (selectedMeeting.aiProcessingStatus) {
      case 'processing':
        return <Loader2 className="h-5 w-5 animate-spin text-amber-600" />;
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'failed':
        return <AlertCircle className="h-5 w-5 text-red-600" />;
      default:
        return <Clock className="h-5 w-5 text-gray-400" />;
    }
  };

  return (
    <DashboardLayout>
      <div className="flex h-full flex-col bg-gray-50">
        {/* Back Button */}
        <div className="border-b border-gray-200 bg-white px-6 py-4 sm:px-8">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 transition-smooth"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </Link>
        </div>

        {/* Header */}
        <div className="border-b border-gray-200 bg-white px-6 py-6 sm:px-8 mm-slide-up">
          <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex-1">
              <h1 className="mb-2 text-3xl font-bold text-gray-900">
                {selectedMeeting.title}
              </h1>
              <p className="text-gray-600">
                {format(new Date(selectedMeeting.startTime), 'PPpp')} •{' '}
                {selectedMeeting.duration} minutes
              </p>
            </div>
            <div className="flex gap-2">
              <span className={`badge ${getStatusBadgeColor(selectedMeeting.status)}`}>
                {selectedMeeting.status.replace('_', ' ')}
              </span>
            </div>
          </div>

          {/* Meeting Info */}
          <div className="mb-6 grid gap-4 md:grid-cols-3">
            {/* Location/Online */}
            <div>
              <p className="text-sm font-medium text-gray-700">Location</p>
              <p className="text-gray-600">
                {selectedMeeting.isOnline ? '📹 Teams Meeting' : selectedMeeting.location || 'TBD'}
              </p>
            </div>

            {/* Participants */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-1">Participants</p>
              <div className="flex gap-2">
                {(selectedMeeting.participants || []).slice(0, 3).map((participant: any, idx: number) => {
                  const displayName = participant.displayName || participant.name || participant.email || '?';
                  const initials = displayName
                    .split(' ')
                    .map((n: string) => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2);
                  return (
                    <div
                      key={participant.id || participant.email || idx}
                      title={displayName}
                      className="flex-shrink-0 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 h-8 w-8 flex items-center justify-center text-xs font-bold text-white mm-avatar-hover"
                    >
                      {initials}
                    </div>
                  );
                })}
                {selectedMeeting.participants.length > 3 && (
                  <div className="flex-shrink-0 rounded-full bg-gray-300 h-8 w-8 flex items-center justify-center text-xs font-bold text-gray-700">
                    +{selectedMeeting.participants.length - 3}
                  </div>
                )}
              </div>
            </div>

            {/* AI Processing Status */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-1">AI Analysis</p>
              <div className="flex items-center gap-2">
                {getProcessingStatusIcon()}
                <span className="text-gray-600 text-sm">
                  {selectedMeeting.aiProcessingStatus === 'processing' && 'Processing...'}
                  {selectedMeeting.aiProcessingStatus === 'completed' && 'Completed'}
                  {selectedMeeting.aiProcessingStatus === 'failed' && 'Failed'}
                  {selectedMeeting.aiProcessingStatus === 'pending' && 'Pending'}
                </span>
              </div>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 flex gap-3 rounded-lg bg-red-50 p-4 text-red-700">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-medium">{error}</p>
                <button
                  onClick={() => {
                    dispatch(clearMeetingError());
                    handleReprocess();
                  }}
                  className="mt-2 text-sm font-medium underline hover:no-underline"
                >
                  Try again
                </button>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2 mm-slide-up mm-slide-up-3">
            <button
              onClick={handleCopySummary}
              className="btn btn-secondary gap-2 mm-btn-press"
            >
              <Copy className="h-4 w-4" />
              Copy Summary
            </button>
            <button onClick={handleExport} className="btn btn-secondary gap-2 mm-btn-press">
              <Download className="h-4 w-4" />
              Export
            </button>
            <button
              onClick={handleReprocess}
              disabled={isProcessing}
              className="btn gap-2 mm-btn-press text-white shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6, #a855f7)' }}
            >
              {isProcessing && <Loader2 className="h-4 w-4 animate-spin" />}
              Re-run AI Processing
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 bg-white mm-slide-up mm-slide-up-2">
          <div className="flex px-6 sm:px-8">
            {[
              { id: 'summary', label: 'Summary' },
              { id: 'actionItems', label: 'Action Items' },
              { id: 'decisions', label: 'Decisions' },
              { id: 'transcript', label: 'Transcript' },
              ...(selectedMeeting.productivity ? [{ id: 'productivity', label: `Productivity ${selectedMeeting.productivity.score}%` }] : []),
              ...(selectedMeeting.hasRecording ? [{ id: 'recording', label: 'Recording' }] : []),
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`border-b-2 px-4 py-4 font-medium transition-smooth ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto px-6 py-6 sm:px-8">
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Main Content - Tabs */}
            <div className="flex-1 min-w-0">
              {/* Summary Tab */}
              {activeTab === 'summary' && (
                <div className="max-w-4xl mm-fade-tab">
                  <div className="rounded-lg bg-white p-6 mm-card-in">
                    {selectedMeeting.notes ? (
                      <div className="prose prose-sm max-w-none text-gray-700">
                        {selectedMeeting.notes.split('\n').map((line, i) => (
                          <p key={i}>{line}</p>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500">
                        No summary available. AI processing may still be in progress.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Action Items Tab */}
              {activeTab === 'actionItems' && (
                <div className="max-w-4xl mm-fade-tab">
                  {selectedMeeting.actionItems && selectedMeeting.actionItems.length > 0 ? (
                    <div className="space-y-3 mm-stagger">
                      {selectedMeeting.actionItems.map((item) => (
                        <div
                          key={item.id}
                          className="flex gap-4 rounded-lg bg-white p-4 mm-card-in mm-hover-lift"
                        >
                          <input
                            type="checkbox"
                            checked={item.status === 'completed'}
                            readOnly
                            className="mt-1 h-5 w-5 rounded border-gray-300 accent-blue-600"
                          />
                          <div className="flex-1">
                            <p
                              className={`font-medium ${
                                item.status === 'completed'
                                  ? 'line-through text-gray-400'
                                  : 'text-gray-900'
                              }`}
                            >
                              {item.title}
                            </p>
                            {item.description && (
                              <p className="mt-1 text-sm text-gray-600">
                                {item.description}
                              </p>
                            )}
                            <div className="mt-2 flex flex-wrap gap-2">
                              <span className="inline-flex items-center gap-1 text-sm text-gray-600">
                                <Users className="h-4 w-4" />
                                {item.assignee.displayName}
                              </span>
                              <span className="inline-flex items-center gap-1 text-sm text-gray-600">
                                <Clock className="h-4 w-4" />
                                {item.dueDate && !isNaN(new Date(item.dueDate).getTime())
                                  ? format(new Date(item.dueDate), 'MMM d, yyyy')
                                  : item.dueDate || 'No due date'}
                              </span>
                              <span
                                className={`badge ${
                                  item.status === 'completed'
                                    ? 'badge-success'
                                    : item.status === 'in_progress'
                                      ? 'badge-warning'
                                      : 'badge-primary'
                                }`}
                              >
                                {item.status.replace('_', ' ')}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg bg-white p-6 text-center">
                      <p className="text-gray-500">No action items found.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Decisions Tab */}
              {activeTab === 'decisions' && (
                <div className="max-w-4xl mm-fade-tab">
                  {selectedMeeting.keyPoints && selectedMeeting.keyPoints.length > 0 ? (
                    <div className="space-y-3 mm-stagger">
                      {selectedMeeting.keyPoints.map((decision, i) => (
                        <div key={i} className="flex gap-4 rounded-lg bg-white p-4 mm-card-in mm-hover-lift">
                          <div className="flex-shrink-0 rounded-full bg-blue-100 h-8 w-8 flex items-center justify-center font-semibold text-blue-600">
                            {i + 1}
                          </div>
                          <p className="pt-1 text-gray-700">{decision}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg bg-white p-6 text-center">
                      <p className="text-gray-500">No decisions found.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Transcript Tab */}
              {activeTab === 'transcript' && (
                <div className="max-w-4xl mm-fade-tab">
                  <div className="rounded-lg bg-white p-6 mm-card-in">
                    {selectedMeeting.transcript ? (
                      <>
                        {/* Translate controls */}
                        <div className="mb-4 flex items-center gap-3 border-b border-gray-100 pb-4">
                          {translatedTranscript ? (
                            <>
                              <span className="text-sm text-gray-500">
                                {showTranslation ? 'Showing: English' : 'Showing: Original'}
                              </span>
                              <button
                                onClick={() => setShowTranslation(!showTranslation)}
                                className="btn btn-secondary gap-2 text-sm"
                              >
                                <Languages className="h-4 w-4" />
                                {showTranslation ? 'Show Original' : 'Show English'}
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={handleTranslate}
                              disabled={isTranslating}
                              className="btn btn-secondary gap-2 text-sm"
                            >
                              {isTranslating ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  Translating...
                                </>
                              ) : (
                                <>
                                  <Languages className="h-4 w-4" />
                                  Translate to English
                                </>
                              )}
                            </button>
                          )}
                        </div>
                        <div className="max-h-96 overflow-y-auto whitespace-pre-wrap text-sm text-gray-700">
                          {showTranslation && translatedTranscript
                            ? translatedTranscript
                            : selectedMeeting.transcript}
                        </div>
                      </>
                    ) : (
                      <p className="text-gray-500">No transcript available.</p>
                    )}
                  </div>
                </div>
              )}

              {/* Productivity Tab */}
              {activeTab === 'productivity' && selectedMeeting.productivity && (
                <div className="max-w-4xl space-y-6 mm-fade-tab">
                  {/* Score Card */}
                  <div className="rounded-lg bg-white p-6 mm-card-in">
                    <div className="flex items-center gap-6">
                      <div className="relative h-28 w-28 flex-shrink-0">
                        <svg className="h-28 w-28 -rotate-90" viewBox="0 0 100 100">
                          <circle cx="50" cy="50" r="42" fill="none" stroke="#e5e7eb" strokeWidth="8" />
                          <circle
                            cx="50" cy="50" r="42" fill="none"
                            stroke={
                              selectedMeeting.productivity.score >= 80 ? '#22c55e' :
                              selectedMeeting.productivity.score >= 60 ? '#3b82f6' :
                              selectedMeeting.productivity.score >= 40 ? '#f59e0b' : '#ef4444'
                            }
                            strokeWidth="8"
                            strokeLinecap="round"
                            strokeDasharray={`${selectedMeeting.productivity.score * 2.64} 264`}
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-2xl font-bold text-gray-900">{selectedMeeting.productivity.score}%</span>
                        </div>
                      </div>
                      <div>
                        <h3 className="text-xl font-semibold text-gray-900">{selectedMeeting.productivity.label}</h3>
                        <p className="mt-1 text-sm text-gray-600">Overall meeting productivity score</p>
                      </div>
                    </div>
                  </div>

                  {/* Breakdown */}
                  <div className="rounded-lg bg-white p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Score Breakdown</h3>
                    <div className="space-y-4">
                      {[
                        { label: 'On-Topic Focus', value: selectedMeeting.productivity.breakdown.onTopicScore, color: 'bg-blue-500' },
                        { label: 'Decisions Made', value: selectedMeeting.productivity.breakdown.decisionsScore, color: 'bg-green-500' },
                        { label: 'Action Items Quality', value: selectedMeeting.productivity.breakdown.actionItemsScore, color: 'bg-purple-500' },
                        { label: 'Participation Balance', value: selectedMeeting.productivity.breakdown.participationScore, color: 'bg-orange-500' },
                        { label: 'Time Efficiency', value: selectedMeeting.productivity.breakdown.timeEfficiency, color: 'bg-teal-500' },
                      ].map((item) => (
                        <div key={item.label}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-700">{item.label}</span>
                            <span className="font-medium text-gray-900">{item.value}%</span>
                          </div>
                          <div className="h-2.5 rounded-full bg-gray-200 overflow-hidden">
                            <div
                              className={`h-2.5 rounded-full ${item.color} mm-bar-animate relative overflow-hidden mm-shimmer`}
                              style={{ width: `${item.value}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Highlights & Improvements */}
                  <div className="grid gap-6 md:grid-cols-2">
                    {selectedMeeting.productivity.highlights.length > 0 && (
                      <div className="rounded-lg bg-white p-6">
                        <h3 className="text-lg font-semibold text-green-700 mb-3">What went well</h3>
                        <ul className="space-y-2">
                          {selectedMeeting.productivity.highlights.map((h: string, i: number) => (
                            <li key={i} className="flex gap-2 text-sm text-gray-700">
                              <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                              {h}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {selectedMeeting.productivity.improvements.length > 0 && (
                      <div className="rounded-lg bg-white p-6">
                        <h3 className="text-lg font-semibold text-amber-700 mb-3">Suggestions</h3>
                        <ul className="space-y-2">
                          {selectedMeeting.productivity.improvements.map((imp: string, i: number) => (
                            <li key={i} className="flex gap-2 text-sm text-gray-700">
                              <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                              {imp}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Recording Tab */}
              {activeTab === 'recording' && (
                <div className="max-w-4xl mm-fade-tab">
                  <div className="rounded-lg bg-white p-6 mm-card-in">
                    {selectedMeeting.hasRecording ? (
                      <RecordingPlayer meetingId={meetingId} />
                    ) : (
                      <p className="text-gray-500">No recording available for this meeting.</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Right Sidebar - Transcript Status */}
            <div className="w-full lg:w-80 flex-shrink-0 mm-slide-right">
              <TranscriptStatus
                meetingId={meetingId}
                hasTranscript={!!selectedMeeting.transcript}
                hasRecording={!!selectedMeeting.hasRecording}
                meetingStatus={selectedMeeting.status || 'pending'}
                onTranscriptReady={() => {
                  dispatch(fetchMeetingById(meetingId) as any);
                  setActiveTab('transcript');
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default MeetingDetailPage;
