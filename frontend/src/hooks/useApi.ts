import { useState, useCallback } from 'react';
import { useAuthStore } from '../store';
import { env } from '../config/env';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface ApiRequestOptions {
  method?: HttpMethod;
  body?: unknown;
  headers?: Record<string, string>;
  retryOn401?: boolean;
}

interface ApiErrorPayload {
  error?: string;
  message?: string;
  code?: string;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  payload?: ApiErrorPayload;

  constructor(message: string, status: number, payload?: ApiErrorPayload) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = payload?.code;
    this.payload = payload;
  }
}

const unsafeMethods = new Set<HttpMethod>(['POST', 'PUT', 'PATCH', 'DELETE']);

function apiUrl(path: string): string {
  return `${env.VITE_API_URL}/api${path}`;
}

function isAuthEndpoint(path: string): boolean {
  return (
    path === '/auth/login' ||
    path === '/auth/signup' ||
    path === '/auth/refresh' ||
    path === '/auth/logout' ||
    path === '/auth/me' ||
    path === '/auth/csrf'
  );
}

function getCsrfToken(): string | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const match = document.cookie.match(
    /(?:^|; )\s*csrf_token=([^;]*)/
  );
  return match ? match[1] : null;
}

async function parseJson<T>(response: Response): Promise<T | null> {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return null;
  }
  return (await response.json()) as T;
}

async function sendRequest(
  path: string,
  options: ApiRequestOptions
): Promise<Response> {
  const method = options.method || 'GET';

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...options.headers,
  };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  // Double-submit CSRF: send the csrf_token cookie value as X-CSRF-Token
  // header on state-changing requests.
  if (unsafeMethods.has(method)) {
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }
  }

  return fetch(apiUrl(path), {
    method,
    credentials: 'include',
    headers,
    body:
      options.body === undefined
        ? undefined
        : JSON.stringify(options.body),
  });
}

async function refreshSession(): Promise<boolean> {
  try {
    const response = await fetch(`${env.VITE_API_URL}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
      },
    });

    return response.ok;
  } catch {
    return false;
  }
}

let refreshInFlight: Promise<boolean> | null = null;

function refreshSessionOnce(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = refreshSession().finally(() => {
      refreshInFlight = null;
    });
  }

  return refreshInFlight;
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  let response = await sendRequest(path, options);

  const shouldRetry =
    response.status === 401 &&
    options.retryOn401 !== false &&
    !isAuthEndpoint(path);

  if (shouldRetry) {
    const refreshed = await refreshSessionOnce();

    if (refreshed) {
      response = await sendRequest(path, {
        ...options,
        retryOn401: false,
      });
    }
  }

  const payload = await parseJson<ApiErrorPayload>(response);

  if (!response.ok) {
    if (response.status === 401) {
      useAuthStore.getState().clearAuth();
    }

    throw new ApiError(
      payload?.message ||
        payload?.error ||
        `Request failed with status ${response.status}`,
      response.status,
      payload || undefined
    );
  }

  return payload as T;
}

export async function getCurrentUser() {
  return apiRequest<{
    user: {
      id: string;
      email: string;
      role?: string;
    };
    isAdmin: boolean;
  }>('/auth/me', {
    method: 'GET',
    retryOn401: false,
  });
}

export async function logout(): Promise<void> {
  try {
    await apiRequest('/auth/logout', {
      method: 'POST',
      retryOn401: false,
    });
  } finally {
    useAuthStore.getState().clearAuth();
  }
}

/**
 * Hook for components that need to make API calls.
 * Cookies are sent automatically via `credentials: 'include'`.
 * On 401 (non-auth endpoints), clears auth state.
 */
export function useApi() {
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = useCallback(
    async <T>(
      method: HttpMethod,
      endpoint: string,
      body?: unknown
    ): Promise<T | null> => {
      setLoading(true);
      setError(null);

      try {
        const data = await apiRequest<T>(endpoint, {
          method,
          body,
          retryOn401: true,
        });
        return data;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'An error occurred';
        setError(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [clearAuth]
  );

  return { request, loading, error };
}
