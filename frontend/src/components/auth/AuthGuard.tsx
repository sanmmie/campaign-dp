import React, { ReactNode } from 'react';
import { useAuthStore } from '../../store';

interface AuthGuardProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export function AuthGuard({ children, fallback = null }: AuthGuardProps) {
  const { user, authReady } = useAuthStore();
  if (!authReady) {
    return <>{fallback}</>;
  }
  return user ? <>{children}</> : <>{fallback}</>;
}
