'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Bot,
  Mic,
  MicOff,
  Upload,
  Loader2,
  CheckCircle,
  AlertCircle,
  PhoneOff,
  Radio,
  ClipboardPaste,
  RefreshCw,
  FileText,
  X,
  Download,
} from 'lucide-react';
import { botApi } from '@/services/api';

interface BotPanelProps {
  meetingId: string;
  meetingUrl?: string;
  onTranscriptReady?: (transcript: string) => void;
}

export const BotPanel = ({ meetingId, meetingUrl, onTranscriptReady }: BotPanelProps) => {
  const [botStatus, setBotStatus] = useState<string>('idle');
  const [callId, setCallId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [showTranscriptInput, setShowTranscriptInput] = useState(false);
  const [transcriptText, setTranscriptText] = useState('');
  const [isSubmittingTranscript, setIsSubmittingTranscript] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isRetryingRecording, setIsRetryingRecording] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Poll bot status while active
  useEffect(() => {
    if (botStatus === 'joining' || botStatus === 'in_meeting' || botStatus === 'recording') {
      pollRef.current = setInterval(async () => {
        try {
          const status = await botApi.getStatus(meetingId);
          if (status.callState) {
            setBotStatus(status.callState.status);
            if (status.callState.status === 'completed') {
              setMessage('Meeting ended. Recording processed.');
              if (status.callState.transcript && onTranscriptReady) {
                onTranscriptReady(status.callState.transcript);
              }
              clearInterval(pollRef.current!);
            } else if (status.callState.status === 'failed') {
              setError(status.callState.error || 'Bot encountered an error');
              clearInterval(pollRef.current!);
            }
          }
        } catch {
          // Silently ignore polling errors
        }
      }, 5000);
    }

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [botStatus, meetingId, onTranscriptReady]);

  // Check initial status on mount
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const status = await botApi.getStatus(meetingId);
        if (status.active && status.callState) {
          setBotStatus(status.callState.status);
          setCallId(status.callState.callId);
        }
      } catch {
        // No active session
      }
    };
    checkStatus();
  }, [meetingId]);

  const handleJoinMeeting = async () => {
    if (!meetingUrl) {
      setError('No Teams meeting URL found for this meeting. Add a join URL to use the bot.');
      return;
    }

    setError(null);
    setMessage(null);
    setBotStatus('joining');

    try {
      const result = await botApi.joinMeeting(meetingId, meetingUrl);
      if (result.success) {
        setCallId(result.callState.callId);
        setBotStatus(result.callState.status);
        setMessage(result.message);
      } else {
        setBotStatus('idle');
        setError(result.message);
      }
    } catch (err: any) {
      setBotStatus('idle');
      setError(err.response?.data?.message || err.message || 'Failed to send bot');
    }
  };

  const handleLeaveMeeting = async () => {
    if (!callId) return;

    try {
      await botApi.leaveMeeting(callId);
      setBotStatus('leaving');
      setMessage('Bot is leaving the meeting...');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to remove bot');
    }
  };

  const handleUploadRecording = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = [
      'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/mp4',
      'audio/m4a', 'audio/webm', 'audio/ogg', 'audio/flac',
      'video/mp4', 'video/webm',
    ];
    if (!validTypes.includes(file.type) && !file.name.match(/\.(mp3|wav|m4a|mp4|webm|ogg|flac)$/i)) {
      setError('Unsupported file format. Use MP3, WAV, M4A, MP4, WebM, OGG, or FLAC.');
      return;
    }

    setIsUploading(true);
    setError(null);
    setUploadProgress(`Uploading and transcribing ${file.name}...`);

    try {
      const result = await botApi.transcribeAudio(meetingId, file);
      setUploadProgress(null);
      setIsUploading(false);

      if (result.success) {
        setMessage(result.message);
        if (result.transcript && onTranscriptReady) {
          onTranscriptReady(result.transcript);
        }
      } else {
        setError('Transcription failed');
      }
    } catch (err: any) {
      setIsUploading(false);
      setUploadProgress(null);
      setError(err.response?.data?.message || 'Upload/transcription failed');
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmitTranscript = async () => {
    if (!transcriptText.trim()) {
      setError('Please paste some transcript text first');
      return;
    }

    setIsSubmittingTranscript(true);
    setError(null);

    try {
      const result = await botApi.submitTranscript(meetingId, transcriptText.trim());
      if (result.success) {
        setMessage(result.message);
        setShowTranscriptInput(false);
        setTranscriptText('');
        if (onTranscriptReady) {
          onTranscriptReady(transcriptText.trim());
        }
      } else {
        setError('Failed to save transcript');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to submit transcript');
    } finally {
      setIsSubmittingTranscript(false);
    }
  };

  const handleRetryRecording = async () => {
    setIsRetryingRecording(true);
    setError(null);
    setMessage('Downloading recording and transcribing... this may take a few minutes.');

    try {
      const result = await botApi.retryRecordingFetch(meetingId);
      if (result.success) {
        setMessage(result.message);
      } else {
        setError(result.message);
        setMessage(null);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Recording retry failed');
      setMessage(null);
    } finally {
      setIsRetryingRecording(false);
    }
  };

  const handleRetryFetch = async () => {
    setIsRetrying(true);
    setError(null);
    setMessage(null);

    try {
      const result = await botApi.retryTranscriptFetch(meetingId);
      if (result.success) {
        setMessage(result.message);
        if (result.transcript && onTranscriptReady) {
          onTranscriptReady(result.transcript);
        }
      } else {
        setError(result.message);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Retry failed');
    } finally {
      setIsRetrying(false);
    }
  };

  const getStatusDisplay = () => {
    switch (botStatus) {
      case 'joining':
        return { icon: <Loader2 className="h-5 w-5 animate-spin text-amber-500" />, text: 'Joining meeting...', color: 'bg-amber-50 border-amber-200' };
      case 'in_meeting':
        return { icon: <Bot className="h-5 w-5 text-green-600" />, text: 'Bot is in the meeting', color: 'bg-green-50 border-green-200' };
      case 'recording':
        return { icon: <Radio className="h-5 w-5 text-red-500 animate-pulse" />, text: 'Recording in progress...', color: 'bg-red-50 border-red-200' };
      case 'processing':
        return { icon: <Loader2 className="h-5 w-5 animate-spin text-blue-500" />, text: 'Processing recording...', color: 'bg-blue-50 border-blue-200' };
      case 'completed':
        return { icon: <CheckCircle className="h-5 w-5 text-green-600" />, text: 'Recording transcribed', color: 'bg-green-50 border-green-200' };
      case 'failed':
        return { icon: <AlertCircle className="h-5 w-5 text-red-500" />, text: 'Bot error', color: 'bg-red-50 border-red-200' };
      default:
        return { icon: <Bot className="h-5 w-5 text-gray-400" />, text: 'Bot is idle', color: 'bg-gray-50 border-gray-200' };
    }
  };

  const statusDisplay = getStatusDisplay();
  const isActive = ['joining', 'in_meeting', 'recording', 'processing'].includes(botStatus);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="mb-4 text-lg font-bold text-gray-900 flex items-center gap-2">
        <Bot className="h-5 w-5 text-blue-600" />
        Meeting Bot
      </h3>

      {/* Bot Status */}
      <div className={`mb-4 flex items-center gap-3 rounded-lg border px-4 py-3 ${statusDisplay.color}`}>
        {statusDisplay.icon}
        <span className="text-sm font-medium text-gray-800">{statusDisplay.text}</span>
      </div>

      {/* Messages */}
      {message && (
        <div className="mb-4 rounded-lg bg-blue-50 px-4 py-2 text-sm text-blue-700">
          {message}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Action Buttons */}
      <div className="space-y-3">
        {/* Join / Leave */}
        {!isActive ? (
          <button
            onClick={handleJoinMeeting}
            disabled={isUploading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <Mic className="h-4 w-4" />
            Send Bot to Join &amp; Record
          </button>
        ) : (
          <button
            onClick={handleLeaveMeeting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-700 transition-colors"
          >
            <PhoneOff className="h-4 w-4" />
            Remove Bot from Meeting
          </button>
        )}

        {/* Divider */}
        <div className="relative py-2">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200"></div>
          </div>
          <div className="relative flex justify-center">
            <span className="bg-white px-3 text-xs text-gray-500">or add transcript manually</span>
          </div>
        </div>

        {/* Manual Transcript Options */}
        <div className="space-y-2">
          {/* Fetch Recording — downloads MP4 and transcribes with Whisper */}
          <button
            onClick={handleRetryRecording}
            disabled={isActive || isRetryingRecording}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-blue-300 bg-blue-50 px-3 py-2.5 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50 transition-colors"
          >
            {isRetryingRecording ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {isRetryingRecording ? 'Downloading & Transcribing...' : 'Fetch Recording & Transcribe'}
          </button>

          <div className="grid grid-cols-2 gap-2">
            {/* Retry Transcript Fetch from Microsoft */}
            <button
              onClick={handleRetryFetch}
              disabled={isActive || isRetrying || isSubmittingTranscript}
              className="flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {isRetrying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Retry Transcript
            </button>

            {/* Paste Transcript */}
            <button
              onClick={() => setShowTranscriptInput(!showTranscriptInput)}
              disabled={isActive || isSubmittingTranscript}
              className="flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              <ClipboardPaste className="h-4 w-4" />
              Paste Transcript
            </button>
          </div>
        </div>

        {/* Transcript Text Input Area */}
        {showTranscriptInput && (
          <div className="mt-2 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-gray-600">
                Paste your transcript below
              </label>
              <button
                onClick={() => {
                  setShowTranscriptInput(false);
                  setTranscriptText('');
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <textarea
              value={transcriptText}
              onChange={(e) => setTranscriptText(e.target.value)}
              placeholder="Paste the meeting transcript text here...&#10;&#10;You can copy it from Teams (click '...' → 'View transcript' in the meeting chat) or from any other source."
              rows={6}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-y"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">
                {transcriptText.length > 0
                  ? `${transcriptText.length.toLocaleString()} characters`
                  : 'No text yet'}
              </span>
              <button
                onClick={handleSubmitTranscript}
                disabled={isSubmittingTranscript || !transcriptText.trim()}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {isSubmittingTranscript ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4" />
                    Save & Process
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Divider */}
        <div className="relative py-2">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200"></div>
          </div>
          <div className="relative flex justify-center">
            <span className="bg-white px-3 text-xs text-gray-500">or upload audio file</span>
          </div>
        </div>

        {/* Upload Recording */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isActive || isUploading}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          {isUploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {uploadProgress || 'Processing...'}
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" />
              Upload Recording for Transcription
            </>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".mp3,.wav,.m4a,.mp4,.webm,.ogg,.flac"
          className="hidden"
          onChange={handleUploadRecording}
        />

        <p className="text-xs text-gray-500 text-center">
          Supported: MP3, WAV, M4A, MP4, WebM, OGG, FLAC (max 500MB)
        </p>
      </div>
    </div>
  );
};

export default BotPanel;
