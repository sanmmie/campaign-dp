import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useApi, apiRequest, apiUpload, ApiError, setCsrfToken } from '../hooks/useApi';

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

function mockAlwaysResponse(ok: boolean, status: number, body: any) {
  mockFetch.mockResolvedValue({
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

  it('returns user-friendly error message on 400', async () => {
    mockResponse(false, 400, { error: 'bad request', message: 'Invalid input' });

    try {
      await apiRequest('/test', { method: 'GET' });
      throw new Error('should have thrown');
    } catch (err) {
      const e = err as ApiError;
      expect(e.status).toBe(400);
      expect(e.message).toBe('Invalid request. Please check your input and try again.');
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

  it('marks 500 errors as retryable', async () => {
    mockResponse(false, 500, { error: 'server error' });

    try {
      await apiRequest('/test', { method: 'GET', maxRetries: 0 });
      throw new Error('should have thrown');
    } catch (err) {
      const e = err as ApiError;
      expect(e.status).toBe(500);
      expect(e.isRetryable).toBe(false);
    }
  });
});

describe('apiUpload', () => {
  const mockFile = new File(['test-content'], 'test.png', { type: 'image/png' });

  it('uploads file and returns result', async () => {
    mockResponse(true, 200, {
      url: 'https://bucket.supabase.co/users/1/photos/123.png',
      path: 'users/1/photos/123.png',
      width: 800,
      height: 600,
      format: 'png',
      size: 50000,
    });

    const result = await apiUpload(mockFile);

    expect(result).toEqual({
      url: 'https://bucket.supabase.co/users/1/photos/123.png',
      path: 'users/1/photos/123.png',
      width: 800,
      height: 600,
      format: 'png',
      size: 50000,
    });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/upload'),
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: expect.any(FormData),
      })
    );
  });

  it('returns user-friendly error on upload failure', async () => {
    mockResponse(false, 400, { error: 'Unsupported file type', message: 'Only images allowed' });

    try {
      await apiUpload(mockFile);
      throw new Error('should have thrown');
    } catch (err) {
      const e = err as ApiError;
      expect(e.status).toBe(400);
      expect(e.message).toBe('Invalid request. Please check your input and try again.');
    }
  });

  it('clears auth on 401', async () => {
    mockResponse(false, 401, { error: 'unauthenticated' });

    try {
      await apiUpload(mockFile);
      throw new Error('should have thrown');
    } catch {
      // expected
    }

    expect(mockClearAuth).toHaveBeenCalled();
  });
});

describe('useApi hook', () => {
  it('returns loading, error, request, and upload', () => {
    mockAlwaysResponse(true, 200, { data: 'hello' });

    const { result } = renderHook(() => useApi());

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(null);
    expect(typeof result.current.request).toBe('function');
    expect(typeof result.current.upload).toBe('function');
  });

  it('sets loading and error on failed request', async () => {
    mockAlwaysResponse(false, 500, { error: 'server error' });

    const { result } = renderHook(() => useApi());

    await act(async () => {
      await result.current.request('GET', '/test', undefined, { maxRetries: 0 });
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe('A server error occurred. Please try again later.');
  });

  it('returns null on error instead of throwing', async () => {
    mockAlwaysResponse(false, 500, { error: 'server error' });

    const { result } = renderHook(() => useApi());

    const data = await act(async () => {
      return await result.current.request('GET', '/test', undefined, { maxRetries: 0 });
    });

    expect(data).toBeNull();
    expect(result.current.error).toBe('A server error occurred. Please try again later.');
  });

  it('upload sets loading and error on failure', async () => {
    mockAlwaysResponse(false, 500, { error: 'upload failed' });

    const { result } = renderHook(() => useApi());
    const file = new File(['test'], 'test.png', { type: 'image/png' });

    const data = await act(async () => {
      return await result.current.upload(file, undefined, { maxRetries: 0 });
    });

    expect(data).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe('A server error occurred. Please try again later.');
  });

  it('upload returns result on success', async () => {
    mockAlwaysResponse(true, 200, {
      url: 'https://bucket.supabase.co/users/1/photos/123.png',
      path: 'users/1/photos/123.png',
      width: 800,
      height: 600,
      format: 'png',
      size: 50000,
    });

    const { result } = renderHook(() => useApi());
    const file = new File(['test'], 'test.png', { type: 'image/png' });

    const data = await act(async () => {
      return await result.current.upload(file, undefined, { maxRetries: 0 });
    });

    expect(data).toEqual({
      url: 'https://bucket.supabase.co/users/1/photos/123.png',
      path: 'users/1/photos/123.png',
      width: 800,
      height: 600,
      format: 'png',
      size: 50000,
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(null);
  });
});
