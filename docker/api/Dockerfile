FROM php:8.4-fpm

RUN apt-get update && apt-get install -y \
    git curl zip unzip nginx supervisor \
    libpng-dev libonig-dev libxml2-dev libzip-dev libicu-dev \
    && docker-php-ext-install pdo_mysql mbstring exif pcntl bcmath gd zip intl \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

RUN mkdir -p /var/www/api && chown -R www-data:www-data /var/www/api

COPY docker/api/nginx.conf /etc/nginx/sites-available/default
COPY docker/api/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

WORKDIR /var/www/api

EXPOSE 80

CMD ["/usr/bin/supervisord", "-n", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
