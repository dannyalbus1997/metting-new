/**
 * Sumsy Frontend TypeScript Type Definitions
 * Comprehensive interfaces for all application entities and states
 */

/**
 * Enumeration for meeting statuses
 */
export enum MeetingStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SCHEDULED = 'scheduled',
  IN_PROGRESS = 'in_progress',
  CANCELLED = 'cancelled',
}

/**
 * User entity representing an authenticated user
 */
export interface User {
  id: string;
  email: string;
  displayName: string;
  givenName: string;
  surname: string;
  jobTitle?: string;
  mobilePhone?: string;
  userPrincipalName: string;
  resourceType: string;
  avatar?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Participant in a meeting
 */
export interface Participant {
  id: string;
  email: string;
  displayName: string;
  role: 'organizer' | 'attendee' | 'optional';
  responseStatus?: 'none' | 'tentativelyAccepted' | 'accepted' | 'declined';
  avatar?: string;
}

/**
 * Action item generated from meeting notes
 */
export interface ActionItem {
  id: string;
  title: string;
  description?: string;
  assignee: Participant;
  dueDate: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  meetingId: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Meeting entity with full details
 */
export interface Meeting {
  id: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  duration: number; // in minutes
  status: MeetingStatus;
  organizer: Participant;
  participants: Participant[];
  location?: string;
  isOnline: boolean;
  onlineMeetingUrl?: string;
  joinUrl?: string;
  notes?: string;
  transcript?: string;
  translatedTranscript?: string | null;
  keyPoints: string[];
  actionItems: ActionItem[];
  aiProcessingStatus: 'pending' | 'processing' | 'completed' | 'failed';
  recordingUrl?: string;
  hasRecording?: boolean;
  transcriptFetchStatus?: string;
  transcriptFetchError?: string | null;
  productivity?: {
    score: number;
    label: string;
    breakdown: {
      onTopicScore: number;
      decisionsScore: number;
      actionItemsScore: number;
      participationScore: number;
      timeEfficiency: number;
    };
    highlights: string[];
    improvements: string[];
  } | null;
  createdAt: string;
  updatedAt: string;
  iCalUId?: string;
  webLink?: string;
}

/**
 * AI Processing result for meeting analysis
 */
export interface AiProcessingResult {
  meetingId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  keyPoints: string[];
  actionItems: ActionItem[];
  summary?: string;
  processedAt?: string;
  error?: string;
}

/**
 * Pagination metadata
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

/**
 * Generic paginated API response
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

/**
 * Generic API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

/**
 * Authentication state in Redux
 */
export interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
}

/**
 * Meeting state in Redux
 */
export interface MeetingState {
  meetings: Meeting[];
  selectedMeeting: Meeting | null;
  loading: boolean;
  error: string | null;
  pagination: PaginationMeta;
  searchQuery: string;
}

/**
 * Root Redux state type
 */
export interface RootState {
  auth: AuthState;
  meetings: MeetingState;
}

/**
 * OAuth callback parameters from Microsoft
 */
export interface OAuthCallbackParams {
  code: string;
  state: string;
  session_state?: string;
  error?: string;
  error_description?: string;
}

/**
 * Token response from authentication endpoint
 */
export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Meeting fetch parameters
 */
export interface MeetingFetchParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: MeetingStatus;
  startDate?: string;
  endDate?: string;
}

/**
 * Action item create/update payload
 */
export interface ActionItemPayload {
  title: string;
  description?: string;
  assigneeId: string;
  dueDate: string;
  meetingId: string;
}

/**
 * Meeting sync response
 */
export interface SyncResponse {
  synced: number;
  failed: number;
  total: number;
  errors?: Array<{
    meetingId: string;
    error: string;
  }>;
}
