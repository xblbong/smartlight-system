#!/bin/sh

echo "Waiting for MySQL..."

while ! nc -z mysql 3306; do
  sleep 1
done

echo "MySQL started"

# Install vendor jika belum ada
if [ ! -d "vendor" ]; then
    composer install --no-dev --optimize-autoloader
fi

# Generate key jika belum ada
php artisan key:generate --force

# Cache optimize
php artisan config:cache
php artisan route:cache
php artisan view:cache

# Run migration
php artisan migrate --force

echo "Starting PHP-FPM..."

php-fpm
