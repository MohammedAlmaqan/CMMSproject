const API_BASE = import.meta.env.VITE_API_URL || '/api';

let authToken: string | null = localStorage.getItem('cmms-api-token');
let apiActivityHandler: (() => void) | null = null;
let authFailureHandler: (() => void) | null = null;
let refreshInFlight: Promise<boolean> | null = null;

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

/**
 * Invoked when a request cannot be authenticated even after a refresh attempt -
 * the server-side session is gone (logged out, idle, revoked or expired). The
 * caller (the app layout) signs the user out and routes them to the login page.
 */
export function registerAuthFailureHandler(handler: () => void) {
  authFailureHandler = handler;
  return () => {
    if (authFailureHandler === handler) {
      authFailureHandler = null;
    }
  };
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// The auth routes drive the session themselves; a 401 from them must not trigger
// a refresh (login has no session yet, and refresh/logout would recurse).
const AUTH_PATHS = ['/auth/login', '/auth/refresh', '/auth/logout'];

function isAuthPath(path: string) {
  return AUTH_PATHS.some((p) => path.startsWith(p));
}

/**
 * Rotate the refresh cookie into a fresh access token. Single-flight on purpose:
 * when a short-lived access token expires, several in-flight requests can 401 at
 * once, and they must share one rotation rather than race to consume (and so
 * invalidate) one another's refresh token.
 */
async function refreshSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { token?: string };
      if (!data.token) return false;
      setAuthToken(data.token);
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

function notifyAuthFailure() {
  setAuthToken(null);
  authFailureHandler?.();
}

async function readErrorMessage(res: Response): Promise<string> {
  const body = await res.json().catch(() => ({ error: res.statusText }));
  return (body as { error?: string }).error || res.statusText;
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
  options: RequestInit = {},
  allowRefresh = true
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
    credentials: 'include',
  });

  if (res.status === 401 && allowRefresh && !isAuthPath(path)) {
    const refreshed = await refreshSession();
    if (refreshed) return request<T>(path, options, false);
    notifyAuthFailure();
    throw new ApiError(401, await readErrorMessage(res));
  }

  if (!res.ok) {
    throw new ApiError(res.status, await readErrorMessage(res));
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
    const url = buildUrl(`${API_BASE}${path}`, params);
    const authHeaders = (): Record<string, string> =>
      authToken ? { Authorization: `Bearer ${authToken}` } : {};

    let res = await fetch(url, { headers: authHeaders(), credentials: 'include' });
    // An expired access token shows up here too; refresh once and retry.
    if (res.status === 401 && !isAuthPath(path)) {
      const refreshed = await refreshSession();
      if (refreshed) {
        res = await fetch(url, { headers: authHeaders(), credentials: 'include' });
      } else {
        notifyAuthFailure();
      }
    }
    if (!res.ok) {
      throw new ApiError(res.status, await readErrorMessage(res));
    }
    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = /filename="?([^";]+)"?/.exec(disposition);
    const filename = match ? match[1] : fallbackFilename;
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(objectUrl);
    notifyApiActivity();
  },
};

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  skip: number;
  take: number;
}
