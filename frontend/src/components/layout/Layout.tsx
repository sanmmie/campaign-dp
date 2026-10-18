import React, { ReactNode, useEffect, useState } from 'react';
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  const navLinks = [
    { to: '/templates', label: 'Templates' },
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/projects', label: 'Projects' },
    { to: '/pricing', label: 'Pricing' },
  ];

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
      {/* Skip to content for keyboard navigation */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-brand-primary focus:text-white focus:rounded-lg focus:font-medium"
      >
        Skip to main content
      </a>
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
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`text-gray-600 hover:text-gray-900 transition ${location.pathname === link.to ? 'text-brand-primary font-medium' : ''}`}
                >
                  {link.label}
                </Link>
              ))}
              {user?.isPlatformAdmin && (
                <Link
                  to="/admin"
                  className={`text-gray-600 hover:text-gray-900 transition ${location.pathname === '/admin' ? 'text-brand-primary font-medium' : ''}`}
                >
                  Admin
                </Link>
              )}
            </nav>

            <div className="flex items-center gap-2 md:gap-3">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg"
                aria-label="Open navigation menu"
                aria-expanded={mobileMenuOpen}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {mobileMenuOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </button>
              {mobileMenuOpen && (
                <div className="md:hidden absolute left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-2 z-50">
                  <div className="px-4 py-2 border-b border-gray-100">
                    <LanguageSelector />
                  </div>
                  {navLinks.map((link) => (
                    <Link
                      key={link.to}
                      to={link.to}
                      onClick={() => setMobileMenuOpen(false)}
                      className="block px-4 py-3 text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    >
                      {link.label}
                    </Link>
                  ))}
                  {user?.isPlatformAdmin && (
                    <Link
                      to="/admin"
                      onClick={() => setMobileMenuOpen(false)}
                      className="block px-4 py-3 text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    >
                      Admin
                    </Link>
                  )}
                  <div className="px-4 py-3 border-t border-gray-100">
                    {user ? (
                      <>
                        <Link
                          to="/profile"
                          className="block px-4 py-3 text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                        >
                          {user.email?.charAt(0).toUpperCase() || 'U'} - Profile
                        </Link>
                        <button
                          onClick={handleSignOut}
                          className="w-full text-left px-4 py-3 text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                        >
                          Sign Out
                        </button>
                      </>
                    ) : isGuest ? (
                      <>
                        <button
                          onClick={handleSignOut}
                          className="w-full text-left px-4 py-3 text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                        >
                          Exit Guest Mode
                        </button>
                      </>
                    ) : (
                      <Link
                        to="/login"
                        className="block px-4 py-3 text-brand-primary hover:bg-gray-50 hover:text-brand-primary/90 font-medium"
                      >
                        Sign In
                      </Link>
                    )}
                  </div>
                </div>
              )}
              {!mobileMenuOpen && (
                <div className="hidden md:flex items-center gap-3">
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
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1" id="main-content">
        {children}
      </main>

      <footer className="bg-gray-50 border-t border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-center md:text-left">
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