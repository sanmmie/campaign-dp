import React, { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store';
import { Button } from '../ui/Button';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { user, clearAuth } = useAuthStore();
  const location = useLocation();
  const isAuthPage = ['/login', '/signup', '/reset-password'].includes(location.pathname);

  const handleSignOut = () => {
    clearAuth();
    window.location.href = '/';
  };

  if (isAuthPage) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-brand-primary rounded-lg flex items-center justify-center">
                <span className="text-white font-bold">Δ</span>
              </div>
              <span className="font-bold text-xl text-gray-900">ΔOs Core</span>
            </Link>

            <nav className="hidden md:flex items-center gap-6">
              <Link to="/dashboard" className="text-gray-600 hover:text-gray-900 transition">
                Dashboard
              </Link>
              <Link to="/projects" className="text-gray-600 hover:text-gray-900 transition">
                Projects
              </Link>
            </nav>

            <div className="flex items-center gap-3">
              {user ? (
                <>
                  <Link to="/profile">
                    <div className="w-8 h-8 rounded-full bg-brand-primary/10 flex items-center justify-center">
                      <span className="text-sm text-brand-primary font-medium">
                        {user.email?.charAt(0).toUpperCase() || 'U'}
                      </span>
                    </div>
                  </Link>
                  <Button variant="ghost" size="sm" onClick={handleSignOut}>
                    Sign Out
                  </Button>
                </>
              ) : (
                <Link to="/login">
                  <Button variant="primary" size="sm">Sign In</Button>
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {children}
      </main>

      <footer className="bg-gray-50 border-t border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm text-gray-500">
              © {new Date().getFullYear()} ΔOs Core. All rights reserved.
            </p>
            <p className="text-sm text-gray-500">
              User-generated campaign material. Not an official communication.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}