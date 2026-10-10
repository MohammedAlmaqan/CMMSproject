const API_BASE = import.meta.env.VITE_API_URL || '/api';

let authToken: string | null = localStorage.getItem('cmms-api-token');
let apiActivityHandler: (() => void) | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
  if (token) {
    localStorage.setItem('cmms-api-token', token);
  } else {
    localStorage.removeItem('cmms-api-token');
  }
}

export function getAuthToken() {
  return authToken;
}

export function registerApiActivityHandler(handler: () => void) {
  apiActivityHandler = handler;
  return () => {
    if (apiActivityHandler === handler) {
      apiActivityHandler = null;
    }
  };
}

export function notifyApiActivity() {
  apiActivityHandler?.();
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function buildUrl(path: string, params?: Record<string, string | number | boolean | undefined>) {
  if (!params) return path;
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') searchParams.set(k, String(v));
  });
  const qs = searchParams.toString();
  return qs ? `${path}?${qs}` : path;
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const res = await fetch(path.startsWith('http') ? path : `${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error || res.statusText);
  }

  if (res.status === 204) {
    notifyApiActivity();
    return {} as T;
  }
  const data = await res.json();
  notifyApiActivity();
  return data;
}

export const api = {
  get: <T>(path: string, params?: Record<string, string | number | boolean | undefined>) =>
    request<T>(buildUrl(path, params)),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  /**
   * Row 59. Fetch a binary export with the bearer token, then hand it to the
   * browser as a download. A plain link cannot carry the Authorization header,
   * so the file is fetched and turned into a blob URL instead.
   */
  download: async (
    path: string,
    params?: Record<string, string | number | boolean | undefined>,
    fallbackFilename = 'download'
  ): Promise<void> => {
    const headers: Record<string, string> = {};
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    const res = await fetch(buildUrl(`${API_BASE}${path}`, params), { headers });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new ApiError(res.status, body.error || res.statusText);
    }
    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = /filename="?([^";]+)"?/.exec(disposition);
    const filename = match ? match[1] : fallbackFilename;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    notifyApiActivity();
  },
};

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  skip: number;
  take: number;
}
