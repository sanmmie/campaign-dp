import React, { ReactNode, useEffect } from 'react';

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  useEffect(() => {
    // Rehydrate auth state from localStorage on mount
    const stored = localStorage.getItem('auth-storage');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.state?.token) {
          localStorage.setItem('auth_token', parsed.state.token);
        }
      } catch {
        // Ignore parse errors
      }
    }
  }, []);

  return <>{children}</>;
}