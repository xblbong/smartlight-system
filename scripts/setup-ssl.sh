#!/bin/bash
# setup-ssl.sh — Setup HTTPS untuk smartlight.munndev.my.id
# Jalankan di VPS setelah DNS propagate

set -e

DOMAIN="smartlight.munndev.my.id"
PROJECT_DIR="/home/smartlight-system"

echo "=== Setup HTTPS untuk $DOMAIN ==="
echo ""

# 1. Install certbot
echo "[1/6] Installing certbot..."
apt update && apt install -y certbot python3-certbot-nginx

# 2. Check DNS
echo "[2/6] Checking DNS resolution..."
RESOLVED_IP=$(dig +short $DOMAIN | head -1)
SERVER_IP=$(curl -s ifconfig.me)

if [ "$RESOLVED_IP" != "$SERVER_IP" ]; then
    echo ""
    echo "   DNS belum propagate!"
    echo "   Domain $DOMAIN resolve ke: $RESOLVED_IP"
    echo "   Server IP: $SERVER_IP"
    echo ""
    echo "   Tunggu beberapa menit lalu jalankan lagi."
    echo "   Atau tambah DNS record:"
    echo "   Type: A | Name: smartlight | Value: $SERVER_IP"
    exit 1
fi
echo "   DNS OK: $DOMAIN → $RESOLVED_IP"

# 3. Stop containers yang pakai port 80
echo "[3/6] Stopping containers..."
cd $PROJECT_DIR
docker compose stop frontend

# 4. Generate SSL certificate
echo "[4/6] Generating SSL certificate..."
certbot certonly --standalone -d $DOMAIN --non-interactive --agree-tos --email admin@munndev.my.id

# 5. Update nginx config
echo "[5/6] Updating nginx config..."
cp nginx/frontend.conf nginx/frontend-http.conf.bak
cp nginx/frontend-ssl.conf nginx/frontend.conf

# 6. Update docker-compose untuk mount SSL certs
echo "[6/6] Updating docker-compose..."
if ! grep -q "letsencrypt" docker-compose.yml; then
    # Tambah volume mount untuk SSL certs
    sed -i '/\.\/nginx\/frontend.conf:\/etc\/nginx\/conf.d\/frontend.conf:ro/a\      - /etc/letsencrypt:/etc/letsencrypt:ro' docker-compose.yml
fi

# 7. Rebuild dan restart
echo ""
echo "=== Rebuilding and restarting ==="
docker compose up -d --force-recreate frontend

echo ""
echo "===  Setup selesai! ==="
echo ""
echo "Akses: https://$DOMAIN"
echo ""
echo "Update ESP32 config.h:"
echo "  const char* API_BASE_URL = \"https://$DOMAIN/api\";"
echo ""
