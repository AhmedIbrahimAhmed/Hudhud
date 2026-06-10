# Hudhud backend — Node + Express (ESM) with PostgreSQL via `pg`.
FROM node:20-alpine

WORKDIR /app

# Install dependencies first (better layer caching). `pg` is pure JS, so no
# native build tools are required.
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# Copy the application source.
COPY . .

# Uploaded avatars live here; the compose file mounts a volume on top so they
# persist across rebuilds.
RUN mkdir -p uploads

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "server.js"]
