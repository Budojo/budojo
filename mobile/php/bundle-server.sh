#!/usr/bin/env bash
# Packs Budojo's server for the phone (#2044, #2034), into the APK's assets:
#   budojo-server.zip  the server with its production vendor, as the desktop ships it
#   bundle.json        the bundle id, so the phone unpacks a new server only when there is one
#
# No database and no key travel in the APK: the phone makes its own on first
# start, as the desktop does (#1223), and migrates it at every start.
#
# Usage: bundle-server.sh <assets-dir>   (needs php 8.4 + composer on PATH)
set -euo pipefail

ASSETS="$(mkdir -p "$1" && cd "$1" && pwd)"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d)"

rsync -a --exclude vendor --exclude node_modules --exclude .env --exclude 'storage/logs/*' \
  --exclude 'storage/framework/*/*' --exclude 'bootstrap/cache/*.php' "$ROOT/server/" "$WORK/server/"
cd "$WORK/server"

# The server as the desktop ships it (release.yml): production vendor, no scripts.
composer install --no-dev --optimize-autoloader --no-interaction --no-scripts --prefer-dist --no-progress
rm -rf tests storage/logs/* storage/framework/*/* node_modules

rm -f "$ASSETS/budojo-server.zip" "$ASSETS/demo.sqlite" "$ASSETS/spike.json"
zip -qr -X "$ASSETS/budojo-server.zip" .
BUNDLE_ID="$(git -C "$ROOT" rev-parse --short HEAD)-$(date -u +%Y%m%d%H%M%S)"
cat > "$ASSETS/bundle.json" <<JSON
{"bundleId": "$BUNDLE_ID"}
JSON

ls -la "$ASSETS"
