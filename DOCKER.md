# Running Hudhud with Docker

The full stack — PostgreSQL, the Express backend, and the React frontend
(served by nginx) — runs with a single `docker compose` command.

## 1. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set at least:

- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` — database credentials.
- `JWT_SECRET` — any long random string (required for login).

All the API keys (`GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `OPENAI_API_KEY`,
`DEEPGRAM_API_KEY`, Cloudinary, image-detection, etc.) are **optional** — the
related features simply stay disabled when a key is missing. `.env` is
gitignored, so your secrets never get committed.

## 2. Build and start

```bash
docker compose up --build
```

This starts three services:

| Service    | Image / build      | Port (host) | Notes                                   |
|------------|--------------------|-------------|------------------------------------------|
| `db`       | postgres:16-alpine | (internal)  | Data persists in the `pgdata` volume.    |
| `backend`  | `./backend`        | 4000        | Auto-applies `schema.sql` on startup.    |
| `frontend` | `./frontend`       | 8080        | nginx serving the built SPA.             |

The backend waits for Postgres to be healthy (`pg_isready`) before starting,
and retries the DB connection on boot, so ordering is handled automatically.

## 3. Open the app

Visit **http://localhost:8080**

The frontend talks to the backend through a relative `/api` base URL. nginx
inside the frontend container reverse-proxies `/api` and `/uploads` to the
`backend` service (and forwards the WebSocket used for live transcription), so
no API hostname needs to be configured.

## How the frontend ↔ backend wiring works

- `frontend/src/api/client.js` uses a **relative** axios `baseURL` of `/api`.
- **Local dev (no Docker):** `vite.config.js` proxies `/api` and `/uploads` to
  `http://localhost:4000`. Run the backend with `npm run dev` and the frontend
  with `npm run dev` as before — unchanged.
- **Docker:** `frontend/nginx.conf` proxies `/api` and `/uploads` to
  `http://backend:4000` (service name on the compose network).

Because the base URL is relative in both cases, the same frontend build works
in local dev and in Docker without rebuilding.

## Persistence

- `pgdata` — PostgreSQL data.
- `backend_uploads` — uploaded avatars (`backend/uploads`).

To wipe everything (including the database):

```bash
docker compose down -v
```
