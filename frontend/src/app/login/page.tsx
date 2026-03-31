'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { loginWithMicrosoft } from '@/store/slices/authSlice';
import { getMicrosoftAuthUrl } from '@/services/auth';
import { AlertCircle, Loader2 } from 'lucide-react';
import Link from 'next/link';

const LoginPage = () => {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { isAuthenticated, loading, error } = useAppSelector((state) => state.auth);
  const [isRedirecting, setIsRedirecting] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/dashboard');
    }
  }, [isAuthenticated, router]);

  const handleMicrosoftLogin = async () => {
    try {
      setIsRedirecting(true);
      const authUrl = await getMicrosoftAuthUrl();
      if (authUrl) {
        window.location.href = authUrl;
      }
    } catch (err) {
      setIsRedirecting(false);
      console.error('Failed to get Microsoft auth URL:', err);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 px-4">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-gradient-to-br from-indigo-200 to-violet-200 opacity-30 blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-gradient-to-tr from-violet-200 to-purple-200 opacity-30 blur-3xl"></div>
      </div>

      {/* Content */}
      <div className="relative z-10 w-full max-w-md">
        {/* Card */}
        <div className="rounded-2xl bg-white p-8 shadow-lg sm:p-10">
          {/* Header */}
          <div className="mb-8 text-center">
            <h1 className="mb-2 text-3xl font-bold gradient-text">Sumsy</h1>
            <p className="text-gray-600">Sign in to your account</p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 flex gap-3 rounded-lg bg-red-50 p-4 text-red-700">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <div>
                <p className="font-medium">{error}</p>
                <p className="text-sm">Please try again or contact support if the issue persists.</p>
              </div>
            </div>
          )}

          {/* Login Form */}
          <div className="space-y-6">
            {/* Microsoft Login Button */}
            <button
              onClick={handleMicrosoftLogin}
              disabled={loading || isRedirecting}
              className="btn btn-primary w-full gap-3 py-3 text-base font-semibold"
            >
              {loading || isRedirecting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Redirecting...
                </>
              ) : (
                <>
                  {/* Microsoft Logo */}
                  <svg
                    className="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zm12.6 0H12.6V0H24v11.4z" />
                  </svg>
                  Sign in with Microsoft
                </>
              )}
            </button>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-white px-2 text-gray-500">or</span>
              </div>
            </div>

            {/* Alternative signup info */}
            <p className="text-center text-gray-600">
              Sumsy integrates with Microsoft 365 for secure authentication.
            </p>
          </div>

          {/* Footer */}
          <div className="mt-8 border-t border-gray-200 pt-6 text-center text-sm text-gray-600">
            <p>
              By signing in, you agree to our{' '}
              <a href="#" className="font-medium text-indigo-600 hover:text-indigo-700">
                Terms of Service
              </a>
              {' '}and{' '}
              <a href="#" className="font-medium text-indigo-600 hover:text-indigo-700">
                Privacy Policy
              </a>
            </p>
          </div>

          {/* Back to home */}
          <div className="mt-6 text-center">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-smooth"
            >
              ← Back to home
            </Link>
          </div>
        </div>

        {/* Info section */}
        <div className="mt-8 rounded-lg bg-white/50 p-6 text-center text-sm text-gray-600 backdrop-blur-sm">
          <p className="font-medium text-gray-900">Why Microsoft?</p>
          <p className="mt-2">
            We use Microsoft authentication to securely access your calendar and meetings while maintaining your privacy.
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
