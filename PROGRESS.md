# UB Adaptive Smart Lighting — Development Progress

**Last Updated:** 4 Mei 2026 (Tim Antigravity)

## Progress Overview

| Fase | Deskripsi Modul / Komponen | Status |
|------|----------------------------|--------|
| **1** | Integrasi IoT Simulator | ✅ Selesai |
| **1** | Arsitektur Backend API & Database | ✅ Selesai |
| **1** | Dashboard & UI Pemantauan | ✅ Selesai |
| **1** | Sistem Kontrol & Override | ✅ Selesai |
| **1** | Analytics & Efisiensi Energi | ✅ Selesai |
| **2** | Perangkat Keras Fisik (Hardware) | ⬜ Belum mulai |
| **2** | Fitur Tambahan (MFA, Export Laporan) | ⬜ Belum mulai |

---

## 1. Detail Progres Fase 1 (MVP) — ✅ Selesai

Semua fitur fundamental dalam batasan Minimum Viable Product telah terselesaikan seluruhnya pada fase perbaikan terakhir.

### Modul IoT & Simulator (Python)
- [x] Simulasi pengiriman data untuk multi-zona (Area Kampus UB) secara periodik.
- [x] Logika otomatis cerdas: memprioritaskan pengecekan batas cahaya (LDR) sebelum mendeteksi kehadiran (PIR).
- [x] Modul sinkronisasi dinamis: mengambil nilai pengaturan *Threshold* LDR dan *PIR Delay* dari Backend.
- [x] Modul instruksi kendali: membaca dan memproses antrian *override* kendali (ON/OFF/AUTO) dari pengguna.

### Modul Backend API & Core (Laravel)
- [x] *Endpoint* REST API untuk akuisisi telemetri IoT (tanpa blokir antrian).
- [x] Tabel status terkini (*Device Cache*) dengan waktu *update* untuk pendeteksian mati suri (*Offline*).
- [x] Algoritma perbandingan konsumsi daya konvensional vs *smart lighting* untuk kalkulasi persentase hemat.
- [x] Otentikasi keamanan API (menggunakan Laravel Sanctum).
- [x] Penambahan struktur *Role-Based Access Control* (RBAC) pada *Database* User.
- [x] *Endpoint Control Queue* untuk manajemen status *override* manual.

### Modul Dashboard Frontend (React)
- [x] Antarmuka utama dengan metrik keseluruhan (Total Zona, Unit Rusak, Efisiensi Energi).
- [x] Kartu status per zona dengan batang persentase intensitas PWM (*Progress bar* indikatif).
- [x] Indikator Kerusakan (*Faulty*): Notifikasi visual warna merah jika mendeteksi anomali arus berbanding intensitas.
- [x] Indikator *Offline*: Penanda transparansi dan label khusus untuk zona yang gagal lapor.

### Modul Kontrol & Pengaturan (React)
- [x] *Control Center*: Antarmuka kendali tombol paksa nyala (ON), paksa mati (OFF), dan normal (AUTO) per zona.
- [x] *Master Lockdown*: Tombol intervensi darurat massal untuk seluruh area kampus.
- [x] *Threshold Settings*: Form interaktif pengubah nilai referensi sensitivitas cahaya dan masa tunggu sensor.
- [x] Validasi form *Settings* dengan penyimpanan sinkron.

### Modul Analytics (React)
- [x] Visualisasi deret waktu menggunakan grafik Chart.js (memisahkan plot Lux, PWM, dan Arus).
- [x] Panel rangkuman data efisiensi harian dan bulanan dengan rincian durasi nyala ekuivalen.

---

## 2. Fase Opsional (Fase 2) — ⬜ Belum Mulai

Daftar pekerjaan selanjutnya yang direkomendasikan jika sistem mulai masuk ke tahap produksi massal (di luar skop MVP).

- [ ] Migrasi penuh *firmware* Python Simulator ke dalam bahasa C++ untuk ESP32 sesungguhnya.
- [ ] Export laporan PDF komprehensif untuk diserahkan kepada pimpinan rektorat bulanan.
- [ ] Sistem notifikasi otomatis (Telegram Bot/Email) jika terdeteksi lampu rusak atau zona padam mendadak.
- [ ] Pemetaan Spasial (GIS Overlay): Menampilkan status lampu di atas peta satelit Universitas Brawijaya.

---

## 3. Bug & Issues Aktif

*Berisi rekapitulasi isu teknis yang saat ini diketahui belum selesai.*

| # | Deskripsi Isu | Status | Ditemukan Oleh |
|---|---------------|--------|----------------|
| - | Tidak ada bug kritikal aktif yang diketahui. | ✅ Resolved | Quality Control |

> **Log Riwayat Penyelesaian Bug Utama (4 Mei 2026):**
> 1. Memperbaiki tombol *dead-end* di *Control Center* dengan menambahkan fungsi "AUTO" (Frontend & Backend).
> 2. Menyelaraskan formula efisiensi *Dashboard* agar tidak dipengaruhi alat berstatus *offline/faulty*.
> 3. Memasukkan atribut proteksi data untuk `role` pada model otentikasi `User.php`.
> 4. Menyempurnakan pembacaan *threshold LDR* di *Simulator Python*.

---

## 4. Catatan Tim
- **Server Production:** Masih berjalan di `localhost:8000` (Backend) dan `localhost:5173` (Frontend). Siapkan instruksi jika perlu di-*deploy* ke VPS.
- **Data Simulator:** Secara *default* simulator akan mensimulasikan satu unit *ESP32-UB01* untuk lima lokasi zona yang berbeda-beda.
- Presentasi untuk dosen dan uji skenario sudah siap dilaksanakan kapanpun berkat penyelesaian fitur-fitur MVP sepenuhnya.
