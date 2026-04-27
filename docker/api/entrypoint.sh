#!/bin/sh
set -e

if [ "${RUN_MIGRATIONS:-0}" = "1" ]; then
    echo "Running database migrations..."
    php artisan migrate --force
else
    echo "Skipping database migrations (set RUN_MIGRATIONS=1 to enable)."
fi

exec "$@"
