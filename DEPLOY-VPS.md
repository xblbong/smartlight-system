# Deploy SmartLight ke VPS 109.111.53.197

## Arsitektur

```
Browser → :80 (Frontend/Nginx) → /api → Backend Nginx → PHP-FPM → MySQL + Redis
                                      ↑
ESP32 ──── POST /api/device/data ──────┘
```

Container:
- `smartlight-frontend` — React SPA + Nginx (port 80 ter-Expose)
- `smartlight-nginx`   — Backend Nginx (internal)
- `smartlight-backend`  — Laravel PHP-FPM (internal)
- `smartlight-mysql`    — MySQL 8.0 (port 3306 hanya localhost)
- `smartlight-redis`    — Redis 7 (port 6379 hanya localhost)
- `smartlight-queue`    — Laravel queue worker (internal)
- `smartlight-phpmyadmin` — phpMyAdmin (port 8081 hanya localhost)

---

## STEP 1: Setup VPS

```bash
# SSH ke VPS
ssh root@109.111.53.197

# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker

# Install Git & nano
apt install -y git nano

# Verify
docker --version
docker compose version
```

## STEP 2: Clone Project

```bash
cd /opt
git clone https://github.com/xblbong/smartlight-system.git
cd smartlight-system
```

## STEP 3: Setup Environment

```bash
# Copy template
cp .env.docker .env

# Edit — GANTI PASSWORD!
nano .env
```

Yang WAJIB diubah:
- `DB_PASSWORD` → password kuat untuk MySQL user
- `DB_ROOT_PASSWORD` → password kuat untuk MySQL root
- `APP_URL` → `http://109.111.53.197` (atau domain nanti)

## STEP 4: Build & Start

```bash
# Build semua image (butuh ~5-10 menit pertama kali)
docker compose build

# Start semua container
docker compose up -d

# Tunggu semua service ready (~30 detik)
docker compose ps

# Cek logs kalau ada error
docker compose logs -f
```

## STEP 5: Verifikasi

```bash
# Test API dari dalam VPS
curl http://localhost/api/settings

# Test dari luar (buka browser)
# http://109.111.53.197

# Cek container status
docker compose ps
# Semua harus "Up" dan mysql/redis harus "healthy"

# Cek logs jika ada masalah
docker compose logs app
docker compose logs frontend
docker compose logs mysql
```

## STEP 6: Firewall

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
ufw status
```

---

## TAMBAH DOMAIN NANTI

Saat sudah punya domain/subdomain (bukan munndev.my.id):

### 1. Point DNS ke VPS
Di dashboard domain registrar, buat A record:
```
namadomain.com  →  109.111.53.197
```

### 2. Update APP_URL di .env
```bash
cd /opt/smartlight-system
nano .env
```
Ubah:
```
APP_URL=https://namadomain.com
```

### 3. Install SSL (Let's Encrypt)
```bash
# Install certbot
apt install -y certbot

# Stop container dulu (port 80 harus bebas)
docker compose stop frontend

# Dapatkan SSL certificate
certbot certonly --standalone -d namadomain.com

# Buat directory untuk certificates
mkdir -p /opt/smartlight-system/nginx/ssl
cp /etc/letsencrypt/live/namadomain.com/fullchain.pem /opt/smartlight-system/nginx/ssl/
cp /etc/letsencrypt/live/namadomain.com/privkey.pem /opt/smartlight-system/nginx/ssl/
```

### 4. Update nginx/frontend.conf
Tambah SSL server block:
```nginx
server {
    listen 80;
    server_name namadomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name namadomain.com;

    ssl_certificate /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    # ... sisa config sama ...
}
```

### 5. Update docker-compose.yml — mount SSL
Tambah volume di frontend service:
```yaml
  frontend:
    volumes:
      - ./nginx/ssl:/etc/nginx/ssl:ro
```

### 6. Restart
```bash
docker compose up -d --build
```

### 7. Auto-renew SSL
```bash
# Tambah cron job
crontab -e
```
Tambah baris:
```
0 3 * * * certbot renew --quiet && docker compose -f /opt/smartlight-system/docker-compose.yml restart frontend
```

---

## PERINTAH HARIAN

```bash
# Status semua container
docker compose ps

# Logs real-time
docker compose logs -f
docker compose logs -f app        # hanya backend
docker compose logs -f frontend   # hanya frontend

# Restart semua
docker compose restart

# Restart 1 service
docker compose restart app

# Update dari GitHub
cd /opt/smartlight-system
git pull
docker compose up -d --build

# Masuk ke container backend (debug)
docker compose exec app sh

# Jalankan artisan command
docker compose exec app php artisan tinker
docker compose exec app php artisan migrate
docker compose exec app php artisan cache:clear

# Backup database
docker compose exec mysql mysqldump -u root -p$(grep DB_ROOT_PASSWORD .env | cut -d= -f2) smartlight > backup_$(date +%Y%m%d).sql

# Restore database
docker compose exec -T mysql mysql -u root -p smartlight < backup.sql

# Hapus semua & start fresh (HATI-HATI: data hilang)
docker compose down -v
docker compose up -d --build

# Lihat resource usage
docker stats
```

---

## TROUBLESHOOTING

### Container restart terus
```bash
docker compose logs app
# Biasanya: DB_HOST salah, atau MySQL belum ready
```

### "Connection refused" ke MySQL
```bash
# Pastikan .env pakai DB_HOST=mysql (bukan 127.0.0.1)
grep DB_HOST .env
```

### Frontend blank page
```bash
# Cek apakah frontend bisa reach backend
docker compose exec frontend wget -qO- http://smartlight-nginx/api/settings
```

### ESP32 tidak bisa POST data
```bash
# Cek firewall
ufw status
# Pastikan port 80 terbuka

# Cek dari luar
curl -X POST http://109.111.53.197/api/device/data \
  -H "Content-Type: application/json" \
  -d '{"device_id":"test","zone":"A","lux":100}'
```

### phpMyAdmin akses dari luar
```bash
# SSH tunnel dari komputer lokal
ssh -L 8081:localhost:8081 root@109.111.53.197
# Buka http://localhost:8081 di browser
```
