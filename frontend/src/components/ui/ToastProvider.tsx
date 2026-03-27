'use client';

import { Toaster } from 'react-hot-toast';

export const ToastProvider = () => {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 3500,
        style: {
          background: '#fff',
          color: '#1a202c',
          fontSize: '14px',
          fontWeight: 500,
          borderRadius: '12px',
          padding: '12px 16px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.04)',
          border: '1px solid rgba(0,0,0,0.06)',
        },
        success: {
          iconTheme: {
            primary: '#22c55e',
            secondary: '#fff',
          },
          style: {
            border: '1px solid rgba(34, 197, 94, 0.15)',
          },
        },
        error: {
          iconTheme: {
            primary: '#ef4444',
            secondary: '#fff',
          },
          style: {
            border: '1px solid rgba(239, 68, 68, 0.15)',
          },
          duration: 5000,
        },
        loading: {
          iconTheme: {
            primary: '#3b82f6',
            secondary: '#fff',
          },
        },
      }}
    />
  );
};
