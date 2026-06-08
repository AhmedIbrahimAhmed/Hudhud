import { createContext, useContext, useEffect, useState } from 'react';
import api from '../api/client.js';

const AuthContext = createContext(null);
const USER_KEY = 'hudhud:user';

function cacheUser(u) {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(u));
  } catch {
    /* ignore */
  }
}
function loadCachedUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY)) || null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  // Start from the cached user so a reload (even offline) stays logged in.
  const [user, setUser] = useState(() =>
    localStorage.getItem('token') ? loadCachedUser() : null
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get('/auth/me')
      .then((r) => {
        setUser(r.data.user);
        cacheUser(r.data.user);
      })
      .catch((err) => {
        // Only log out on a real auth failure (401). Network/offline errors
        // keep the cached session so the user can keep working.
        if (err.status === 401) {
          localStorage.removeItem('token');
          localStorage.removeItem(USER_KEY);
          setUser(null);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const r = await api.post('/auth/login', { email, password });
    localStorage.setItem('token', r.data.token);
    cacheUser(r.data.user);
    setUser(r.data.user);
  }

  async function register(email, password, display_name) {
    const r = await api.post('/auth/register', { email, password, display_name });
    localStorage.setItem('token', r.data.token);
    cacheUser(r.data.user);
    setUser(r.data.user);
  }

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem(USER_KEY);
    // Clear all user-specific drafts from localStorage
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('hudhud:draft_')) {
        localStorage.removeItem(key);
      }
    });
    setUser(null);
  }

  function updateUser(u) {
    setUser(u);
    cacheUser(u);
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
