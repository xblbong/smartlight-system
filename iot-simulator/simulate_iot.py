"""
Smart Lighting IoT Simulator
============================
Mensimulasikan ESP32 yang mengirim data sensor ke Laravel backend.
Gunakan ini sebagai pengganti device fisik selama pengembangan.

Konfigurasi:
  DEVICE_IDS  → Daftar ID device yang disimulasikan (sesuai device nyata)
  ZONES       → Zona yang tersedia per device
  INTERVAL    → Interval pengiriman data (detik)
  API_URL     → URL backend Laravel
"""

import requests
import time
import random
import sys
import json
from datetime import datetime

# Fix encoding untuk Windows terminal
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

# =========================================================
# KONFIGURASI — Sesuaikan dengan device IoT yang ada
# =========================================================
API_URL    = "http://127.0.0.1:8000/api/device/data"
INTERVAL   = 5       # detik antar pengiriman per device

# Daftar device yang disimulasikan
# Format: { "device_id": "ID", "zones": ["A", "B"], "name": "Lokasi" }
DEVICES = [
    {"device_id": "ESP32-001", "zones": ["A", "B"], "name": "Pintu Utama"},
    {"device_id": "ESP32-002", "zones": ["A"],      "name": "Parkir Utara"},
    {"device_id": "ESP32-003", "zones": ["A", "B"], "name": "Koridor Admin"},
    {"device_id": "ESP32-004", "zones": ["A"],      "name": "Lab Komputer"},
    {"device_id": "ESP32-005", "zones": ["A", "B"], "name": "Aula Utama"},
]
# Total zona aktif = jumlah semua zone dari semua device di atas
# Sesuaikan DEVICES untuk menambah/kurangi unit yang disimulasikan

# =========================================================
# Fungsi Simulasi Sensor (sesuai PRD)
# =========================================================
def buat_payload(device_id: str, zone: str) -> dict:
    lux            = round(random.uniform(5.0, 500.0), 2)
    jarak          = round(random.uniform(5.0, 50.0), 2)
    ada_orang      = jarak < 30           # < 30 cm = ada objek
    masa_tunggu    = random.random() < 0.15   # 15% kemungkinan masa tunggu

    # Logika kontrol lampu (embedded di device)
    if ada_orang:
        power_lampu = 255
        trigger     = "AUTO 100%"
        kondisi     = "NYALA NORMAL"
    elif masa_tunggu:
        power_lampu = 150
        trigger     = "DELAY 60%"
        kondisi     = "MASA TUNGGU"
    elif lux < 100:
        # Gelap tapi tidak ada orang → redup
        power_lampu = 100
        trigger     = "AUTO 40%"
        kondisi     = "REDUP"
    else:
        # Terang → mati
        power_lampu = 0
        trigger     = "OFF (SIANG)"
        kondisi     = "MATI"

    # Simulasi arus — 5% kemungkinan rusak (arus sangat kecil padahal nyala)
    if power_lampu > 0 and random.random() < 0.05:
        current = round(random.uniform(0.1, 5.0), 2)   # RUSAK
        kondisi = "RUSAK"
    elif power_lampu > 0:
        current = round(random.uniform(20.0, 120.0), 2)
    else:
        current = round(random.uniform(0.0, 2.0), 2)   # Mati = arus sangat kecil

    # Status sensor — simulasi error jarang
    def sensor_status():
        return "ERROR" if random.random() < 0.02 else "OK"

    return {
        "device_id"       : device_id,
        "zone"            : zone,
        "lux"             : lux,
        "jarak"           : jarak,
        "sedangAdaOrang"  : ada_orang,
        "masihMasaTunggu" : masa_tunggu,
        "tombol"          : False,
        "voltage"         : round(random.uniform(11.5, 12.5), 2),
        "current"         : current,
        "sensor_status"   : {
            "ldr"        : sensor_status(),
            "ultrasonic" : sensor_status(),
            "ina219"     : sensor_status(),
        },
        "trigger"    : trigger,
        "kondisi"    : kondisi,
        "powerLampu" : power_lampu,
        "timestamp"  : datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
    }


# =========================================================
# Loop Utama
# =========================================================
def kirim_semua_device():
    total_zona = sum(len(d["zones"]) for d in DEVICES)

    print("=" * 65)
    print("  [*] Smart Lighting IoT Simulator (Python)")
    print(f"  [>] Backend : {API_URL}")
    print(f"  [>] Device  : {len(DEVICES)} unit ({total_zona} zona)")
    print(f"  [>] Interval: {INTERVAL} detik")
    print("=" * 65)
    print()
    for d in DEVICES:
        print(f"  • {d['device_id']} — {d['name']} — Zona: {', '.join(d['zones'])}")
    print()
    print("  Ctrl+C untuk menghentikan simulator")
    print("=" * 65)

    kiriman = 0
    while True:
        # Kirim satu data per iterasi (rotasi device secara acak)
        device = random.choice(DEVICES)
        zone   = random.choice(device["zones"])
        payload = buat_payload(device["device_id"], zone)
        kiriman += 1

        try:
            res = requests.post(API_URL, json=payload, timeout=5)

            if res.status_code in (200, 201):
                faulty_str = " [⚠ RUSAK!]" if payload["current"] < 10 and payload["powerLampu"] > 0 else ""
                orang_str  = "Ada " if payload["sedangAdaOrang"] else "Tdk "
                print(
                    f"[{kiriman:04d}] ✓ {payload['timestamp']} | "
                    f"{payload['device_id']}/{zone} | "
                    f"Lux={payload['lux']:6.1f} | "
                    f"Jarak={payload['jarak']:5.1f}cm | "
                    f"Orang={orang_str} | "
                    f"PWM={payload['powerLampu']:3d} | "
                    f"Arus={payload['current']:6.1f}mA"
                    f"{faulty_str}"
                )
            else:
                print(f"[{kiriman:04d}] WARN HTTP {res.status_code}: {res.text[:120]}")

        except requests.exceptions.ConnectionError:
            print(
                f"[{kiriman:04d}] ERROR — Tidak bisa konek ke {API_URL}\n"
                f"         Pastikan Laravel berjalan: php artisan serve --port=8000"
            )
        except requests.exceptions.Timeout:
            print(f"[{kiriman:04d}] WARN  — Request timeout. Backend lambat.")
        except Exception as e:
            print(f"[{kiriman:04d}] ERROR — {e}")

        time.sleep(INTERVAL)


if __name__ == "__main__":
    try:
        kirim_semua_device()
    except KeyboardInterrupt:
        print("\n\n  [*] Simulator dihentikan.")