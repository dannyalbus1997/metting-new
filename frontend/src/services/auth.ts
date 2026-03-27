/**
 * Authentication service wrapper
 * Provides simplified authentication functions
 */

import { authApi } from './api';

export const getMicrosoftAuthUrl = async (): Promise<string> => {
  try {
    return await authApi.getMicrosoftAuthUrl();
  } catch (error) {
    console.error('Failed to get Microsoft auth URL:', error);
    throw error;
  }
};

export const handleOAuthCallback = async (code: string) => {
  try {
    return await authApi.handleCallback(code);
  } catch (error) {
    console.error('OAuth callback failed:', error);
    throw error;
  }
};

export const getCurrentUser = async () => {
  try {
    return await authApi.getCurrentUser();
  } catch (error) {
    console.error('Failed to get current user:', error);
    throw error;
  }
};

export const logout = async () => {
  try {
    await authApi.logout();
  } catch (error) {
    console.error('Logout failed:', error);
    throw error;
  }
};
