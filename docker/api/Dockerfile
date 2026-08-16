FROM php:8.4-fpm
# sqlite3 here is the CLI, for poking at the database inside the container.
# pdo_mysql is deliberately KEPT even though dev now runs on SQLite: reading
# the production MySQL dump during the data export (#1230) needs it, and that
# has to happen before the droplet is destroyed. pdo_sqlite and sqlite3 ship
# enabled in the official php image, so they are not in the ext-install list.

RUN apt-get update && apt-get install -y \
    git curl zip unzip nginx supervisor sqlite3 \
    libpng-dev libonig-dev libxml2-dev libzip-dev libicu-dev \
    && docker-php-ext-install pdo_mysql mbstring exif pcntl bcmath gd zip intl \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

# Align www-data with the host developer's uid/gid. DEVELOPMENT ONLY — the
# shipped desktop app has no container in it at all.
#
# `./server` is a bind mount, and on Linux a bind mount is the host's real
# filesystem: every file this container creates lands on the host owned by
# whoever wrote it, and `chown` inside the container really does re-own the
# host's inode. Left at the packaged uid 33 that is ~15k files — vendor/,
# server/.env, everything PEST writes under storage/framework — that the
# developer cannot edit or delete without sudo. server/.env is the worst of
# them: it is the single source of configuration for the whole app.
#
# Windows never showed this. Docker Desktop's 9p/virtiofs share fakes
# ownership and swallows chown(2), so the entrypoint's chowns were no-ops.
#
# Remapping here rather than in the entrypoint is deliberate: `usermod -u`
# re-owns the user's home directory, and www-data's home is /var/www — which
# at runtime contains the bind mount. At build time it holds two files.
#
# Override for a host that is not uid 1000:
#   docker compose build --build-arg HOST_UID=$(id -u) --build-arg HOST_GID=$(id -g)
ARG HOST_UID=1000
ARG HOST_GID=1000
RUN groupmod -o -g "$HOST_GID" www-data \
    && usermod -o -u "$HOST_UID" -g "$HOST_GID" www-data \
    # nginx workers run as www-data (`user www-data;` in nginx.conf) and these
    # were created under the packaged uid — the remap would strand them.
    && chown -R www-data:www-data /var/log/nginx /var/lib/nginx /var/www \
    && mkdir -p /var/www/api && chown -R www-data:www-data /var/www/api

COPY docker/api/nginx.conf /etc/nginx/sites-available/default
COPY docker/api/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

COPY docker/api/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

WORKDIR /var/www/api

EXPOSE 80

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["/usr/bin/supervisord", "-n", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
