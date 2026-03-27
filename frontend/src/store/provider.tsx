/**
 * Redux Provider component for wrapping the app with store access
 * This is a client component and must be used at the app root
 */

'use client';

import { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { store } from './store';

interface ReduxProviderProps {
  children: ReactNode;
}

/**
 * Client-side wrapper component that provides Redux store to the application
 * Use this at the root level of your Next.js app
 *
 * @example
 * // In app/layout.tsx
 * import { ReduxProvider } from '@/store/provider';
 *
 * export default function RootLayout({ children }: { children: React.ReactNode }) {
 *   return (
 *     <html>
 *       <body>
 *         <ReduxProvider>{children}</ReduxProvider>
 *       </body>
 *     </html>
 *   );
 * }
 */
export function ReduxProvider({ children }: ReduxProviderProps) {
  return <Provider store={store}>{children}</Provider>;
}
