import { useEffect, useState } from 'react';
import { useAuthStore } from '../store';
import { env } from '../config/env';
import { setCsrfToken } from './useApi';

export function useAuthBootstrap() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
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
          throw new Error('Unable to initialize CSRF protection');
        }

        const csrfData = (await csrfResponse.json()) as {
          csrfToken?: string;
        };

        if (!csrfData.csrfToken) {
          throw new Error('CSRF token was not returned by the backend');
        }

        setCsrfToken(csrfData.csrfToken);

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
      } catch (error) {
        if (!cancelled) {
          console.error('Auth bootstrap failed:', error);
          setCsrfToken(null);
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
