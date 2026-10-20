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

let csrfToken: string | null = null;

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

function getCsrfToken(): string | null {
  return csrfToken;
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
    const token = getCsrfToken();

    const response = await fetch(`${env.VITE_API_URL}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(token ? { 'X-CSRF-Token': token } : {}),
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

interface UploadResult {
  url: string;
  path: string;
  width: number;
  height: number;
  format: string;
  size: number;
}

export async function apiUpload(file: File, temp = false): Promise<UploadResult> {
  const formData = new FormData();
  formData.append('file', file);

  const query = temp ? '?temp=true' : '';
  const response = await fetch(`${apiUrl('/upload')}${query}`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });

  const payload = await parseJson<{ error?: string; message?: string }>(response);

  if (!response.ok) {
    if (response.status === 401) {
      useAuthStore.getState().clearAuth();
    }
    throw new ApiError(
      payload?.message || payload?.error || `Upload failed with status ${response.status}`,
      response.status,
      payload || undefined
    );
  }

  return payload as UploadResult;
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

  const upload = useCallback(
    async (file: File, temp?: boolean): Promise<UploadResult | null> => {
      setLoading(true);
      setError(null);

      try {
        const data = await apiUpload(file, temp);
        return data;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed';
        setError(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { request, loading, error, upload };
}
