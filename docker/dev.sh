#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ ! -f "$ROOT/.env" ]; then
  echo "[budojo] .env not found — copying from .env.example"
  cp "$ROOT/.env.example" "$ROOT/.env"
fi

echo "[budojo] Starting development environment..."
docker compose -f "$ROOT/docker-compose.yml" up --build "$@"
