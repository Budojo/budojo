#!/usr/bin/env bash
#
# One-command development environment.
#
# There is nothing to copy or fill in first: the api container's entrypoint
# installs Composer dependencies, seeds server/.env from server/.env.example,
# generates APP_KEY, creates the SQLite database and migrates it.
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "[budojo] Starting development environment..."
docker compose -f "$ROOT/docker-compose.yml" up --build "$@"
