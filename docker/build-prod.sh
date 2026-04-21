#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ ! -f "$ROOT/.env.production" ]; then
  echo "[budojo] ERROR: .env.production not found. Create it before building for production."
  exit 1
fi

echo "[budojo] Building production images..."
docker compose -f "$ROOT/docker-compose.prod.yml" build --no-cache

echo "[budojo] Starting production containers..."
docker compose -f "$ROOT/docker-compose.prod.yml" up -d

echo "[budojo] Running migrations..."
docker compose -f "$ROOT/docker-compose.prod.yml" exec api php artisan migrate --force

echo "[budojo] Done. Client: http://localhost | API: http://localhost:8000"
