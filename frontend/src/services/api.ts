/**
 * Centralized API service for all HTTP requests
 * Handles authentication, token refresh, and error handling
 */

import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import {
  ApiResponse,
  PaginatedResponse,
  User,
  Meeting,
  TokenResponse,
  MeetingFetchParams,
  SyncResponse,
  AiProcessingResult,
} from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

/**
 * Create Axios instance with default config
 */
const axiosInstance: AxiosInstance = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

/**
 * Flag to prevent infinite token refresh loops
 */
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: AxiosError) => void;
}> = [];

/**
 * Process queued requests after token refresh
 */
const processQueue = (error: AxiosError | null, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else if (token) {
      prom.resolve(token);
    }
  });

  isRefreshing = false;
  failedQueue = [];
};

/**
 * Request interceptor: Attach JWT token to all requests
 */
axiosInstance.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (typeof window !== 'undefined') {
      const accessToken = localStorage.getItem('accessToken');
      if (accessToken) {
        config.headers.Authorization = `Bearer ${accessToken}`;
      }
    }
    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  }
);

/**
 * Response interceptor: Handle 401 and token refresh
 */
axiosInstance.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry && typeof window !== 'undefined') {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (token: string) => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              resolve(axiosInstance(originalRequest));
            },
            reject: reject,
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem('refreshToken');

      if (!refreshToken) {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        window.location.href = '/login';
        return Promise.reject(error);
      }

      try {
        const response = await axios.post<ApiResponse<TokenResponse>>(`${API_URL}/auth/refresh`, {
          refreshToken,
        });

        const newAccessToken = response.data.data!;
        localStorage.setItem('accessToken', newAccessToken.accessToken);
        localStorage.setItem('refreshToken', newAccessToken.refreshToken);

        originalRequest.headers.Authorization = `Bearer ${newAccessToken.accessToken}`;
        processQueue(null, newAccessToken.accessToken);

        return axiosInstance(originalRequest);
      } catch (refreshError) {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        window.location.href = '/login';
        processQueue(refreshError as AxiosError, null);
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

/**
 * Authentication API methods
 */
export const authApi = {
  /**
   * Get Microsoft OAuth URL for redirecting user to login
   */
  getMicrosoftAuthUrl: async (): Promise<string> => {
    const response = await axiosInstance.get<ApiResponse<{ authUrl: string }>>('/auth/microsoft-auth-url');
    return response.data.data?.authUrl || '';
  },

  /**
   * Handle OAuth callback and exchange code for tokens
   */
  handleCallback: async (code: string): Promise<User> => {
    const response = await axiosInstance.post<ApiResponse<User & TokenResponse>>('/auth/callback', {
      code,
    });
    const data = response.data.data!;

    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    localStorage.setItem('user', JSON.stringify(data));

    return {
      id: data.id,
      email: data.email,
      displayName: data.displayName,
      givenName: data.givenName,
      surname: data.surname,
      jobTitle: data.jobTitle,
      mobilePhone: data.mobilePhone,
      userPrincipalName: data.userPrincipalName,
      resourceType: data.resourceType,
      avatar: data.avatar,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  },

  /**
   * Refresh authentication token
   */
  refreshToken: async (): Promise<TokenResponse> => {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await axios.post<ApiResponse<TokenResponse>>(`${API_URL}/auth/refresh`, {
      refreshToken,
    });
    const tokenData = response.data.data!;

    localStorage.setItem('accessToken', tokenData.accessToken);
    localStorage.setItem('refreshToken', tokenData.refreshToken);

    return tokenData;
  },

  /**
   * Get current authenticated user
   */
  getCurrentUser: async (): Promise<User> => {
    const response = await axiosInstance.get<ApiResponse<User>>('/auth/me');
    return response.data.data as User;
  },

  /**
   * Logout (server-side)
   */
  logout: async (): Promise<void> => {
    try {
      await axiosInstance.post('/auth/logout');
    } finally {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
    }
  },
};

/**
 * Meetings API methods
 */
/**
 * Backend response shape for meeting list:
 * { data: Meeting[], total: number, page: number, limit: number, pages: number }
 */
interface BackendMeetingListResponse {
  data: any[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

/**
 * Normalize a backend meeting object to match the frontend Meeting type.
 * Handles _id → id mapping and provides safe defaults for optional fields.
 */
const normalizeMeeting = (raw: any): Meeting => {
  // Map backend actionItems { task, owner, dueDate, completed }
  // to frontend shape { id, title, assignee: { displayName }, dueDate, status }
  const normalizedActionItems = (raw.actionItems || []).map((item: any, idx: number) => ({
    id: item.id || item._id || `action-${idx}`,
    title: item.title || item.task || '',
    description: item.description || '',
    assignee: item.assignee || {
      id: '',
      email: '',
      displayName: item.owner || 'TBD',
      role: 'attendee' as const,
    },
    dueDate: item.dueDate || 'Not specified',
    status: item.status || (item.completed ? 'completed' : 'pending'),
    meetingId: raw.id || raw._id || '',
    createdAt: item.createdAt || raw.createdAt || '',
    updatedAt: item.updatedAt || raw.updatedAt || '',
  }));

  // Map backend 'summary' to frontend 'notes'
  // Map backend 'decisions' to frontend 'keyPoints'
  // Determine aiProcessingStatus from backend 'status' + presence of summary
  let aiStatus = raw.aiProcessingStatus || 'pending';
  if (!raw.aiProcessingStatus) {
    if (raw.status === 'completed' && raw.summary) aiStatus = 'completed';
    else if (raw.status === 'processing') aiStatus = 'processing';
    else if (raw.status === 'failed') aiStatus = 'failed';
  }

  return {
    ...raw,
    id: raw.id || raw._id,
    participants: raw.participants || [],
    actionItems: normalizedActionItems,
    notes: raw.notes || raw.summary || '',
    keyPoints: raw.keyPoints || raw.decisions || [],
    status: raw.status || 'pending',
    aiProcessingStatus: aiStatus,
    hasRecording: !!raw.recordingMeta,
    translatedTranscript: raw.translatedTranscript || null,
    productivity: raw.productivity || null,
  };
};

export const meetingsApi = {
  /**
   * Get all meetings with pagination and filtering
   * Maps backend response to PaginatedResponse shape expected by Redux slice
   */
  getAll: async (params: MeetingFetchParams = {}): Promise<PaginatedResponse<Meeting>> => {
    const queryParams = new URLSearchParams();

    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.search) queryParams.append('search', params.search);
    if (params.status) queryParams.append('status', params.status);
    if (params.startDate) queryParams.append('startDate', params.startDate);
    if (params.endDate) queryParams.append('endDate', params.endDate);

    const response = await axiosInstance.get<BackendMeetingListResponse>(
      `/meetings?${queryParams.toString()}`
    );

    // Map backend shape { data, total, page, limit, pages }
    // to frontend shape { data, pagination }
    const backend = response.data;
    return {
      data: (backend.data || []).map(normalizeMeeting),
      pagination: {
        page: backend.page || 1,
        limit: backend.limit || 10,
        total: backend.total || 0,
        totalPages: backend.pages || 0,
        hasNextPage: (backend.page || 1) < (backend.pages || 0),
        hasPreviousPage: (backend.page || 1) > 1,
      },
    };
  },

  /**
   * Get meeting by ID
   */
  getById: async (meetingId: string): Promise<Meeting> => {
    const response = await axiosInstance.get<any>(`/meetings/${meetingId}`);
    return normalizeMeeting(response.data);
  },

  /**
   * Trigger AI processing for a meeting
   */
  processMeeting: async (meetingId: string): Promise<AiProcessingResult> => {
    const response = await axiosInstance.post<AiProcessingResult>(
      `/meetings/${meetingId}/process`,
      { meetingId }
    );
    return response.data;
  },

  /**
   * Translate meeting transcript to a target language
   */
  translateTranscript: async (meetingId: string, targetLanguage: string = 'English'): Promise<{ translatedTranscript: string }> => {
    const response = await axiosInstance.post<{ translatedTranscript: string }>(
      `/meetings/${meetingId}/translate`,
      { targetLanguage }
    );
    return response.data;
  },

  /**
   * Sync meetings from Microsoft Graph
   */
  syncMeetings: async (days: number = 6): Promise<SyncResponse> => {
    const response = await axiosInstance.post<SyncResponse>('/meetings/sync', { days });
    return response.data;
  },

  /**
   * Update meeting notes
   */
  updateNotes: async (meetingId: string, notes: string): Promise<Meeting> => {
    const response = await axiosInstance.patch<Meeting>(`/meetings/${meetingId}`, {
      notes,
    });
    return response.data;
  },
};

/**
 * Bot API methods
 */
export const botApi = {
  /**
   * Send bot to join a Teams meeting
   */
  joinMeeting: async (
    meetingId: string,
    meetingUrl: string,
  ): Promise<any> => {
    const response = await axiosInstance.post('/bot/join', {
      meetingId,
      meetingUrl,
    });
    return response.data;
  },

  /**
   * Remove bot from a meeting
   */
  leaveMeeting: async (callId: string): Promise<any> => {
    const response = await axiosInstance.post(`/bot/leave/${callId}`);
    return response.data;
  },

  /**
   * Get bot status for a meeting
   */
  getStatus: async (meetingId: string): Promise<any> => {
    const response = await axiosInstance.get(`/bot/status/${meetingId}`);
    return response.data;
  },

  /**
   * Upload and transcribe an audio file for a meeting
   */
  transcribeAudio: async (meetingId: string, file: File): Promise<any> => {
    const formData = new FormData();
    formData.append('audio', file);
    const response = await axiosInstance.post(
      `/bot/transcribe/${meetingId}`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 300000, // 5 min for large files
      },
    );
    return response.data;
  },

  /**
   * Submit transcript text manually for a meeting
   */
  submitTranscript: async (meetingId: string, transcript: string): Promise<any> => {
    const response = await axiosInstance.post(`/bot/transcript/${meetingId}`, {
      transcript,
    });
    return response.data;
  },

  /**
   * Retry fetching transcript from Microsoft Graph
   */
  retryTranscriptFetch: async (meetingId: string): Promise<any> => {
    const response = await axiosInstance.post(`/bot/retry-transcript/${meetingId}`);
    return response.data;
  },

  /**
   * Retry downloading meeting recording and transcribing with Whisper
   */
  retryRecordingFetch: async (meetingId: string): Promise<any> => {
    const response = await axiosInstance.post(`/bot/retry-recording/${meetingId}`, {}, {
      timeout: 300000, // 5 min — recording download + transcription can take a while
    });
    return response.data;
  },
};

export default axiosInstance;
