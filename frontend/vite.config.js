import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import basicSsl from '@vitejs/plugin-basic-ssl';

// Set HTTPS=true to serve over self-signed HTTPS (needed for mic/PWA on phones).
const useHttps = process.env.HTTPS === 'true';

// Proxy /api and /uploads to the Express backend during development.
export default defineConfig({
  plugins: [
    react(),
    ...(useHttps ? [basicSsl()] : []),
    VitePWA({
      registerType: 'autoUpdate',
      // Enable the service worker in dev too, so offline reload works locally.
      devOptions: { enabled: true },
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'هدهد — أداة الصحفي الفلسطيني',
        short_name: 'هدهد',
        description: 'أداة تدقيق ومساعدة الصحفي الفلسطيني',
        lang: 'ar',
        dir: 'rtl',
        theme_color: '#0a7d4f',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
      },
      workbox: {
        // Precache the whole app shell (JS/CSS/HTML/assets) so every route is
        // available offline; on offline navigation fall back to index.html so a
        // reload of any page keeps working.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/, /^\/uploads/],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          // App DATA (GET): network-first so online users always get fresh data
          // and it resyncs automatically once back online; offline (or on a slow
          // network) it falls back to the last cached response, so a reload shows
          // the same content you last saw.
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api'),
            handler: 'NetworkFirst',
            method: 'GET',
            options: {
              cacheName: 'hudhud-api',
              networkTimeoutSeconds: 5,
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
          // App WRITES (POST/PUT/PATCH/DELETE): try the network; if offline, queue
          // the request and replay it automatically when connectivity returns
          // ("sync all"). Retained for up to 24h.
          ...['POST', 'PUT', 'PATCH', 'DELETE'].map((method) => ({
            urlPattern: ({ url }) => url.pathname.startsWith('/api'),
            handler: 'NetworkOnly',
            method,
            options: {
              backgroundSync: {
                name: 'hudhud-api-writes',
                options: { maxRetentionTime: 60 * 24 }, // minutes
              },
            },
          })),
          // Uploaded files (avatars, etc.) — show them offline.
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/uploads'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'hudhud-uploads',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Cloudinary media (chat attachments, task files) — cache for offline.
          {
            urlPattern: ({ url }) => url.origin === 'https://res.cloudinary.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'hudhud-cloudinary',
              expiration: { maxEntries: 150, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    // Allow access via tunnel hosts (cloudflared/ngrok) for HTTPS testing.
    allowedHosts: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:4000', ws: true },
      '/uploads': 'http://127.0.0.1:4000',
    },
  },
  // `vite preview` serves the production build — the only mode where the
  // service worker can fully cache the app for offline use.
  preview: {
    port: 4173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:4000', ws: true },
      '/uploads': 'http://127.0.0.1:4000',
    },
  },
});
