/**
 * Redux slice for authentication state management
 * Handles user authentication, token management, and user data
 */

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { AuthState, User, OAuthCallbackParams } from '@/types';
import { authApi } from '@/services/api';

const initialState: AuthState = {
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  loading: false,
  error: null,
};

/**
 * Initialize auth state from localStorage (client-side only)
 */
const initializeAuthState = (): AuthState => {
  if (typeof window === 'undefined') {
    return initialState;
  }

  const storedUser = localStorage.getItem('user');
  const accessToken = localStorage.getItem('accessToken');
  const refreshToken = localStorage.getItem('refreshToken');

  return {
    user: storedUser ? JSON.parse(storedUser) : null,
    accessToken,
    refreshToken,
    isAuthenticated: !!accessToken && !!storedUser,
    loading: false,
    error: null,
  };
};

/**
 * Async thunk: Exchange OAuth code for tokens and user data
 */
export const loginWithMicrosoft = createAsyncThunk(
  'auth/loginWithMicrosoft',
  async (code: string, { rejectWithValue }) => {
    try {
      const user = await authApi.handleCallback(code);
      return user;
    } catch (error) {
      return rejectWithValue((error as Error).message || 'Login failed');
    }
  }
);

/**
 * Async thunk: Fetch current user from /auth/me endpoint
 */
export const fetchCurrentUser = createAsyncThunk(
  'auth/fetchCurrentUser',
  async (_, { rejectWithValue }) => {
    try {
      const user = await authApi.getCurrentUser();
      return user;
    } catch (error) {
      return rejectWithValue((error as Error).message || 'Failed to fetch user');
    }
  }
);

/**
 * Async thunk: Refresh authentication tokens
 */
export const refreshAuth = createAsyncThunk(
  'auth/refreshAuth',
  async (_, { rejectWithValue }) => {
    try {
      const tokenResponse = await authApi.refreshToken();
      return tokenResponse;
    } catch (error) {
      return rejectWithValue((error as Error).message || 'Token refresh failed');
    }
  }
);

/**
 * Async thunk: Logout user
 */
export const logout = createAsyncThunk(
  'auth/logout',
  async (_, { rejectWithValue }) => {
    try {
      await authApi.logout();
    } catch (error) {
      return rejectWithValue((error as Error).message || 'Logout failed');
    }
  }
);

const authSlice = createSlice({
  name: 'auth',
  initialState: initializeAuthState(),
  reducers: {
    /**
     * Set auth state after successful login (tokens + user from URL params)
     */
    loginSuccess: (
      state,
      action: PayloadAction<{
        user: any;
        accessToken: string;
        refreshToken: string;
      }>,
    ) => {
      state.user = action.payload.user;
      state.accessToken = action.payload.accessToken;
      state.refreshToken = action.payload.refreshToken;
      state.isAuthenticated = true;
      state.loading = false;
      state.error = null;
    },

    /**
     * Manual user set (useful for testing or manual updates)
     */
    setUser: (state, action: PayloadAction<User>) => {
      state.user = action.payload;
      state.isAuthenticated = true;
      if (typeof window !== 'undefined') {
        localStorage.setItem('user', JSON.stringify(action.payload));
      }
    },

    /**
     * Clear error message
     */
    clearError: (state) => {
      state.error = null;
    },

    /**
     * Clear all auth state
     */
    clearAuth: (state) => {
      state.user = null;
      state.accessToken = null;
      state.refreshToken = null;
      state.isAuthenticated = false;
      state.error = null;
      if (typeof window !== 'undefined') {
        localStorage.removeItem('user');
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
      }
    },
  },
  extraReducers: (builder) => {
    // Handle loginWithMicrosoft lifecycle
    builder
      .addCase(loginWithMicrosoft.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loginWithMicrosoft.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload;
        state.isAuthenticated = true;
      })
      .addCase(loginWithMicrosoft.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
        state.isAuthenticated = false;
      });

    // Handle fetchCurrentUser lifecycle
    builder
      .addCase(fetchCurrentUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchCurrentUser.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload;
        state.isAuthenticated = true;
      })
      .addCase(fetchCurrentUser.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
        state.isAuthenticated = false;
      });

    // Handle refreshAuth lifecycle
    builder
      .addCase(refreshAuth.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(refreshAuth.fulfilled, (state, action) => {
        state.loading = false;
        state.accessToken = action.payload.accessToken;
        state.refreshToken = action.payload.refreshToken;
        if (typeof window !== 'undefined') {
          localStorage.setItem('accessToken', action.payload.accessToken);
          localStorage.setItem('refreshToken', action.payload.refreshToken);
        }
      })
      .addCase(refreshAuth.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
        state.isAuthenticated = false;
        state.user = null;
        state.accessToken = null;
        state.refreshToken = null;
      });

    // Handle logout lifecycle
    builder
      .addCase(logout.fulfilled, (state) => {
        state.user = null;
        state.accessToken = null;
        state.refreshToken = null;
        state.isAuthenticated = false;
        state.loading = false;
        state.error = null;
      })
      .addCase(logout.rejected, (state, action) => {
        state.error = action.payload as string;
        state.user = null;
        state.accessToken = null;
        state.refreshToken = null;
        state.isAuthenticated = false;
      });
  },
});

export const { loginSuccess, setUser, clearError, clearAuth } = authSlice.actions;
export default authSlice.reducer;
