#!/bin/sh
set -e

echo "==> Waiting for MySQL..."
while ! nc -z mysql 3306; do
  sleep 1
done
echo "==> MySQL is ready!"

echo "==> Waiting for Redis..."
while ! nc -z redis 6379; do
  sleep 1
done
echo "==> Redis is ready!"

# Generate key jika belum ada
if grep -q "APP_KEY=$" .env 2>/dev/null; then
    echo "==> Generating APP_KEY..."
    php artisan key:generate --force
fi

# Cache optimize (production)
if [ "$APP_ENV" = "production" ]; then
    echo "==> Caching config, routes, views..."
    php artisan config:cache
    php artisan route:cache
    php artisan view:cache
fi

# Run migration
echo "==> Running migrations..."
php artisan migrate --force

# Seed hanya jika tabel users kosong
USER_COUNT=$(php artisan tinker --execute="echo \App\Models\User::count();" 2>/dev/null || echo "0")
if [ "$USER_COUNT" = "0" ]; then
    echo "==> Seeding database..."
    php artisan db:seed --force
fi

echo "==> Starting PHP-FPM..."
exec "$@"
