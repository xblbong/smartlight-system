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
API_BASE   = "http://127.0.0.1:8000/api"
API_URL    = f"{API_BASE}/device/data"
INTERVAL   = 5       # detik antar pengiriman per device

# Daftar device yang disimulasikan
# Implementasi: 1 ESP32 di Bundaran UB terhubung ke 5 zona lampu
# Setiap zona mengontrol 2 lampu jalan (total 10 lampu)
# Zona berbasis area kampus UB (sesuai rencana maket)
DEVICES = [
    {
        "device_id": "ESP32-UB01",
        "zones": ["A", "B", "C", "D", "E"],
        "name": "Bundaran UB",
    },
]
# Mapping zona:
#   A = Bundaran UB (2 lampu)
#   B = Gerbang Rektorat (2 lampu)
#   C = Jalur Fakultas Vokasi (2 lampu)
#   D = Taman Graha (2 lampu)
#   E = Parkir Utama (2 lampu)
# Total: 5 zona × 2 lampu = 10 lampu

# =========================================================
# State Global: Menyimpan override manual per zona
# =========================================================
# Format: { "ESP32-001-A": "ON", "ESP32-002-A": "OFF" }
manual_overrides = {}

# Threshold default (akan di-sync dari backend)
settings_cache = {
    "ldr_sensitivity": 100,
    "pir_delay": 3,
}
last_settings_fetch = 0
SETTINGS_FETCH_INTERVAL = 30  # detik


# =========================================================
# Fungsi: Ambil settings dari backend (periodik)
# =========================================================
def fetch_settings():
    global settings_cache, last_settings_fetch
    now = time.time()
    if now - last_settings_fetch < SETTINGS_FETCH_INTERVAL:
        return  # belum waktunya fetch

    try:
        res = requests.get(f"{API_BASE}/settings", timeout=8)
        if res.status_code == 200:
            data = res.json()
            if "ldr_sensitivity" in data:
                settings_cache["ldr_sensitivity"] = int(data["ldr_sensitivity"])
            if "pir_delay" in data:
                settings_cache["pir_delay"] = int(data["pir_delay"])
            last_settings_fetch = now
            print(f"  [SYNC] Settings dari server: LDR threshold={settings_cache['ldr_sensitivity']} lux, PIR delay={settings_cache['pir_delay']} detik")
    except Exception:
        pass  # gagal fetch settings, pakai cache terakhir


# =========================================================
# Fungsi: Cek perintah kontrol dari dashboard (per device)
# =========================================================
def fetch_pending_commands(device_id):
    global manual_overrides
    try:
        res = requests.get(
            f"{API_BASE}/device/control/pending",
            params={"device_id": device_id},
            timeout=8
        )
        if res.status_code == 200:
            commands = res.json()
            if commands and len(commands) > 0:
                ack_ids = []
                for cmd in commands:
                    zone = cmd.get("zone", "")
                    action = cmd.get("action", "")
                    cmd_id = cmd.get("id")
                    key = f"{device_id}-{zone}"
                    if action == "AUTO":
                        manual_overrides.pop(key, None)  # Hapus override, kembali ke mode otomatis
                    else:
                        manual_overrides[key] = action
                    ack_ids.append(cmd_id)
                    print(f"  [CMD] Override diterima: {device_id}/Zone {zone} → {action}")

                # Acknowledge perintah ke backend
                if ack_ids:
                    try:
                        requests.post(
                            f"{API_BASE}/device/control/ack",
                            json={"ids": ack_ids},
                            timeout=8
                        )
                    except Exception:
                        pass
    except Exception:
        pass  # gagal fetch, lanjut saja


# =========================================================
# Fungsi Simulasi Sensor (sesuai PRD)
# =========================================================
def buat_payload(device_id: str, zone: str) -> dict:
    global manual_overrides

    lux            = round(random.uniform(5.0, 500.0), 2)
    jarak          = round(random.uniform(5.0, 50.0), 2)
    ada_orang      = jarak < 30           # < 30 cm = ada objek
    # Masa tunggu: simulasi berdasarkan delay dari backend settings (detik)
    # Dalam simulator, kita gunakan probabilitas kecil karena interval = 5 detik
    pir_delay_sec = settings_cache.get("pir_delay", 10)
    # Probabilitas masa tunggu = pir_delay / 60 (semakin pendek delay, semakin jarang masa tunggu)
    masa_tunggu    = not ada_orang and random.random() < (pir_delay_sec / 60.0)

    # Ambil threshold dari settings yang di-sync dari backend
    threshold = settings_cache.get("ldr_sensitivity", 100)

    # Cek apakah ada override manual dari dashboard
    override_key = f"{device_id}-{zone}"
    override = manual_overrides.get(override_key, None)  # persistent override (tetap berlaku sampai diubah)

    if override == "ON":
        # Override manual: paksa nyala 100%
        power_lampu = 255
        trigger     = "MANUAL ON"
        kondisi     = "NYALA MANUAL"
    elif override == "OFF":
        # Override manual: paksa mati
        power_lampu = 0
        trigger     = "MANUAL OFF"
        kondisi     = "MATI MANUAL"
    else:
        # Logika otomatis — CEK LUX DULU sebelum cek orang
        # (Fix bug boros energi: lampu tidak boleh nyala saat siang terang)
        if lux < threshold:
            # Gelap → cek kehadiran orang
            if ada_orang:
                power_lampu = 255
                trigger     = "AUTO 100%"
                kondisi     = "NYALA NORMAL"
            elif masa_tunggu:
                power_lampu = 150
                trigger     = "DELAY 60%"
                kondisi     = "MASA TUNGGU"
            else:
                # Gelap tapi tidak ada orang → redup
                power_lampu = 100
                trigger     = "AUTO 40%"
                kondisi     = "REDUP"
        else:
            # Terang → mati (hemat energi)
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

    # Fetch settings pertama kali
    fetch_settings()

    kiriman = 0
    while True:
        # Sync settings secara periodik
        fetch_settings()

        # Kirim satu data per iterasi (rotasi device secara acak)
        device = random.choice(DEVICES)
        zone   = random.choice(device["zones"])

        # Cek apakah ada perintah kontrol dari dashboard untuk device ini
        fetch_pending_commands(device["device_id"])

        payload = buat_payload(device["device_id"], zone)
        kiriman += 1

        try:
            res = requests.post(API_URL, json=payload, timeout=10)

            if res.status_code in (200, 201):
                faulty_str = " [⚠ RUSAK!]" if payload["current"] < 10 and payload["powerLampu"] > 0 else ""
                orang_str  = "Ada " if payload["sedangAdaOrang"] else "Tdk "
                manual_str = " [MANUAL]" if "MANUAL" in payload["trigger"] else ""
                print(
                    f"[{kiriman:04d}] ✓ {payload['timestamp']} | "
                    f"{payload['device_id']}/{zone} | "
                    f"Lux={payload['lux']:6.1f} | "
                    f"Jarak={payload['jarak']:5.1f}cm | "
                    f"Orang={orang_str} | "
                    f"PWM={payload['powerLampu']:3d} | "
                    f"Arus={payload['current']:6.1f}mA"
                    f"{faulty_str}{manual_str}"
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