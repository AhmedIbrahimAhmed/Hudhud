import axios from 'axios';
import { getToken, clearAuth } from '../auth/token.js';

// Single axios instance. Token is injected from centralized storage on every
// request via the request interceptor.
const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Requests to these endpoints should NOT trigger the global 401 redirect:
// a failed login/register is an expected error the page handles inline, and
// redirecting there would clobber the user's form / cause loops.
function isAuthEntryRequest(url = '') {
  return /\/auth\/(login|register)$/.test(url);
}

// Normalize error messages, preserving the HTTP status (or null when the
// request never reached the server — e.g. offline). On a 401 from any
// authenticated request (expired or invalid token), clear the stored token +
// cached user and bounce to /login so the user isn't stuck with a dead token.
api.interceptors.response.use(
  (r) => r,
  (err) => {
    const status = err.response?.status ?? null;
    const data = err.response?.data || {};
    const requestUrl = err.config?.url || '';

    if (status === 401 && !isAuthEntryRequest(requestUrl)) {
      clearAuth();
      // Avoid an infinite loop if we're already on the login page.
      if (
        typeof window !== 'undefined' &&
        window.location.pathname !== '/login'
      ) {
        window.location.assign('/login');
      }
    }

    const msg = data.error || 'حدث خطأ في الاتصال بالخادم';
    const e = new Error(msg);
    e.status = status;
    e.expired = !!data.expired;
    e.isNetworkError = status === null;
    return Promise.reject(e);
  }
);

export default api;
