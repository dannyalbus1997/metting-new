'use client';

import { ReactNode, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { logout } from '@/store/slices/authSlice';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Menu,
  X,
  LogOut,
  Calendar,
  BarChart3,
  Settings,
} from 'lucide-react';

interface DashboardLayoutProps {
  children: ReactNode;
}

export const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { user } = useAppSelector((state) => state.auth);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await dispatch(logout() as any);
    router.replace('/login');
  };

  const navItems = [
    { label: 'Meetings', href: '/dashboard', icon: Calendar },
    { label: 'Analytics', href: '#', icon: BarChart3, disabled: true },
    { label: 'Settings', href: '#', icon: Settings, disabled: true },
  ];

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black bg-opacity-50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        ></div>
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 transform bg-white shadow-lg transition-transform duration-300 ease-in-out lg:static lg:z-0 lg:transform-none ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex h-full flex-col">
          {/* Logo/Header */}
          <div className="border-b border-gray-200 px-6 py-6">
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="flex-shrink-0 rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 p-2">
                <Calendar className="h-6 w-6 text-white" />
              </div>
              <span className="text-xl font-bold gradient-text">Sumsy</span>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 px-4 py-6">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.disabled ? '#' : item.href}
                  onClick={(e) => {
                    if (item.disabled) e.preventDefault();
                    setSidebarOpen(false);
                  }}
                  className={`flex items-center gap-3 rounded-lg px-4 py-3 text-gray-700 transition-smooth ${
                    item.disabled
                      ? 'cursor-not-allowed opacity-50'
                      : 'hover:bg-blue-50 hover:text-blue-600'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-sm font-medium">{item.label}</span>
                  {item.disabled && (
                    <span className="ml-auto text-xs text-gray-400">Soon</span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* User Section */}
          <div className="border-t border-gray-200 p-4">
            {user && (
              <>
                <div className="mb-4 rounded-lg bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">Signed in as</p>
                  {/* <p className="text-sm font-semibold text-gray-900">
                    {user.displayName}
                  </p> */}
                  <p className="truncate text-xs text-gray-600">{user.email}</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="btn btn-ghost w-full gap-2 justify-start"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Bar */}
        <div className="border-b border-gray-200 bg-white px-6 py-4 sm:px-8">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="inline-flex items-center justify-center rounded-lg p-2 text-gray-700 hover:bg-gray-100 lg:hidden"
            >
              {sidebarOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </button>
            <div className="text-sm text-gray-600">
              {new Date().toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </div>
          </div>
        </div>

        {/* Content Area */}
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
};

export default DashboardLayout;
