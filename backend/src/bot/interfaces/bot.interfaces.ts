/**
 * Bot module interfaces for Teams meeting bot
 */

export interface BotCallState {
  callId: string;
  meetingId: string;         // MongoDB meeting ID
  joinUrl: string;
  status: BotStatus;
  startedAt: Date;
  endedAt?: Date;
  recordingPath?: string;
  transcript?: string;
  error?: string;
}

export enum BotStatus {
  JOINING = 'joining',
  IN_MEETING = 'in_meeting',
  RECORDING = 'recording',
  LEAVING = 'leaving',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export interface JoinMeetingRequest {
  meetingUrl: string;        // Teams meeting join URL
  meetingId: string;         // MongoDB meeting ID
  displayName?: string;      // Bot display name in meeting
}

export interface TeamsNotificationPayload {
  value: TeamsNotification[];
}

export interface TeamsNotification {
  changeType: string;
  resource: string;
  resourceData: {
    '@odata.type': string;
    '@odata.id'?: string;
    id?: string;
    state: string;
    resultInfo?: {
      code: string | number;
      subcode: string | number;
      message: string;
    };
    recordingStatus?: string;
    realTimeActivityFeedDetails?: {
      links?: {
        getArtifacts?: string;
        postArtifacts?: string;
        [key: string]: string | undefined;
      };
    };
    [key: string]: any;
  };
}

export interface GraphCallResponse {
  '@odata.type': string;
  id: string;
  state: string;
  direction: string;
  callbackUri: string;
  source: {
    '@odata.type': string;
    identity: {
      application: {
        id: string;
        displayName: string;
      };
    };
  };
  targets: any[];
  chatInfo?: {
    threadId: string;
    messageId: string;
  };
  meetingInfo?: {
    joinUrl: string;
  };
}

export interface TranscriptionResult {
  text: string;
  language: string;
  duration: number;
  segments: TranscriptionSegment[];
}

export interface TranscriptionSegment {
  id: number;
  start: number;
  end: number;
  text: string;
  speaker?: string;
}

export interface RecordingInfo {
  callId: string;
  recordingId: string;
  status: string;
  contentLocation?: string;
}
