import { useState, useCallback } from 'react';
import { useAuthStore } from '../store';
import { env } from '../config/env';

// Single-flight: Supabase rotates refresh tokens, so concurrent refreshes
// (several requests at once) must share one network call.
let refreshInFlight: Promise<string | null> | null = null;

async function doRefresh(): Promise<string | null> {
  const { refreshToken } = useAuthStore.getState();
  if (!refreshToken) return null;

  try {
    const response = await fetch(`${env.VITE_API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!response.ok) return null;

    const data = await response.json();
    if (!data.token) return null;

    useAuthStore
      .getState()
      .setTokens(data.token, data.refreshToken ?? null, data.expiresAt ?? null);
    return data.token as string;
  } catch {
    return null;
  }
}

function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export function useApi() {
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = useCallback(async <T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    body?: unknown
  ): Promise<T | null> => {
    setLoading(true);
    setError(null);

    const send = (token: string | null) => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      return fetch(`${env.VITE_API_URL}/api${endpoint}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    };

    try {
      const sentToken = useAuthStore.getState().token;
      let response = await send(sentToken);

      // One silent refresh + retry for expired access tokens. Auth endpoints
      // are excluded so a wrong password (401) can never loop.
      if (response.status === 401 && !endpoint.startsWith('/auth/')) {
        // Another tab may already have refreshed; pick up its tokens first.
        await useAuthStore.persist.rehydrate();
        const latest = useAuthStore.getState().token;

        let retryToken: string | null = null;
        if (latest && latest !== sentToken) {
          retryToken = latest;
        } else if (useAuthStore.getState().refreshToken) {
          retryToken = await refreshAccessToken();
        }

        if (retryToken) {
          response = await send(retryToken);
        }
      }

      if (!response.ok) {
        if (response.status === 401) {
          clearAuth();
          throw new Error('Session expired. Please sign in again.');
        }
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Request failed: ${response.status}`);
      }

      return await response.json();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [clearAuth]);

  return { request, loading, error };
}