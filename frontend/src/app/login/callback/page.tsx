'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAppDispatch } from '@/store/hooks';
import { loginSuccess, clearError } from '@/store/slices/authSlice';
import { Loader2, AlertCircle, RotateCcw } from 'lucide-react';

const LoginCallbackPage = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dispatch = useAppDispatch();
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    // Check for error from backend redirect
    const errorParam = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    if (errorParam) {
      setError(errorDescription || errorParam || 'Authentication failed');
      return;
    }

    // Read tokens from URL params (sent by backend redirect)
    const accessToken = searchParams.get('accessToken');
    const refreshToken = searchParams.get('refreshToken');
    const userId = searchParams.get('userId');
    const email = searchParams.get('email');

    if (!accessToken || !refreshToken || !userId || !email) {
      setError('Missing authentication data. Please try signing in again.');
      return;
    }

    // Store tokens in localStorage
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem(
      'user',
      JSON.stringify({ id: userId, email }),
    );

    // Update Redux store
    dispatch(
      loginSuccess({
        user: { id: userId, email, displayName: email },
        accessToken,
        refreshToken,
      }),
    );

    // Redirect to dashboard
    router.replace('/dashboard');
  }, [mounted, searchParams, dispatch, router]);

  const handleRetry = () => {
    dispatch(clearError());
    router.push('/login');
  };

  if (!mounted) {
    return null;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 px-4">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-gradient-to-br from-indigo-200 to-violet-200 opacity-30 blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-gradient-to-tr from-violet-200 to-purple-200 opacity-30 blur-3xl"></div>
      </div>

      {/* Content */}
      <div className="relative z-10 w-full max-w-md">
        <div className="rounded-2xl bg-white p-8 shadow-lg sm:p-10">
          {/* Loading State */}
          {!error && (
            <div className="space-y-6 text-center">
              <div className="flex justify-center">
                <div className="rounded-full bg-indigo-100 p-4">
                  <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                </div>
              </div>
              <div>
                <h1 className="mb-2 text-2xl font-bold text-gray-900">
                  Signing you in...
                </h1>
                <p className="text-gray-600">
                  Please wait while we verify your credentials and set up your account.
                </p>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="space-y-6">
              <div className="flex justify-center">
                <div className="rounded-full bg-red-100 p-4">
                  <AlertCircle className="h-8 w-8 text-red-600" />
                </div>
              </div>
              <div className="text-center">
                <h1 className="mb-2 text-2xl font-bold text-gray-900">
                  Authentication Failed
                </h1>
                <p className="mb-4 text-gray-600">{error}</p>
              </div>

              {/* Retry Button */}
              <button
                onClick={handleRetry}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-500 py-3 text-white hover:bg-indigo-600 transition-colors"
              >
                <RotateCcw className="h-4 w-4" />
                Try Again
              </button>

              {/* Back to login link */}
              <p className="text-center text-sm text-gray-600">
                <a
                  href="/login"
                  className="font-medium text-indigo-600 hover:text-indigo-700"
                >
                  Back to sign in
                </a>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LoginCallbackPage;
