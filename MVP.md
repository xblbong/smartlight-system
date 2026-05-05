# UB Adaptive Smart Lighting — MVP Definition

## Definisi MVP (Minimum Viable Product)
Siklus penuh yang harus dapat didemonstrasikan untuk kelulusan MVP adalah:
**Alur Data Dua Arah**: Node IoT (via Simulator Python) membaca data lingkungan simulasi (cahaya dan kehadiran) lalu mengirimkan telemetri secara *real-time* ke sistem Backend Laravel. Backend mengkalkulasi efisiensi energi dan menyimpan metrik, yang kemudian divisualisasikan secara langsung (*real-time*) di Dashboard React. Admin dapat melihat anomali, melakukan intervensi manual terhadap lampu tertentu, serta menyesuaikan parameter sensitivitas sensor (*threshold*) langsung dari panel web yang akan direspon kembali oleh IoT Node.

---

## Daftar Fitur MVP (Must Have)
*Fitur inti yang wajib diselesaikan sebelum rilis versi 1.0 (Skala Prioritas Utama).*

### 1. Modul IoT & Simulator (Python)
- [x] Simulasi pengiriman data untuk multi-zona (Area Kampus UB) secara periodik.
- [x] Logika otomatis cerdas: memprioritaskan pengecekan batas cahaya (LDR) sebelum mendeteksi kehadiran (PIR).
- [x] Modul sinkronisasi dinamis: mengambil nilai pengaturan *Threshold* LDR dan *PIR Delay* dari Backend.
- [x] Modul instruksi kendali: membaca dan memproses antrian *override* kendali (ON/OFF/AUTO) dari pengguna.

### 2. Modul Backend API & Core (Laravel)
- [x] *Endpoint* REST API untuk akuisisi telemetri IoT (tanpa blokir antrian).
- [x] Tabel status terkini (*Device Cache*) dengan waktu *update* untuk pendeteksian mati suri (*Offline*).
- [x] Algoritma perbandingan konsumsi daya konvensional vs *smart lighting* untuk kalkulasi persentase hemat.
- [x] Otentikasi keamanan API (menggunakan Laravel Sanctum).
- [x] Penambahan struktur *Role-Based Access Control* (RBAC) pada *Database* User.
- [x] *Endpoint Control Queue* untuk manajemen status *override* manual.

### 3. Modul Dashboard Frontend (React)
- [x] Antarmuka utama dengan metrik keseluruhan (Total Zona, Unit Rusak, Efisiensi Energi).
- [x] Kartu status per zona dengan batang persentase intensitas PWM (*Progress bar* indikatif).
- [x] Indikator Kerusakan (*Faulty*): Notifikasi visual warna merah jika mendeteksi anomali arus berbanding intensitas.
- [x] Indikator *Offline*: Penanda transparansi dan label khusus untuk zona yang gagal lapor.

### 4. Modul Kontrol & Pengaturan (React)
- [x] *Control Center*: Antarmuka kendali tombol paksa nyala (ON), paksa mati (OFF), dan normal (AUTO) per zona.
- [x] *Master Lockdown*: Tombol intervensi darurat massal untuk seluruh area kampus.
- [x] *Threshold Settings*: Form interaktif pengubah nilai referensi sensitivitas cahaya dan masa tunggu sensor.
- [x] Validasi form *Settings* dengan penyimpanan sinkron.

### 5. Modul Analytics (React)
- [x] Visualisasi deret waktu menggunakan grafik Chart.js (memisahkan plot Lux, PWM, dan Arus).
- [x] Panel rangkuman data efisiensi harian dan bulanan dengan rincian durasi nyala ekuivalen.

---

## Daftar Fitur Fase 2 (Should Have)
*Dikerjakan sebagai pengembangan tambahan setelah MVP dan presentasi awal sistem.*

- [ ] Migrasi penuh *firmware* Python Simulator ke dalam bahasa C++ untuk ESP32 sesungguhnya.
- [ ] Export laporan PDF komprehensif untuk diserahkan kepada pimpinan rektorat bulanan.
- [ ] Sistem notifikasi otomatis (Telegram Bot/Email) jika terdeteksi lampu rusak atau zona padam mendadak.
- [ ] Pemetaan Spasial (GIS Overlay): Menampilkan status lampu di atas peta satelit Universitas Brawijaya.

---

## Daftar Out of Scope
*Fitur yang TIDAK akan dikerjakan pada proyek ini beserta alasannya.*

- **Integrasi Kamera Pengawas (CCTV):** Proyek ini murni difokuskan kepada penghematan sumber daya listrik melalui sensor kehadiran pasif (PIR), bukan difungsikan sebagai sistem keamanan visual.
- **Aplikasi Nativ Mobile (Android / iOS):** Demi efisiensi *time-to-market* dan kemudahan iterasi desain, antarmuka administrasi akan menggunakan basis Web (*Progressive Web App* yang responsif) sehingga dapat diakses via *browser* di *device* mana saja tanpa membebani proses peluncuran di *App Store*.
- **Perekaman Data per-Detik Seumur Hidup:** Data telemetri tidak akan diekspor utuh secara satuan detiknya demi menghindari limitasi memori *database*, sehingga difokuskan pada pengarsipan (*cron aggregation*) per jam.
