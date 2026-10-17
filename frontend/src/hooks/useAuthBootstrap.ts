import { useEffect, useState } from 'react';
import { useAuthStore } from '../store';
import { env } from '../config/env';

export function useAuthBootstrap() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadCurrentUser() {
      try {
        const response = await fetch(`${env.VITE_API_URL}/api/auth/me`, {
          method: 'GET',
          credentials: 'include',
          headers: {
            Accept: 'application/json',
          },
        });

        if (!response.ok) {
          useAuthStore.getState().clearAuth();
          return;
        }

        const data = await response.json();

        if (!cancelled) {
          useAuthStore.getState().setAuth(
            data.user,
            Boolean(data.isAdmin)
          );
        }
      } catch {
        if (!cancelled) {
          useAuthStore.getState().clearAuth();
        }
      } finally {
        if (!cancelled) {
          useAuthStore.getState().setAuthReady(true);
          setReady(true);
        }
      }
    }

    loadCurrentUser();

    return () => {
      cancelled = true;
    };
  }, []);

  return { ready };
}
