# Notulen Analisis Lengkap — Bug & Error Smart Lighting System

Dokumen ini menyatukan SELURUH temuan bug/error dari analisis menyeluruh terhadap ketiga komponen sistem:
- **Frontend** (React — `smart-light-frontend/`)
- **Backend** (Laravel — `smart-light-backend/`)
- **IoT Simulator** (Python — `iot-simulator/simulate_iot.py`)

---

## Diagram Alur Sistem (Workflow Keseluruhan)

```
┌──────────────┐    POST /api/device/data     ┌──────────────────┐    GET /api/device/latest     ┌──────────────────┐
│  IoT Simul.  │ ──────────────────────────▶  │  Laravel Backend  │ ◀──────────────────────────  │  React Frontend  │
│  (Python)    │                               │   (PHP/API)       │  ─────────────────────────▶  │  (Dashboard dll) │
│              │    GET /api/device/control/   │                   │    JSON Response              │                  │
│              │    pending?device_id=X        │  ┌─ sensor_logs   │                               │  Dashboard.jsx   │
│              │  ❌ TIDAK ADA ENDPOINT INI    │  ├─ device_cache   │                               │  ControlCenter   │
│              │                               │  ├─ device_controls│ ◀──── POST /api/device/ctrl  │  ThresholdSet.   │
│              │                               │  └─ system_setting │ ◀──── POST /api/settings     │  Analytics.jsx   │
└──────────────┘                               └──────────────────┘                               └──────────────────┘
```

**Legenda**: ❌ = alur putus / tidak terhubung

---

## BAGIAN A — Bug Kritikal (Fungsi Tidak Berjalan)

### BUG #1 🔴 — Tombol ON/OFF Control Center TIDAK BERFUNGSI (Dead-End Command)

**Dampak:** SEMUA tombol kontrol lampu tidak benar-benar mengontrol apapun.
- ❌ FORCE ON per zona
- ❌ FORCE OFF per zona  
- ❌ ACTIVATE FULL ILLUMINATION (master ON)
- ❌ GLOBAL SHUTDOWN (master OFF)

**File Terkait:**
- `ControlCenter.jsx` — baris 58–83 (`handleControl`)
- `DashboardController.php` — baris 78–98 (`control()`)
- `simulate_iot.py` — seluruh file (tidak pernah cek antrian kontrol)

**Alur yang Terjadi (RUSAK):**
1. User klik tombol → Frontend POST ke `/api/device/control`
2. Backend **hanya menyimpan** ke tabel `device_controls` (antrian) dengan `executed_at: null`
3. ❌ **TIDAK ADA yang membaca antrian ini** — tidak ada consumer/worker
4. Simulator Python terus jalan sendiri, mengirim data random
5. Frontend refresh → data tetap random → status lampu **tidak berubah**

**Root Cause (3 Titik Putus):**
1. Backend hanya mengantrikan, tidak mengeksekusi → `DeviceControl::create([...])` saja
2. Simulator TIDAK melakukan GET ke backend untuk cek perintah kontrol
3. Backend tidak menyediakan endpoint `GET /api/device/control/pending`

**Solusi:**
1. **Backend**: Buat endpoint baru `GET /api/device/control/pending?device_id=X` yang mengembalikan perintah kontrol belum dieksekusi
2. **Simulator**: Setiap loop, panggil endpoint pending → jika ada perintah ON, paksa `powerLampu = 255`; jika OFF, paksa `powerLampu = 0` → kirim data ke backend
3. **Backend**: Setelah simulator baca perintah, tandai `executed_at = now()` di tabel `device_controls`

---

### BUG #2 🔴 — Simulator IoT Mengabaikan SEMUA Konfigurasi dari Dashboard

**Dampak:** Perubahan apapun yang dilakukan admin di halaman web TIDAK PERNAH sampai ke device/simulator.

**File Terkait:**
- `simulate_iot.py` — baris 64 (threshold hardcoded `lux < 100`)
- `ThresholdSettings.jsx` — baris 80–103 (simpan ke `system_settings`)
- `DashboardController.php` — baris 103–107 (`getSettings`)

**Detail:**
- Di `ThresholdSettings.jsx`, admin bisa mengatur `ldr_sensitivity` (misal: 420 lux) dan berhasil tersimpan ke tabel `system_settings` via `POST /api/settings`
- Tapi di `simulate_iot.py` baris 64, ambang batas ditulis **hardcoded**: `elif lux < 100:`
- Simulator **tidak pernah** memanggil `GET /api/settings` untuk sinkronisasi
- Jadi walaupun admin sudah set threshold 420, lampu tetap pakai batas 100

**Solusi:**
1. Simulator harus `GET /api/settings` saat startup dan/atau periodik (misal setiap 30 detik)
2. Ganti `lux < 100` di baris 64 menjadi `lux < threshold_dari_api`

> **Catatan:** Bug ini sebelumnya tercatat di notulen lama (poin #3) tapi hanya menyebut threshold. Kenyataannya SEMUA konfigurasi dashboard diabaikan (termasuk `pir_delay`).

---

### BUG #3 🔴 — Logika IoT Boros Energi (Lampu Nyala Siang Hari)

**Dampak:** Menyalahi konsep utama "Smart Lighting = penghematan energi"

**File Terkait:**
- `simulate_iot.py` — baris 56–73 (fungsi `buat_payload`)

**Detail:**
Logika kontrol lampu saat ini:
```python
if ada_orang:           # → NYALA 100% (255 PWM)
elif masa_tunggu:       # → NYALA 60% (150 PWM)
elif lux < 100:         # → NYALA 40% (100 PWM)
else:                   # → MATI
```

Masalah: Jika `ada_orang = True` **dan** `lux = 450` (siang terang), lampu tetap nyala 100%. Harusnya:
```python
if lux < threshold:             # Gelap dulu
    if ada_orang:               #   → Ada orang di gelap: 100%
    elif masa_tunggu:           #   → Masa tunggu: 60%
    else:                       #   → Gelap, tidak ada orang: 40%
else:                           # Terang
    powerLampu = 0              #   → Mati
```

**Solusi:** Ubah urutan if-else agar mengecek cahaya (lux) terlebih dahulu sebelum mengecek kehadiran orang.

---

## BAGIAN B — Bug Logika Data / Monitoring

### BUG #4 🟠 — Status "Offline" Tidak Terdeteksi (False Active / Eternal Cache)

**Dampak:** Device yang sudah mati/terputus tetap terlihat aktif di Dashboard.

**File Terkait:**
- `SensorController.php` — baris 62–77 (`upsert` ke `device_status_cache`)
- `DashboardController.php` — baris 20–22 (query `device_status_cache`)
- `Dashboard.jsx` — tidak ada validasi timeout

**Detail:**
- Saat device terakhir kirim data, `device_status_cache` di-upsert
- Jika device mati → data terakhir **menetap selamanya** di cache
- Dashboard tetap menampilkan "ACTIVE" tanpa pengecekan kapan data terakhir dikirim
- Contoh: Device terakhir kirim jam 08:00, sekarang jam 14:00, tapi status masih "ACTIVE"

**Solusi:**
- Di `Dashboard.jsx` atau di backend query: tambahkan validasi `updated_at` — jika selisih > 3 menit dari sekarang → tandai OFFLINE
- Tampilkan badge "OFFLINE" abu-abu pada kartu zona yang sudah melebihi batas waktu

---

### BUG #5 🟠 — Efficiency (%) di Dashboard Bisa Menyesatkan

**Dampak:** Angka efisiensi terlihat tinggi padahal konteksnya salah.

**File Terkait:**
- `Dashboard.jsx` — baris 81–83

**Detail:**
```javascript
const eff = activeUnits > 0
  ? Math.round(((activeUnits - lampuMenyala) / activeUnits) * 100)
  : 0
```
- Formula: `% lampu yang MATI = efisiensi`
- Masalah: Jika 5 dari 8 zona mati karena **siang hari** (otomatis), efisiensi = 62,5% — ini benar
- Tapi jika 5 dari 8 zona mati karena **device OFFLINE/rusak**, efisiensi tetap 62,5% — ini menyesatkan
- Dosen bisa bertanya: "Kok efisiensi tinggi padahal device banyak yang rusak?"

**Solusi:**
- Keluarkan zona faulty/offline dari perhitungan efisiensi
- Formula seharusnya: `(zona_mati_normal) / (total - zona_faulty - zona_offline) * 100`

---

## BAGIAN C — Bug Frontend (UX / Logika Tampilan)

### BUG #6 🟡 — Master Control Double Toast

**File Terkait:**
- `ControlCenter.jsx` — baris 85–92 (`handleMasterControl`)

**Detail:**
```javascript
const handleMasterControl = async (action) => {
  const results = await Promise.allSettled(
    devices.map(dev => handleControl(dev.device_id, dev.zone, action))
    //                  ^^^ handleControl() sudah addToast() per zona (baris 67)
  )
  addToast(`Master ${action}: ${ok}/${devices.length} zona berhasil`, ...)
  // ^^^ toast KEDUA lagi di sini
}
```
- Jika ada 8 zona → muncul **9 toast** (8 per-zona + 1 ringkasan)
- Membingungkan dan menumpuk di layar

**Solusi:**
- Tambah parameter `silent = false` di `handleControl()` 
- Saat dipanggil dari `handleMasterControl`, kirim `silent = true` agar tidak menampilkan toast per-zona

---

### BUG #7 🟡 — Promise.allSettled Selalu "Berhasil" (Error Masking)

**File Terkait:**
- `ControlCenter.jsx` — baris 87–91

**Detail:**
```javascript
const results = await Promise.allSettled(
  devices.map(dev => handleControl(dev.device_id, dev.zone, action))
)
const ok = results.filter(r => r.status === 'fulfilled').length
```
- `handleControl()` memiliki try/catch internal yang **menangkap semua error** tanpa re-throw
- Akibatnya, `Promise.allSettled` akan selalu mendapat `fulfilled` untuk semua promise
- `ok` selalu = `devices.length` → toast selalu bilang "berhasil" meski ada yang gagal

**Solusi:**
- `handleControl()` harus me-return boolean atau re-throw error saat API gagal
- Di `handleMasterControl`, hitung berdasarkan return value, bukan status promise

---

### BUG #8 🟡 — Role-Based Access Control Tidak Berfungsi di Frontend

**File Terkait:**
- `App.jsx` — baris 25–27 (filter navigasi sidebar)

**Detail:**
```javascript
const navItems = allNavItems.filter(item =>
  item.roles.includes(role) || item.roles.includes('admin_sarpras')
)
```
- Kondisi kedua `item.roles.includes('admin_sarpras')` akan **selalu true** karena SEMUA item memiliki role `admin_sarpras`
- Akibatnya: user dengan role apapun (teknisi, pimpinan) bisa melihat **semua menu**
- Seharusnya hanya cek `item.roles.includes(role)`

**Solusi:**
```javascript
const navItems = allNavItems.filter(item => item.roles.includes(role))
```

---

### BUG #9 🟡 — Role Tidak Dikembalikan dari Backend Login

**File Terkait:**
- `AuthController.php` — baris 44–48 (login response)
- `App.jsx` — baris 16 (default role fallback)

**Detail:**
- Backend mengembalikan user tanpa field `role`:
  ```php
  'user' => [
      'id'    => $user->id,
      'name'  => $user->name,
      'email' => $user->email,
      // ❌ Tidak ada 'role'
  ]
  ```
- Model `User.php` juga tidak memiliki kolom `role` di fillable/table
- Frontend fallback ke `const role = user?.role || 'admin_sarpras'` → semua user jadi admin
- RBAC di sidebar menjadi percuma

**Solusi:**
- Tambahkan kolom `role` di tabel `users` (migration)
- Sertakan `role` dalam response login dan `/api/me`
- (Atau, jika untuk presentasi dosen saja dan hanya 1 admin, ini bisa di-acknowledge sebagai "future improvement")

---

## BAGIAN D — Bug Tampilan Data yang Sudah Diperbaiki (Dari Kritik Dosen)

> Bug-bug di bawah ini sudah tercatat di notulen sebelumnya dan sebagian sudah diterapkan perbaikannya di source code.

### ✅ FIXED #1 — Tampilan "Jarak" Mentah di Dashboard
- **Masalah:** Menampilkan angka jarak ultrasonik mentah (12 cm, 50 cm) tidak relevan untuk user.
- **Status:** Sudah diperbaiki di `Dashboard.jsx` — sekarang menampilkan "Objek Terdeteksi" / "Tidak Ada Objek" (baris 228–236).

### ✅ FIXED #2 — Kalkulasi Efisiensi Fiktif di Threshold Settings
- **Masalah:** `ThresholdSettings.jsx` sebelumnya menampilkan rumus dummy `Math.round(60 + (settings.ldr_sensitivity / 1024) * 30)`.
- **Status:** Sudah dihapus (baris 111: komentar `// Menghapus kalkulasi fiktif effPct atas permintaan dosen`).

### ✅ FIXED #3 — Grafik Analytics Digabung 1 Sumbu
- **Masalah:** Lux, PWM, dan Arus digabung dalam satu chart sehingga sulit dibaca.
- **Status:** Sudah diperbaiki di `Analytics.jsx` — grafik sekarang terpisah 3 panel: Lux (baris 346-364), Power/PWM (baris 366-384), Arus/mA (baris 386-404).

### 📝 ACKNOWLEDGED #4 — Ekspor Data Bulanan Per-Detik
- **Masalah:** Ekspor data mentah per-detik untuk laporan bulanan tidak masuk akal.
- **Status:** Sudah di-acknowledge sebagai "Log Dump (Audit Teknis)". Nama file export sudah tepat "sensor_log...csv".
- **Saran:** Untuk laporan hemat energi, perlu endpoint agregasi khusus (future development).

---

## Ringkasan Prioritas Perbaikan

| # | Bug | Severity | Komponen | Status |
|---|-----|----------|----------|--------|
| 1 | Tombol ON/OFF dead-end (tidak mengontrol apapun) | 🔴 Critical | Backend + Simulator + Frontend | ✅ Sudah Fix |
| 2 | Simulator mengabaikan semua konfigurasi dashboard | 🔴 Critical | Simulator + Backend | ✅ Sudah Fix |
| 3 | Logika IoT boros energi (nyala saat siang) | 🔴 Critical | Simulator | ✅ Sudah Fix |
| 4 | Device offline tetap terlihat aktif | 🟠 Medium | Backend + Frontend | ✅ Sudah Fix |
| 5 | Efficiency % menyesatkan (termasuk faulty) | 🟠 Medium | Frontend | ✅ Sudah Fix |
| 6 | Double toast di master control | 🟡 Minor | Frontend | ✅ Sudah Fix |
| 7 | Error masking di Promise.allSettled | 🟡 Minor | Frontend | ✅ Sudah Fix |
| 8 | RBAC sidebar tidak berfungsi | 🟡 Minor | Frontend | ✅ Sudah Fix |
| 9 | Role tidak ada di backend response | 🟡 Minor | Backend | ✅ Sudah Fix |
| — | Jarak mentah di Dashboard | — | Frontend | ✅ Sudah Fix |
| — | Efisiensi fiktif Threshold | — | Frontend | ✅ Sudah Fix |
| — | Grafik Analytics 1 sumbu | — | Frontend | ✅ Sudah Fix |
| — | Ekspor data per-detik | — | Backend | 📝 Acknowledged |

---

**Status Dokumen:** Terakhir diperbarui pada analisis menyeluruh 4 Mei 2026. Semua file sumber sudah diverifikasi baris per baris.
