// Centralized auth token + cached-user storage. Single source of truth for
// reading/writing/clearing the JWT and the cached user, used by both the axios
// client and AuthContext so the two never drift apart.

const TOKEN_KEY = 'token';
const USER_KEY = 'hudhud:user';

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export function getCachedUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY)) || null;
  } catch {
    return null;
  }
}

export function setCachedUser(user) {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
}

// Fully clear auth state (token + cached user). Used on logout and on a 401.
export function clearAuth() {
  setToken(null);
  setCachedUser(null);
}
