import { createContext, useContext, useEffect, useState } from 'react';
import api from '../api/client.js';
import {
  getToken,
  setToken,
  getCachedUser,
  setCachedUser,
  clearAuth,
} from './token.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // Start from the cached user so a reload (even offline) stays logged in,
  // but only if we actually have a token.
  const [user, setUser] = useState(() => (getToken() ? getCachedUser() : null));
  const [loading, setLoading] = useState(true);

  // On app load, validate the stored token against /auth/me and clear it if
  // invalid/expired. (The axios response interceptor also redirects on 401,
  // but we still clear local state here so the UI is consistent immediately.)
  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api
      .get('/auth/me')
      .then((r) => {
        setUser(r.data.user);
        setCachedUser(r.data.user);
      })
      .catch((err) => {
        // Only log out on a real auth failure (401 — invalid/expired token).
        // Network/offline errors keep the cached session so the user can keep
        // working. The interceptor already cleared auth + redirected on 401.
        if (err.status === 401) {
          clearAuth();
          setUser(null);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const r = await api.post('/auth/login', { email, password });
    setToken(r.data.token);
    setCachedUser(r.data.user);
    setUser(r.data.user);
  }

  async function register(email, password, display_name) {
    const r = await api.post('/auth/register', { email, password, display_name });
    setToken(r.data.token);
    setCachedUser(r.data.user);
    setUser(r.data.user);
  }

  function logout() {
    // Clear ALL storage to prevent cross-user data leaks, then reset state.
    clearAuth();
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      /* ignore */
    }
    setUser(null);
  }

  function updateUser(u) {
    setUser(u);
    setCachedUser(u);
  }

  return (
    <AuthContext.Provider
      value={{ user, setUser: updateUser, loading, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
