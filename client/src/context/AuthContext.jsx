import { createContext, useContext, useEffect, useState } from 'react';
import { api, saveSession, saveUser, clearSession, getAccessToken, getRefreshToken, getCachedUser, setSuspendedHandler } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [suspension, setSuspension] = useState(() => {
    try {
      const raw = localStorage.getItem('fws_suspension');
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (s.until && new Date(s.until).getTime() <= Date.now()) return null;
      return s;
    } catch { return null; }
  });

  useEffect(() => {
    setSuspendedHandler((data) => {
      const s = { until: data.suspendedUntil || null, reason: data.suspendReason || '' };
      try { localStorage.setItem('fws_suspension', JSON.stringify(s)); } catch { /* private mode */ }
      setSuspension(s);
      setUser(null);
    });
  }, []);

  function clearSuspension() {
    try { localStorage.removeItem('fws_suspension'); } catch { /* ignore */ }
    setSuspension(null);
  }

  useEffect(() => {
    let cancelled = false;
    async function init() {
      if (!getAccessToken() && !getRefreshToken()) {
        setLoading(false);
        return;
      }
      const { status, data } = await api('/api/auth/me');
      if (cancelled) return;
      if (status === 200 && data.user) {
        setUser(data.user);
        saveUser(data.user);
      } else {
        setUser(null);
      }
      setLoading(false);
    }
    init();
    return () => { cancelled = true; };
  }, []);

  async function login(email, password) {
    const { status, data } = await api('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    if (status === 200 && data.accessToken) {
      saveSession(data);
      setUser(data.user);
      return { ok: true, user: data.user };
    }
    return { ok: false, status, error: data.error || 'Login failed' };
  }

  async function register(payload) {
    const { status, data } = await api('/api/auth/register', {
      method: 'POST',
      body: payload,
    });
    if (status === 201 && data.accessToken) {
      saveSession(data);
      setUser(data.user);
      return { ok: true, user: data.user };
    }
    if (status === 200) {
      // Duplicate account: neutral message, nothing created, NOT a login
      return { ok: false, status, duplicate: true, message: data.message || 'Please log in instead' };
    }
    if (status === 400 && data.errors) {
      return { ok: false, status, errors: data.errors };
    }
    return { ok: false, status, error: data.error || 'Registration failed' };
  }

  async function logout() {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      try {
        await api('/api/auth/logout', { method: 'POST', body: { refreshToken } });
      } catch {
        // ignore - we clear locally either way
      }
    }
    clearSession();
    setUser(null);
  }

  async function switchRole(role) {
    const { status, data } = await api('/api/auth/switch-role', {
      method: 'POST',
      body: { role },
    });
    if (status === 200 && data.user) {
      setUser(data.user);
      saveUser(data.user);
      return { ok: true, user: data.user };
    }
    return { ok: false, status, error: data.error || 'Could not switch role' };
  }

  async function refreshUser() {
    const { status, data } = await api('/api/auth/me');
    if (status === 200 && data.user) {
      setUser(data.user);
      saveUser(data.user);
      return data.user;
    }
    return null;
  }

  const value = { user, loading, login, register, logout, switchRole, refreshUser, suspension, clearSuspension };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

