import axios from 'axios';

// Single axios instance. Token is injected from localStorage on every request.
const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Normalize error messages, preserving the HTTP status (or null when the
// request never reached the server — e.g. offline).
api.interceptors.response.use(
  (r) => r,
  (err) => {
    const status = err.response?.status ?? null;
    const msg = err.response?.data?.error || 'حدث خطأ في الاتصال بالخادم';
    const e = new Error(msg);
    e.status = status;
    e.isNetworkError = status === null;
    return Promise.reject(e);
  }
);

export default api;
