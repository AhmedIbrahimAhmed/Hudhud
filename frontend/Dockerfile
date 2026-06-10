# Hudhud frontend — multi-stage: build the Vite/React app, then serve the
# static dist/ with nginx (SPA fallback + reverse-proxy to the backend).

# --- Stage 1: build ---
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci || npm install

COPY . .

# The app talks to the backend over a relative `/api` base URL (see
# src/api/client.js), which nginx proxies at runtime — so no build-time API URL
# is required. The arg is accepted for forward-compat / overrides.
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

RUN npm run build

# --- Stage 2: serve ---
FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
