import { useEffect, useState } from 'react';
import { useAuthStore } from '../store';
import { env } from '../config/env';

export function useAuthBootstrap() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        // Issue a CSRF token cookie for double-submit protection on
        // state-changing requests.
        const csrfResponse = await fetch(
          `${env.VITE_API_URL}/api/auth/csrf`,
          {
            method: 'GET',
            credentials: 'include',
            headers: {
              Accept: 'application/json',
            },
          }
        );

        if (!csrfResponse.ok) {
          // Non-fatal: CSRF token will be re-issued on the next unsafe request.
          // Continue to load the current user.
        }

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

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  return { ready };
}
