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

RUN mkdir -p /var/www/api && chown -R www-data:www-data /var/www/api

COPY docker/api/nginx.conf /etc/nginx/sites-available/default
COPY docker/api/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

COPY docker/api/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

WORKDIR /var/www/api

EXPOSE 80

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["/usr/bin/supervisord", "-n", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
