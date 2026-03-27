/**
 * Microsoft Graph API TypeScript Interfaces
 * Defines types for Microsoft authentication, users, events, and transcripts
 */

export interface MicrosoftTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

export interface MicrosoftUserProfile {
  id: string;
  displayName: string;
  userPrincipalName: string;
  mail: string;
  jobTitle?: string;
  officeLocation?: string;
  mobilePhone?: string;
  businessPhones?: string[];
  givenName?: string;
  surname?: string;
}

export interface MicrosoftEvent {
  id: string;
  subject: string;
  bodyPreview?: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  organizer?: {
    emailAddress: {
      address: string;
      name: string;
    };
  };
  attendees?: Array<{
    emailAddress: {
      address: string;
      name: string;
    };
    type: string;
    status: {
      response: string;
      time: string;
    };
  }>;
  isOnlineMeeting?: boolean;
  onlineMeetingUrl?: string;
  responseStatus?: {
    response: string;
    time: string;
  };
  categories?: string[];
  hasAttachments?: boolean;
  isReminderOn?: boolean;
  reminderMinutesBeforeStart?: number;
  isAllDay?: boolean;
  isCancelled?: boolean;
  isDraft?: boolean;
  webLink?: string;
  location?: {
    displayName?: string;
    locationType?: string;
  };
  onlineMeeting?: {
    joinUrl?: string;
    conferenceUrl?: string;
  };
}

export interface MicrosoftTranscript {
  id: string;
  content: string;
  createdDateTime: string;
  lastModifiedDateTime: string;
}

export interface MicrosoftOnlineMeeting {
  id: string;
  createdDateTime: string;
  startDateTime: string;
  endDateTime: string;
  joinWebUrl: string;
  subject: string;
  transcripts?: MicrosoftTranscript[];
}

export interface GraphApiResponse<T> {
  value: T[];
  '@odata.nextLink'?: string;
  '@odata.count'?: number;
  '@odata.deltaLink'?: string;
}

export interface MicrosoftTokenRefreshRequest {
  client_id: string;
  client_secret: string;
  refresh_token: string;
  grant_type: string;
  scope?: string;
}

export interface MicrosoftAuthCodeRequest {
  client_id: string;
  client_secret: string;
  code: string;
  redirect_uri: string;
  grant_type: string;
  scope?: string;
}

export interface GetUserMeetingsOptions {
  startDate?: string;
  endDate?: string;
  top?: number;
  skip?: number;
  orderBy?: string;
}

export interface CalendarViewRequest {
  startDateTime: string;
  endDateTime: string;
}
