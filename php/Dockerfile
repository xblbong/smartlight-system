FROM php:8.4-fpm-alpine

RUN apk add --no-cache \
    git curl zip unzip \
    libzip-dev oniguruma-dev icu-dev \
    netcat-openbsd

RUN docker-php-ext-install \
    pdo pdo_mysql mbstring zip intl bcmath opcache

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html

# HANYA copy composer file dulu (best practice)
COPY ./smart-light-backend/composer.json ./
COPY ./smart-light-backend/composer.lock ./

RUN composer install --no-dev --optimize-autoloader || true

# baru copy full source
COPY ./smart-light-backend ./

COPY ./php/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

RUN chown -R www-data:www-data storage bootstrap/cache || true

EXPOSE 9000

ENTRYPOINT ["/entrypoint.sh"]
