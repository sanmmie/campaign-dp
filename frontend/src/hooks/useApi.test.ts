import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useApi, apiRequest, ApiError, setCsrfToken } from '../hooks/useApi';

const mockClearAuth = vi.fn();
const mockSetAuth = vi.fn();
const mockSetAuthReady = vi.fn();

vi.mock('../store', () => ({
  useAuthStore: Object.assign(
    vi.fn((selector: any) => selector({
      clearAuth: mockClearAuth,
      setAuth: mockSetAuth,
      setAuthReady: mockSetAuthReady,
    })),
    { getState: vi.fn(() => ({ clearAuth: mockClearAuth, setAuth: mockSetAuth, setAuthReady: mockSetAuthReady })) }
  ),
}));

const mockFetch = vi.fn();
(global as any).fetch = mockFetch;

function mockResponse(ok: boolean, status: number, body: any) {
  mockFetch.mockResolvedValueOnce({
    ok,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
  } as Response);
}

beforeEach(() => {
  mockFetch.mockClear();
  mockClearAuth.mockClear();
  mockSetAuth.mockClear();
  mockSetAuthReady.mockClear();
  setCsrfToken(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('apiRequest', () => {
  it('returns parsed JSON on success', async () => {
    mockResponse(true, 200, { data: 'hello' });

    const result = await apiRequest<{ data: string }>('/test', { method: 'GET' });

    expect(result).toEqual({ data: 'hello' });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/test'),
      expect.objectContaining({ method: 'GET', credentials: 'include' })
    );
  });

  it('throws ApiError on non-ok response', async () => {
    mockResponse(false, 400, { error: 'bad request', message: 'Invalid input' });

    try {
      await apiRequest('/test', { method: 'GET' });
      throw new Error('should have thrown');
    } catch (err) {
      const e = err as ApiError;
      expect(e.status).toBe(400);
      expect(e.message).toBe('Invalid input');
    }
  });

  it('clears auth on 401', async () => {
    mockResponse(false, 401, { error: 'unauthenticated' });

    try {
      await apiRequest('/test', { method: 'GET', retryOn401: false });
      throw new Error('should have thrown');
    } catch {
      // expected
    }

    expect(mockClearAuth).toHaveBeenCalled();
  });

  it('clears auth on 401 for auth endpoints too', async () => {
    mockResponse(false, 401, { error: 'unauthenticated' });

    try {
      await apiRequest('/auth/me', { method: 'GET', retryOn401: false });
      throw new Error('should have thrown');
    } catch {
      // expected
    }

    expect(mockClearAuth).toHaveBeenCalled();
  });

  it('returns null body for non-json responses', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/plain' }),
      json: async () => { throw new Error('not json'); },
    } as unknown as Response);

    const result = await apiRequest<string>('/test', { method: 'GET' });
    expect(result).toBeNull();
  });
});

describe('useApi hook', () => {
  it('returns loading, error, and request', () => {
    const { result } = renderHook(() => useApi());

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(null);
    expect(typeof result.current.request).toBe('function');
  });

  it('sets loading and error on failed request', async () => {
    mockResponse(false, 500, { error: 'server error' });

    const { result } = renderHook(() => useApi());

    await act(async () => {
      await result.current.request('GET', '/test');
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe('server error');
  });

  it('returns null on error instead of throwing', async () => {
    mockResponse(false, 500, { error: 'server error' });

    const { result } = renderHook(() => useApi());

    const data = await act(async () => {
      return await result.current.request('GET', '/test');
    });

    expect(data).toBeNull();
    expect(result.current.error).toBe('server error');
  });
});
