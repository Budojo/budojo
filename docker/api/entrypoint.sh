#!/bin/sh
#
# Development entrypoint. Brings a fresh clone to a working API with no manual
# step at all — install deps, seed server/.env, generate the app key,
# create the SQLite database, migrate, then hand over to supervisord.
#
# Every step is idempotent: a restart re-runs this script and must be a no-op.
set -e

APP_DIR=/var/www/api
ENV_FILE="$APP_DIR/.env"
SQLITE_DIR="$APP_DIR/database/sqlite"

# --- Dependencies -----------------------------------------------------------
# The source tree is bind-mounted, so vendor/ lives on the host and survives
# rebuilds. Installing here (rather than at image build time) is what makes a
# fresh clone work without the developer having PHP or Composer installed.
if [ ! -f "$APP_DIR/vendor/autoload.php" ]; then
    echo "==> vendor/ missing, running composer install"
    composer install --no-interaction --prefer-dist
fi

# --- Environment file -------------------------------------------------------
if [ ! -f "$ENV_FILE" ]; then
    echo "==> server/.env missing, seeding it from .env.example"
    cp "$APP_DIR/.env.example" "$ENV_FILE"
fi

# Compose injects the root .env into this container, and a real environment
# variable always beats a dotenv line. An APP_KEY exported as an empty string
# would therefore shadow the generated key in server/.env and boot Laravel
# without an encryption key. Drop it so the file wins.
if [ -z "${APP_KEY:-}" ]; then
    unset APP_KEY
    if ! grep -qE '^APP_KEY=base64:' "$ENV_FILE"; then
        echo "==> generating APP_KEY into server/.env"
        php artisan key:generate --force --no-interaction
    fi
fi

# --- SQLite database --------------------------------------------------------
# Lives on a named volume (see docker-compose.yml) which Docker creates
# root-owned; php-fpm runs as www-data and needs the directory too, not just
# the file — SQLite writes -wal and -shm siblings next to the database.
mkdir -p "$SQLITE_DIR"
DB_FILE="${DB_DATABASE:-$SQLITE_DIR/budojo.sqlite}"
if [ ! -f "$DB_FILE" ]; then
    echo "==> creating SQLite database at $DB_FILE"
    touch "$DB_FILE"
fi
chown -R www-data:www-data "$SQLITE_DIR"

# storage/ and bootstrap/cache must be writable by php-fpm. Harmless to
# re-apply; the bind mount can come back with host ownership after a rebuild.
#
# vendor/ and .env are in the list because the two steps above that create them
# run as root, and on a Linux bind mount that means root ON THE HOST. www-data
# is remapped to the host developer's uid in the Dockerfile, so this hands them
# back rather than taking them away — and .env is the one file the developer
# actually has to edit by hand.
chown -R www-data:www-data \
    "$APP_DIR/storage" "$APP_DIR/bootstrap/cache" "$APP_DIR/vendor" "$ENV_FILE" \
    2>/dev/null || true

# --- Public storage symlink -------------------------------------------------
# Avatars, academy logos and community thumbnails all go through
# `Storage::disk('public')->url(...)`, which resolves to /storage/<path>. That
# path only exists once public/storage points at storage/app/public — without
# it every one of those URLs is a 403, which is exactly what the dev
# environment has been doing (measured: 403 before, 200 after).
#
# `--relative` matters here: the default writes an absolute /var/www/api/...
# target, which dangles when the same bind mount is read from the host.
#
# `--force` matters too, and is not belt-and-braces: a plain re-run over an
# existing link is a no-op, so a checkout that already has the ABSOLUTE symlink
# from an older image would keep it forever. --force recreates it relative.
# Verified: plain re-run left /var/www/api/storage/app/public untouched,
# --force rewrote it to ../storage/app/public.
#
# Best-effort — a missing symlink costs images, not the API, so it must not
# stop the container booting.
php artisan storage:link --relative --force --silent || true
chown -h www-data:www-data "$APP_DIR/public/storage" 2>/dev/null || true

# --- Migrations -------------------------------------------------------------
if [ "${RUN_MIGRATIONS:-0}" = "1" ]; then
    echo "==> running database migrations"
    php artisan migrate --force
else
    echo "==> skipping database migrations (set RUN_MIGRATIONS=1 to enable)"
fi

exec "$@"
