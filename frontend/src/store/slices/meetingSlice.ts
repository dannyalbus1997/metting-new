/**
 * Redux slice for meetings state management
 * Handles meetings list, pagination, search, and AI processing
 */

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { MeetingState, Meeting, MeetingStatus, PaginationMeta } from '@/types';
import { meetingsApi } from '@/services/api';

const initialPaginationState: PaginationMeta = {
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0,
  hasNextPage: false,
  hasPreviousPage: false,
};

const initialState: MeetingState = {
  meetings: [],
  selectedMeeting: null,
  loading: false,
  error: null,
  pagination: initialPaginationState,
  searchQuery: '',
};

/**
 * Async thunk: Fetch all meetings with pagination and filters
 */
export const fetchMeetings = createAsyncThunk(
  'meetings/fetchMeetings',
  async (
    params: {
      page?: number;
      limit?: number;
      search?: string;
      status?: MeetingStatus;
      startDate?: string;
      endDate?: string;
    } = {},
    { rejectWithValue }
  ) => {
    try {
      const response = await meetingsApi.getAll(params);
      return response;
    } catch (error) {
      return rejectWithValue((error as Error).message || 'Failed to fetch meetings');
    }
  }
);

/**
 * Async thunk: Fetch a single meeting by ID
 */
export const fetchMeetingById = createAsyncThunk(
  'meetings/fetchMeetingById',
  async (meetingId: string, { rejectWithValue }) => {
    try {
      const meeting = await meetingsApi.getById(meetingId);
      return meeting;
    } catch (error) {
      return rejectWithValue((error as Error).message || 'Failed to fetch meeting');
    }
  }
);

/**
 * Async thunk: Trigger AI processing for a meeting
 */
export const processMeeting = createAsyncThunk(
  'meetings/processMeeting',
  async (meetingId: string, { rejectWithValue }) => {
    try {
      const result = await meetingsApi.processMeeting(meetingId);
      return { meetingId, result };
    } catch (error) {
      return rejectWithValue((error as Error).message || 'Failed to process meeting');
    }
  }
);

/**
 * Async thunk: Sync meetings from Microsoft Graph
 */
export const syncMeetings = createAsyncThunk(
  'meetings/syncMeetings',
  async (_, { rejectWithValue }) => {
    try {
      const response = await meetingsApi.syncMeetings();
      return response;
    } catch (error) {
      return rejectWithValue((error as Error).message || 'Failed to sync meetings');
    }
  }
);

/**
 * Async thunk: Update meeting notes
 */
export const updateMeetingNotes = createAsyncThunk(
  'meetings/updateMeetingNotes',
  async ({ meetingId, notes }: { meetingId: string; notes: string }, { rejectWithValue }) => {
    try {
      const meeting = await meetingsApi.updateNotes(meetingId, notes);
      return meeting;
    } catch (error) {
      return rejectWithValue((error as Error).message || 'Failed to update notes');
    }
  }
);

const meetingSlice = createSlice({
  name: 'meetings',
  initialState,
  reducers: {
    /**
     * Set meetings list
     */
    setMeetings: (state, action: PayloadAction<Meeting[]>) => {
      state.meetings = action.payload;
    },

    /**
     * Set selected meeting
     */
    setSelectedMeeting: (state, action: PayloadAction<Meeting>) => {
      state.selectedMeeting = action.payload;
    },

    /**
     * Clear selected meeting
     */
    clearSelectedMeeting: (state) => {
      state.selectedMeeting = null;
    },

    /**
     * Set search query
     */
    setSearchQuery: (state, action: PayloadAction<string>) => {
      state.searchQuery = action.payload;
    },

    /**
     * Clear error
     */
    clearError: (state) => {
      state.error = null;
    },

    /**
     * Reset pagination
     */
    resetPagination: (state) => {
      state.pagination = initialPaginationState;
    },
  },
  extraReducers: (builder) => {
    // Handle fetchMeetings lifecycle
    builder
      .addCase(fetchMeetings.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchMeetings.fulfilled, (state, action) => {
        state.loading = false;
        state.meetings = action.payload?.data || [];
        state.pagination = action.payload?.pagination || initialPaginationState;
      })
      .addCase(fetchMeetings.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
        state.meetings = [];
      });

    // Handle fetchMeetingById lifecycle
    builder
      .addCase(fetchMeetingById.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchMeetingById.fulfilled, (state, action) => {
        state.loading = false;
        state.selectedMeeting = action.payload;

        // Update the meeting in the list if it exists
        const index = state.meetings.findIndex((m) => m.id === action.payload.id);
        if (index !== -1) {
          state.meetings[index] = action.payload;
        }
      })
      .addCase(fetchMeetingById.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });

    // Handle processMeeting lifecycle
    builder
      .addCase(processMeeting.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(processMeeting.fulfilled, (state, action) => {
        state.loading = false;

        // Update the meeting's AI processing status
        if (state.selectedMeeting?.id === action.payload.meetingId) {
          state.selectedMeeting.aiProcessingStatus = action.payload.result.status;
          state.selectedMeeting.keyPoints = action.payload.result.keyPoints;
          state.selectedMeeting.actionItems = action.payload.result.actionItems;
        }

        // Update in meetings list
        const index = state.meetings.findIndex((m) => m.id === action.payload.meetingId);
        if (index !== -1) {
          state.meetings[index].aiProcessingStatus = action.payload.result.status;
          state.meetings[index].keyPoints = action.payload.result.keyPoints;
          state.meetings[index].actionItems = action.payload.result.actionItems;
        }
      })
      .addCase(processMeeting.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });

    // Handle syncMeetings lifecycle
    builder
      .addCase(syncMeetings.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(syncMeetings.fulfilled, (state) => {
        state.loading = false;
        // Refetch meetings after sync
      })
      .addCase(syncMeetings.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });

    // Handle updateMeetingNotes lifecycle
    builder
      .addCase(updateMeetingNotes.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(updateMeetingNotes.fulfilled, (state, action) => {
        state.loading = false;

        // Update selected meeting
        if (state.selectedMeeting?.id === action.payload.id) {
          state.selectedMeeting = action.payload;
        }

        // Update in meetings list
        const index = state.meetings.findIndex((m) => m.id === action.payload.id);
        if (index !== -1) {
          state.meetings[index] = action.payload;
        }
      })
      .addCase(updateMeetingNotes.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  },
});

export const {
  setMeetings,
  setSelectedMeeting,
  clearSelectedMeeting,
  setSearchQuery,
  clearError,
  resetPagination,
} = meetingSlice.actions;

export default meetingSlice.reducer;
