#!/usr/bin/env bash
# Packs Budojo's server for the phone (#2044), into the APK's assets:
#   budojo-server.zip  the server with its production vendor, as the desktop ships it
#   demo.sqlite        a demo academy, seeded here, so the spike measures real queries
#   spike.json         the bundle id, the APP_KEY the demo was seeded with, the demo login
#
# The demo login is a throwaway, random per build, for a test APK's demo data.
# Nothing here is a real credential. #2034 replaces all of this with the
# phone's own first-run bootstrap, as the desktop has (#1223).
#
# Usage: bundle-server.sh <assets-dir>   (needs php 8.4 + composer on PATH)
set -euo pipefail

ASSETS="$(mkdir -p "$1" && cd "$1" && pwd)"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d)"

rsync -a --exclude vendor --exclude node_modules --exclude .env --exclude 'storage/logs/*' \
  --exclude 'storage/framework/*/*' --exclude 'bootstrap/cache/*.php' "$ROOT/server/" "$WORK/server/"
cd "$WORK/server"

# 1. The demo database, with the dev dependencies the seeders need, under the
#    desktop's drivers, which DesktopDriverGuard insists on.
composer install --no-interaction --no-progress --prefer-dist
APP_KEY="base64:$(openssl rand -base64 32)"
DEMO_PASSWORD="$(openssl rand -hex 12)"
DATABASE="$WORK/demo.sqlite"
touch "$DATABASE"
env APP_ENV=local APP_KEY="$APP_KEY" DB_CONNECTION=sqlite DB_DATABASE="$DATABASE" \
  LOCAL_ADMIN_PASSWORD="$DEMO_PASSWORD" BUDOJO_RUNTIME=desktop \
  QUEUE_CONNECTION=sync CACHE_STORE=file SESSION_DRIVER=file \
  php artisan migrate --seed --force --no-interaction

# 2. The server as the desktop ships it (release.yml): production vendor, no scripts.
rm -rf vendor bootstrap/cache/*.php
composer install --no-dev --optimize-autoloader --no-interaction --no-scripts --prefer-dist --no-progress
rm -rf tests storage/logs/* storage/framework/*/* node_modules

rm -f "$ASSETS/budojo-server.zip"
zip -qr -X "$ASSETS/budojo-server.zip" .
cp "$DATABASE" "$ASSETS/demo.sqlite"
BUNDLE_ID="$(git -C "$ROOT" rev-parse --short HEAD)-$(date -u +%Y%m%d%H%M%S)"
cat > "$ASSETS/spike.json" <<JSON
{"bundleId": "$BUNDLE_ID", "appKey": "$APP_KEY", "demoEmail": "admin@example.it", "demoPassword": "$DEMO_PASSWORD"}
JSON

ls -la "$ASSETS"
echo "athletes in the demo: $(sqlite3 "$DATABASE" 'select count(*) from athletes' 2>/dev/null || echo '?')"
