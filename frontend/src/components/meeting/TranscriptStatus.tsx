'use client';

import { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Loader2,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Clock,
  Headphones,
  Zap,
} from 'lucide-react';
import { transcriptApi } from '@/services/api';
import toast from 'react-hot-toast';

interface TranscriptStatusProps {
  meetingId: string;
  hasTranscript: boolean;
  hasRecording: boolean;
  meetingStatus: string;
  onTranscriptReady?: () => void;
}

export const TranscriptStatus = ({
  meetingId,
  hasTranscript: initialHasTranscript,
  hasRecording: initialHasRecording,
  meetingStatus,
  onTranscriptReady,
}: TranscriptStatusProps) => {
  const [fetchStatus, setFetchStatus] = useState<string>('idle');
  const [error, setError] = useState<string | null>(null);
  const [lastFetchAt, setLastFetchAt] = useState<string | null>(null);
  const [hasTranscript, setHasTranscript] = useState(initialHasTranscript);
  const [hasRecording, setHasRecording] = useState(initialHasRecording);
  const [isFetching, setIsFetching] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Poll status while fetching/transcribing
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const status = await transcriptApi.getStatus(meetingId);
        setFetchStatus(status.status);
        setError(status.error);
        setLastFetchAt(status.lastFetchAt);
        setHasTranscript(status.hasTranscript);
        setHasRecording(status.hasRecording);

        if (status.hasTranscript && !hasTranscript) {
          onTranscriptReady?.();
          toast.success('Transcript is ready!');
        }
      } catch {
        // ignore polling errors
      }
    };

    checkStatus();

    // Poll while active
    if (fetchStatus === 'fetching' || fetchStatus === 'transcribing' || meetingStatus === 'processing') {
      pollRef.current = setInterval(checkStatus, 5000);
    }

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [meetingId, fetchStatus, meetingStatus]);

  const handleFetchNow = async () => {
    setIsFetching(true);
    setError(null);
    const toastId = toast.loading('Fetching transcript from Microsoft...');

    try {
      const result = await transcriptApi.fetchTranscript(meetingId);
      if (result.success) {
        toast.success(result.message, { id: toastId });
        setFetchStatus('done');
        setHasTranscript(true);
        onTranscriptReady?.();
      } else {
        toast.error(result.message, { id: toastId });
        setError(result.message);
        setFetchStatus('failed');
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Failed to fetch transcript';
      toast.error(msg, { id: toastId });
      setError(msg);
      setFetchStatus('failed');
    } finally {
      setIsFetching(false);
    }
  };

  // Status display config
  const statusConfig: Record<string, {
    icon: React.ReactNode;
    label: string;
    color: string;
    bgColor: string;
    borderColor: string;
    pulse?: boolean;
  }> = {
    idle: {
      icon: <Clock className="w-4 h-4" />,
      label: 'Waiting for meeting to end',
      color: '#a0aec0',
      bgColor: 'rgba(160,174,192,0.08)',
      borderColor: 'rgba(160,174,192,0.15)',
    },
    fetching: {
      icon: <Loader2 className="w-4 h-4 animate-spin" />,
      label: 'Fetching from Microsoft Graph...',
      color: '#0891b2',
      bgColor: 'rgba(8,145,178,0.08)',
      borderColor: 'rgba(8,145,178,0.2)',
      pulse: true,
    },
    transcribing: {
      icon: <Headphones className="w-4 h-4 animate-pulse" />,
      label: 'Transcribing recording with AI...',
      color: '#7c3aed',
      bgColor: 'rgba(124,58,237,0.08)',
      borderColor: 'rgba(124,58,237,0.2)',
      pulse: true,
    },
    done: {
      icon: <CheckCircle className="w-4 h-4" />,
      label: 'Transcript ready',
      color: '#10b981',
      bgColor: 'rgba(16,185,129,0.08)',
      borderColor: 'rgba(16,185,129,0.2)',
    },
    failed: {
      icon: <AlertCircle className="w-4 h-4" />,
      label: 'Fetch failed',
      color: '#ef4444',
      bgColor: 'rgba(239,68,68,0.08)',
      borderColor: 'rgba(239,68,68,0.2)',
    },
  };

  const currentStatus = hasTranscript
    ? statusConfig.done
    : statusConfig[fetchStatus] || statusConfig.idle;

  return (
    <div className="mm-card-in">
      <div
        className="rounded-2xl border overflow-hidden"
        style={{
          background: 'rgba(255,255,255,0.9)',
          borderColor: 'rgba(124,58,237,0.1)',
          boxShadow: '0 4px 28px rgba(124,58,237,0.07)',
        }}
      >
        {/* Header */}
        <div
          className="px-5 py-4 flex items-center gap-3"
          style={{
            background: 'linear-gradient(135deg, rgba(124,58,237,0.07), rgba(56,189,248,0.05))',
            borderBottom: '1px solid rgba(124,58,237,0.08)',
          }}
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, #7c3aed, #38bdf8)',
              boxShadow: '0 6px 18px rgba(124,58,237,0.3)',
            }}
          >
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-sm font-extrabold text-gray-900">Auto Transcript</div>
            <div className="text-xs text-gray-400 font-medium">
              Fetched automatically from Microsoft
            </div>
          </div>
        </div>

        {/* Status Card */}
        <div className="px-5 py-4">
          <div
            className="rounded-xl px-4 py-3 flex items-center gap-3 transition-all duration-300"
            style={{
              background: currentStatus.bgColor,
              border: `1.5px solid ${currentStatus.borderColor}`,
            }}
          >
            <div style={{ color: currentStatus.color }}>
              {currentStatus.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div
                className="text-xs font-bold"
                style={{ color: currentStatus.color }}
              >
                {currentStatus.label}
              </div>
              {error && fetchStatus === 'failed' && (
                <div className="text-xs text-gray-400 mt-1 truncate">
                  {error}
                </div>
              )}
              {lastFetchAt && (
                <div className="text-xs text-gray-300 mt-0.5">
                  Last checked: {new Date(lastFetchAt).toLocaleTimeString()}
                </div>
              )}
            </div>
          </div>

          {/* Indicators */}
          <div className="mt-3 flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div
                className="w-2 h-2 rounded-full"
                style={{
                  background: hasTranscript
                    ? 'linear-gradient(135deg, #10b981, #34d399)'
                    : '#e2e8f0',
                }}
              />
              <span className="text-xs font-medium text-gray-400">Transcript</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div
                className="w-2 h-2 rounded-full"
                style={{
                  background: hasRecording
                    ? 'linear-gradient(135deg, #7c3aed, #a78bfa)'
                    : '#e2e8f0',
                }}
              />
              <span className="text-xs font-medium text-gray-400">Recording</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div
                className="w-2 h-2 rounded-full"
                style={{
                  background: meetingStatus === 'completed'
                    ? 'linear-gradient(135deg, #0891b2, #22d3ee)'
                    : '#e2e8f0',
                }}
              />
              <span className="text-xs font-medium text-gray-400">AI Analysis</span>
            </div>
          </div>

          {/* Fetch Now Button */}
          {!hasTranscript && (
            <button
              onClick={handleFetchNow}
              disabled={isFetching || fetchStatus === 'fetching' || fetchStatus === 'transcribing'}
              className="mt-4 w-full py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all duration-200 mm-btn-press"
              style={{
                background: isFetching
                  ? 'rgba(124,58,237,0.08)'
                  : 'linear-gradient(135deg, rgba(124,58,237,0.12), rgba(56,189,248,0.08))',
                border: '1.5px solid rgba(124,58,237,0.2)',
                color: '#7c3aed',
                opacity: isFetching || fetchStatus === 'fetching' || fetchStatus === 'transcribing' ? 0.6 : 1,
                cursor: isFetching || fetchStatus === 'fetching' || fetchStatus === 'transcribing' ? 'not-allowed' : 'pointer',
              }}
            >
              {isFetching ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              {isFetching ? 'Fetching...' : 'Fetch Now'}
            </button>
          )}

          {/* Processing indicator */}
          {(fetchStatus === 'fetching' || fetchStatus === 'transcribing') && (
            <div className="mt-3">
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(124,58,237,0.06)' }}>
                <div
                  className="h-full rounded-full mm-shimmer"
                  style={{
                    background: fetchStatus === 'transcribing'
                      ? 'linear-gradient(90deg, #7c3aed, #a78bfa)'
                      : 'linear-gradient(90deg, #0891b2, #22d3ee)',
                    width: fetchStatus === 'transcribing' ? '75%' : '40%',
                    transition: 'width 2s ease',
                  }}
                />
              </div>
              <div className="text-xs text-gray-300 mt-1.5 text-center">
                {fetchStatus === 'transcribing'
                  ? 'Transcribing audio with OpenAI Whisper...'
                  : 'Connecting to Microsoft Graph API...'}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
