FROM php:8.3-fpm

RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl zip unzip \
    libzip-dev libonig-dev libicu-dev \
    libfreetype6-dev libjpeg62-turbo-dev libpng-dev \
    netcat-openbsd \
    && rm -rf /var/lib/apt/lists/*

RUN docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j$(nproc) \
    pdo pdo_mysql mbstring zip intl bcmath opcache gd \
    && pecl install redis \
    && docker-php-ext-enable redis

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html

# Copy composer files first (layer caching)
COPY ./smart-light-backend/composer.json ./smart-light-backend/composer.lock ./

# Install deps tanpa jalankan scripts (artisan belum ada)
RUN composer install --no-dev --optimize-autoloader --no-scripts

# Copy full source (termasuk artisan)
COPY ./smart-light-backend ./

# Jalankan scripts yang butuh artisan sekarang
RUN composer dump-autoload --optimize

COPY ./php/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Prepare writable directories
RUN mkdir -p storage/framework/{cache,sessions,views} \
    bootstrap/cache \
    && chown -R www-data:www-data storage bootstrap/cache \
    && chmod -R 775 storage bootstrap/cache

EXPOSE 9000

ENTRYPOINT ["/entrypoint.sh"]
CMD ["php-fpm", "-F"]
