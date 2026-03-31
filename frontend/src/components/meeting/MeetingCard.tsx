'use client';

import { format } from 'date-fns';
import { CheckCircle, Clock, AlertCircle, Loader2 } from 'lucide-react';
import { Meeting } from '@/types';

interface MeetingCardProps {
  meeting: Meeting;
}

export const MeetingCard = ({ meeting }: MeetingCardProps) => {
  const startDate = new Date(meeting.startTime);
  const formattedDate = format(startDate, 'MMM d, yyyy');
  const formattedTime = format(startDate, 'h:mm a');

  const participants = meeting.participants || [];
  const displayParticipants = participants.slice(0, 3);
  const remainingCount = Math.max(0, participants.length - 3);

  const getStatusIcon = () => {
    switch (meeting.aiProcessingStatus || meeting.status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'processing':
        return <Loader2 className="h-4 w-4 animate-spin text-amber-600" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusLabel = () => {
    switch (meeting.aiProcessingStatus || meeting.status) {
      case 'completed':
        return 'Analyzed';
      case 'processing':
        return 'Analyzing...';
      case 'failed':
        return 'Failed';
      default:
        return 'Pending';
    }
  };

  return (
    <div className="group card-hover flex h-full flex-col overflow-hidden p-5 transition-smooth">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <h3 className="flex-1 text-lg font-bold text-gray-900 truncate group-hover:text-indigo-600">
          {meeting.title}
        </h3>
        <div className="flex items-center gap-2 rounded-full bg-gray-50 px-3 py-1 group-hover:bg-indigo-50">
          {getStatusIcon()}
          <span className="text-xs font-medium text-gray-700 whitespace-nowrap">
            {getStatusLabel()}
          </span>
        </div>
      </div>

      {/* Date and Time */}
      <div className="mb-4 text-sm text-gray-600">
        <p className="font-medium">{formattedDate}</p>
        <p className="text-xs text-gray-500">{formattedTime}</p>
      </div>

      {/* Participants */}
      <div className="mb-4 mt-auto flex items-center gap-2">
        <div className="flex -space-x-2">
          {displayParticipants.map((participant: any, idx: number) => {
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
                className="flex-shrink-0 rounded-full bg-gradient-to-br from-indigo-400 to-purple-600 h-7 w-7 flex items-center justify-center text-xs font-bold text-white border-2 border-white"
              >
                {initials}
              </div>
            );
          })}
        </div>
        {remainingCount > 0 && (
          <span className="text-xs font-medium text-gray-600">
            +{remainingCount}
          </span>
        )}
      </div>

      {/* Action Items Count */}
      <div className="border-t border-gray-200 pt-4">
        <div className="flex items-center gap-2 text-sm">
          {meeting.actionItems && meeting.actionItems.length > 0 ? (
            <>
              <CheckCircle className="h-4 w-4 text-indigo-600" />
              <span className="font-semibold text-gray-900">
                {meeting.actionItems.length} action items
              </span>
            </>
          ) : (
            <>
              <Clock className="h-4 w-4 text-gray-400" />
              <span className="font-medium text-gray-400">
                No action items
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default MeetingCard;
