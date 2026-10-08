import { env } from '../config/env';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

interface RequestInit {
  method?: HttpMethod;
  body?: unknown;
  headers?: Record<string, string>;
}

class ApiClient {
  private baseURL: string;

  constructor() {
    this.baseURL = env.VITE_API_URL;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const { method = 'GET', body, headers = {} } = options;
    const token = localStorage.getItem('auth_token');

    const response = await fetch(`${this.baseURL}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (response.status === 401) {
      localStorage.removeItem('auth_token');
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
      throw new Error('Unauthorized');
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message =
        (errorData as { error?: string }).error || `Request failed: ${response.status}`;
      throw new Error(message);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  async get<T>(url: string): Promise<T> {
    return this.request<T>(url);
  }

  async post<T>(url: string, data?: unknown): Promise<T> {
    return this.request<T>(url, { method: 'POST', body: data });
  }

  async put<T>(url: string, data?: unknown): Promise<T> {
    return this.request<T>(url, { method: 'PUT', body: data });
  }

  async patch<T>(url: string, data?: unknown): Promise<T> {
    return this.request<T>(url, { method: 'PATCH', body: data });
  }

  async delete<T>(url: string): Promise<T> {
    return this.request<T>(url, { method: 'DELETE' });
  }
}

export const api = new ApiClient();
