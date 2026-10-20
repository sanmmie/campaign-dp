import { useState, useCallback } from 'react';
import { useAuthStore } from '../store';
import { env } from '../config/env';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface ApiRequestOptions {
  method?: HttpMethod;
  body?: unknown;
  headers?: Record<string, string>;
  retryOn401?: boolean;
  timeoutMs?: number;
  maxRetries?: number;
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
  isRetryable: boolean;

  constructor(message: string, status: number, payload?: ApiErrorPayload, isRetryable = false) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = payload?.code;
    this.payload = payload;
    this.isRetryable = isRetryable;
  }
}

const unsafeMethods = new Set<HttpMethod>(['POST', 'PUT', 'PATCH', 'DELETE']);
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_RETRIES = 3;

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function userFriendlyMessage(status: number, message: string): string {
  switch (status) {
    case 400:
      return 'Invalid request. Please check your input and try again.';
    case 401:
      return 'Your session has expired. Please sign in again.';
    case 403:
      return 'You do not have permission to perform this action.';
    case 404:
      return 'The requested resource was not found.';
    case 409:
      return 'This action conflicts with the current state. Please try again.';
    case 413:
      return 'The file is too large. Please upload a smaller file.';
    case 429:
      return 'Too many requests. Please wait a moment and try again.';
    case 500:
      return 'A server error occurred. Please try again later.';
    case 502:
    case 503:
    case 504:
      return 'The service is temporarily unavailable. Please try again later.';
    default:
      return message || 'An error occurred.';
  }
}

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendRequest(
  path: string,
  options: ApiRequestOptions,
  signal: AbortSignal
): Promise<Response> {
  const method = options.method || 'GET';

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...options.headers,
  };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (unsafeMethods.has(method)) {
    const token = getCsrfToken();
    if (token) {
      headers['X-CSRF-Token'] = token;
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
    signal,
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
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await sendRequest(path, options, controller.signal);
      clearTimeout(timeoutId);

      const shouldRetryAuth =
        response.status === 401 &&
        options.retryOn401 !== false &&
        !isAuthEndpoint(path) &&
        attempt === 0;

      if (shouldRetryAuth) {
        const refreshed = await refreshSessionOnce();

        if (refreshed) {
          const retryResponse = await sendRequest(path, {
            ...options,
            retryOn401: false,
          }, controller.signal);
          clearTimeout(timeoutId);

          const payload = await parseJson<ApiErrorPayload>(retryResponse);

          if (!retryResponse.ok) {
            if (retryResponse.status === 401) {
              useAuthStore.getState().clearAuth();
            }
            throw new ApiError(
              userFriendlyMessage(
                retryResponse.status,
                payload?.message || payload?.error || `Request failed with status ${retryResponse.status}`
              ),
              retryResponse.status,
              payload || undefined,
              isRetryableStatus(retryResponse.status)
            );
          }

          return payload as T;
        }
      }

      const payload = await parseJson<ApiErrorPayload>(response);

      if (!response.ok) {
        if (response.status === 401) {
          useAuthStore.getState().clearAuth();
        }

        const isRetryable = isRetryableStatus(response.status) && attempt < maxRetries;
        const error = new ApiError(
          userFriendlyMessage(
            response.status,
            payload?.message || payload?.error || `Request failed with status ${response.status}`
          ),
          response.status,
          payload || undefined,
          isRetryable
        );

        if (isRetryable) {
          lastError = error;
          const backoff = Math.pow(2, attempt) * 1000;
          await sleep(backoff);
          continue;
        }

        throw error;
      }

      return payload as T;
    } catch (err) {
      clearTimeout(timeoutId);

      if (err instanceof ApiError) {
        if (err.isRetryable && attempt < maxRetries) {
          lastError = err;
          const backoff = Math.pow(2, attempt) * 1000;
          await sleep(backoff);
          continue;
        }
        throw err;
      }

      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          const timeoutError = new ApiError(
            'The request timed out. Please check your connection and try again.',
            408,
            undefined,
            true
          );
          if (attempt < maxRetries) {
            lastError = timeoutError;
            const backoff = Math.pow(2, attempt) * 1000;
            await sleep(backoff);
            continue;
          }
          throw timeoutError;
        }

        lastError = err;
        if (attempt < maxRetries) {
          const backoff = Math.pow(2, attempt) * 1000;
          await sleep(backoff);
          continue;
        }
        throw err;
      }
    }
  }

  throw lastError || new ApiError('Request failed', 500, undefined, false);
}

interface UploadResult {
  url: string;
  path: string;
  width: number;
  height: number;
  format: string;
  size: number;
}

export async function apiUpload(
  file: File,
  temp = false,
  options: ApiRequestOptions = {}
): Promise<UploadResult> {
  const formData = new FormData();
  formData.append('file', file);

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const query = temp ? '?temp=true' : '';
      const response = await fetch(`${apiUrl('/upload')}${query}`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const payload = await parseJson<{ error?: string; message?: string }>(response);

      if (!response.ok) {
        if (response.status === 401) {
          useAuthStore.getState().clearAuth();
        }

        const isRetryable = isRetryableStatus(response.status) && attempt < maxRetries;
        const error = new ApiError(
          userFriendlyMessage(
            response.status,
            payload?.message || payload?.error || `Upload failed with status ${response.status}`
          ),
          response.status,
          payload || undefined,
          isRetryable
        );

        if (isRetryable) {
          lastError = error;
          const backoff = Math.pow(2, attempt) * 1000;
          await sleep(backoff);
          continue;
        }

        throw error;
      }

      return payload as UploadResult;
    } catch (err) {
      clearTimeout(timeoutId);

      if (err instanceof ApiError) {
        if (err.isRetryable && attempt < maxRetries) {
          lastError = err;
          const backoff = Math.pow(2, attempt) * 1000;
          await sleep(backoff);
          continue;
        }
        throw err;
      }

      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          const timeoutError = new ApiError(
            'The upload timed out. Please check your connection and try again.',
            408,
            undefined,
            true
          );
          if (attempt < maxRetries) {
            lastError = timeoutError;
            const backoff = Math.pow(2, attempt) * 1000;
            await sleep(backoff);
            continue;
          }
          throw timeoutError;
        }

        lastError = err;
        if (attempt < maxRetries) {
          const backoff = Math.pow(2, attempt) * 1000;
          await sleep(backoff);
          continue;
        }
        throw err;
      }
    }
  }

  throw lastError || new ApiError('Upload failed', 500, undefined, false);
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
      body?: unknown,
      opts?: { maxRetries?: number; timeoutMs?: number }
    ): Promise<T | null> => {
      setLoading(true);
      setError(null);

      try {
        const data = await apiRequest<T>(endpoint, {
          method,
          body,
          retryOn401: true,
          maxRetries: opts?.maxRetries,
          timeoutMs: opts?.timeoutMs,
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
    async (
      file: File,
      temp?: boolean,
      opts?: { maxRetries?: number; timeoutMs?: number }
    ): Promise<UploadResult | null> => {
      setLoading(true);
      setError(null);

      try {
        const data = await apiUpload(file, temp, {
          maxRetries: opts?.maxRetries,
          timeoutMs: opts?.timeoutMs,
        });
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
