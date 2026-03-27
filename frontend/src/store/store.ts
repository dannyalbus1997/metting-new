/**
 * Redux store configuration
 * Combines all reducers and enables Redux DevTools
 */

import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import meetingsReducer from './slices/meetingSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    meetings: meetingsReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['persist/PERSIST'],
      },
    }),
  devTools: process.env.NODE_ENV !== 'production',
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
