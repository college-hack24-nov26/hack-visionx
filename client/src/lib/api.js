export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const ACCESS_KEY = 'fws_access';
const REFRESH_KEY = 'fws_refresh';
const USER_KEY = 'fws_user';

export function getAccessToken() {
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_KEY);
}

export function getCachedUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveUser(user) {
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function saveSession(data) {
  if (data.accessToken) localStorage.setItem(ACCESS_KEY, data.accessToken);
  if (data.refreshToken) localStorage.setItem(REFRESH_KEY, data.refreshToken);
  if (data.user) saveUser(data.user);
}

let suspendedHandler = null;
export function setSuspendedHandler(fn) { suspendedHandler = fn; }

// A 403 carrying { suspended: true } anywhere means the account is
// suspended: drop the session and let the app show the suspension page.
export function noteSuspended(data) {
  if (data && data.suspended) {
    clearSession();
    if (suspendedHandler) suspendedHandler(data);
  }
}

export function clearSession() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
}

export async function tryRefresh() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (res.status === 403) {
      const d = await res.json().catch(() => null);
      noteSuspended(d);
      return false;
    }
    if (!res.ok) return false;
    const data = await res.json();
    if (!data.accessToken) return false;
    localStorage.setItem(ACCESS_KEY, data.accessToken);
    if (data.refreshToken) localStorage.setItem(REFRESH_KEY, data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

const NO_REFRESH_PATHS = ['/api/auth/login', '/api/auth/register', '/api/auth/refresh'];

async function request(path, options, retried) {
  const { body, headers, ...rest } = options;
  const finalHeaders = { ...(headers || {}) };
  let finalBody = body;
if (typeof body === 'string') {
  finalHeaders['Content-Type'] = 'application/json';
} else if (body !== undefined && body !== null && typeof body === 'object' && !(body instanceof FormData)) {
  finalHeaders['Content-Type'] = 'application/json';
  finalBody = JSON.stringify(body);
}

  const access = getAccessToken();
  if (access) finalHeaders.Authorization = `Bearer ${access}`;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...rest, headers: finalHeaders, body: finalBody });
  } catch {
    return { status: 0, data: { error: 'Backend unreachable' } };
  }

  let data = null;
  try { data = await res.json(); } catch { data = null; }

  if (res.status === 403 && data && data.suspended) noteSuspended(data);

  if (res.status === 401 && !retried && !NO_REFRESH_PATHS.includes(path)) {
    const ok = await tryRefresh();
    if (ok) return request(path, options, true);
    clearSession();
  }
  return { status: res.status, data: data || {} };
}

export function api(path, options = {}) {
  return request(path, options, false);
}

