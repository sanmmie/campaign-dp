import React, { ReactNode, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store';
import { Button } from '../ui/Button';
import { LanguageSelector } from '../i18n/LanguageSelector';
import { logout } from '../../hooks/useApi';
import { useAuthBootstrap } from '../../hooks/useAuthBootstrap';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { user, isGuest, clearAuth, clearGuestProject } = useAuthStore();
  const location = useLocation();
  const isAuthPage = ['/login', '/signup', '/reset-password', '/update-password'].includes(location.pathname);
  const { ready } = useAuthBootstrap();

  useEffect(() => {
    // No-op; useAuthBootstrap runs on mount via its own useEffect.
  }, []);

  const handleSignOut = async () => {
    // Best-effort server-side revocation via cookie; failures never block
    // signing out locally.
    await logout();
    clearAuth();
    clearGuestProject();
    window.location.href = '/';
  };

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-brand-primary" />
      </div>
    );
  }

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
              <Link to="/templates" className="text-gray-600 hover:text-gray-900 transition">
                Templates
              </Link>
              <Link to="/dashboard" className="text-gray-600 hover:text-gray-900 transition">
                Dashboard
              </Link>
              <Link to="/projects" className="text-gray-600 hover:text-gray-900 transition">
                Projects
              </Link>
            </nav>

            <div className="flex items-center gap-3">
              <LanguageSelector />
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
              ) : isGuest ? (
                <>
                  <span className="text-sm text-gray-500 hidden sm:block">Guest Mode</span>
                  <Button variant="ghost" size="sm" onClick={handleSignOut}>
                    Exit
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
              Developed by{' '}
              <a
                href="https://www.linkedin.com/in/oluwasanmiadebowale"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-primary hover:underline"
              >
                DeltaOS Core
              </a>
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