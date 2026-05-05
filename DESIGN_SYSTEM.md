# UB Adaptive Smart Lighting — Design System

**Tone Brand:** Profesional, Futuristik, Edukatif, dan Modern.
*Desain ini ditujukan untuk civitas akademika dan manajemen kampus, berfokus pada kemudahan memantau operasional, tingkat efisiensi, dan keadaan perangkat dengan sentuhan teknologi maju khas IoT.*

---

## 1. Brand Identity
- **Nama Utama:** UB Adaptive Smart Lighting Admin
- **Makna:** Mencerminkan lingkungan kampus Universitas Brawijaya (UB) yang adaptif dan terotomatisasi secara cerdas melalui IoT dalam pengelolaan efisiensi energinya.
- **Tagline:** "Penerangan Cerdas. Hemat Energi. Untuk Kampus Tercinta."
- **Tone & Voice:** *Clear, Direct, Data-Driven.* Penamaan label dan elemen metrik selalu terukur, jelas, serta memberikan umpan balik (feedback) seketika tanpa istilah yang berbelit-belit.

---

## 2. Color Palette & CSS Variables
Sistem warna dirancang sedemikian rupa guna memfokuskan atensi pengguna kepada peringatan darurat, kerusakan, dan juga status kesehatan IoT Node.

```css
:root {
  /* ==================== Primary Colors ==================== */
  /* Biru institusi/UB + elemen korporat modern */
  --primary-color: #1e3a8a;      /* Deep Blue (Sidebar/Header) */
  --primary-light: #eff6ff;      /* Very Light Blue (Aksen interaktif) */
  --accent-blue: #3b82f6;        /* Bright Blue (Highlight interaktif utama) */
  
  /* ================= Surface & Neutral Colors ============= */
  --bg-color: #f8fafc;           /* Light grayish blue (Background dominan App) */
  --card-bg: #ffffff;            /* Putih Solid (Elemen penampang Card) */
  --border-color: #e2e8f0;       /* Garis pembatas ringan */
  --text-main: #1e293b;          /* Gelap kontras (Heading) */
  --text-secondary: #475569;     /* Abu-abu terang (Deskripsi panjang) */
  --text-muted: #94a3b8;         /* Teks non-aktif atau placeholder */
  
  /* ================= Semantic Colors ====================== */
  /* Warna untuk menunjukan interaksi dan hasil dari IoT */
  --accent-green: #10b981;       /* Success / Normal / NYALA / Hemat */
  --accent-green-bg: #d1fae5;    /* Success Background */
  --accent-red: #ef4444;         /* Error / Rusak (Faulty) / Kegagalan / OFFLINE */
  --accent-red-bg: #fee2e2;      /* Error Background */
  --accent-orange: #f59e0b;      /* Warning / Masa Tunggu (Delay) / Manual Override */
  --accent-orange-bg: #fef3c7;   /* Warning Background */
  
  /* ================= Actor / Role specific (Opsional) ===== */
  --role-admin-color: #7c3aed;   /* Ungu identitas sistem manajerial sarpras */
  --role-tech-color: #0284c7;    /* Biru kehijauan identitas teknisi lapangan */
}

/* ================== Dark Mode Colors (Opt-in) ============= */
@media (prefers-color-scheme: dark) {
  :root {
    --bg-color: #0f172a;
    --card-bg: #1e293b;
    --border-color: #334155;
    --text-main: #f8fafc;
    --text-secondary: #cbd5e1;
    --primary-color: #020617;
  }
}
```

---

## 3. Typography
Menggunakan kombinasi *font* tipe modern San-Serif berkesan dinamis untuk teks bodi maupun tajuk antarmuka *dashboard*.

- **Display & Headings:** `Outfit`, sans-serif (Bold, terkesan presisi, proporsional)
- **Body & Data Metrics:** `Inter`, sans-serif (Akurasi tinggi saat dibaca pada skala kecil, *humanist*)

**CDN Link (Google Fonts):**
```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@500;600;700;800&display=swap" rel="stylesheet">
```

**CSS Variables Typography:**
```css
:root {
  --font-display: 'Outfit', system-ui, sans-serif;
  --font-body: 'Inter', system-ui, sans-serif;
}
```

---

## 4. Fluid Type Scale & Spacing
Pendekatan skala font reaktif, menyesuaikan ukurannya relatif terhadap lebar kanvas.

```css
:root {
  /* Fluid Typo Clamp (Min - Max Range) */
  --text-xs: clamp(0.7rem, 0.65rem + 0.1vw, 0.75rem);
  --text-sm: clamp(0.8rem, 0.75rem + 0.15vw, 0.875rem);
  --text-base: clamp(0.95rem, 0.9rem + 0.25vw, 1rem);
  --text-lg: clamp(1.1rem, 1rem + 0.35vw, 1.15rem);
  --text-xl: clamp(1.3rem, 1.2rem + 0.5vw, 1.5rem);
  --text-2xl: clamp(1.6rem, 1.5rem + 0.8vw, 2rem);
  
  /* Base 4px Spacing Unit System */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;  /* Base standard padding */
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;  /* Section Break */
  --space-10: 40px;
}
```

---

## 5. Shape, Borders & Shadow Tokens
Sifat *Card* harus mencerminkan elemen *glass/smooth edge* untuk memperkuat "Smart & Adaptive Technology".

```css
:root {
  /* Border Radius */
  --radius-sm: 6px;       /* Untuk input form / chip kecil */
  --radius-md: 10px;      /* Untuk tombol standard */
  --radius-lg: 16px;      /* Untuk widget kartu utama (Card) */
  --radius-xl: 24px;      /* Modul hero atau grafik besar */
  --radius-full: 9999px;  /* Untuk badge bulat murni / avatar */
  
  /* Elevated Shadow System */
  --shadow-sm: 0 1px 3px rgba(0,0,0,0.05);
  --shadow-md: 0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03);
  --shadow-card: 0 8px 24px rgba(149, 157, 165, 0.08); /* Halus, lebar untuk kesan melayang */
  --shadow-active: 0 10px 30px rgba(59, 130, 246, 0.15); /* Pendaran biru interaktif */
}
```

---

## 6. Animasi & Motion Guidelines
Animasi di sini dirancang sehalus mungkin, berfungsi *memandu atensi* tanpa menjadi *distraksi* bagi admin.

- **Hover Transitions:** `0.2s ease` (untuk tombol dan tautan).
- **Fade In Data (Saat Sync):** `0.4s ease-out` (digunakan pada nilai *metric* saat menerima data *Real-time*).
- **Progress Bar Fill:** `0.6s cubic-bezier(0.4, 0, 0.2, 1)` (Transisi saat grafik persentase intensitas lampu diperbaharui).

```css
.btn {
  transition: all 0.2s ease;
}
.btn:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}
.zc-progress-fill {
  transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}
```

---

## 7. Komponen UI Utama

### Button Variants
- **Primary:** Latar biru korporat (`--accent-blue`) dengan *teks tebal putih*. Digunakan untuk aksi afirmatif (NYALAKAN, SIMPAN).
- **Outline (Secondary):** Teks hitam/biru dengan latar tipis/abu-abu (`--bg-color`) serta tepian kecil. Untuk membatalkan (MATIKAN, RESET).
- **Alert/Danger:** Menggunakan latar tipis merah muda (`--accent-red-bg`) dengan teks beraksen merah.

### Card Style
Setiap elemen zona adalah komponen tipe *Card*.
Mempunyai `padding: var(--space-6)`, dibalut border putih pekat `--card-bg`, diberi bayangan lebar sangat tipis `--shadow-card`, dengan pembatas lengkung batas dalam `--radius-lg`.

### Badge & Chip
- **Status Online/Offline Badge:** Pil berbentuk melengkung murni (`--radius-full`) yang terletak di samping tajuk.
- **Kondisi Chip:** Label bentuk kotak dengan sedikit kebulatan (`--radius-sm`), memiliki warna kontras bergradasi tipis antara *background semantic* dan *text semantic* (Contoh: Latar Hijau Muda, Teks Hijau Tua).

---

## 8. Breakpoints Responsive
- **Tablet / Mini Laptops (`max-width: 1024px`):** Tata letak kartu zona turun menjadi *2 grid columns*. Lebar sidebar ditekan lebih tipis.
- **Mobile Devices (`max-width: 768px`):** Layout diturunkan ke vertikal mutlak (*1 grid column*). Posisi *Sidebar* bergeser menjadi *Bottom Navigation Bar* atau disembunyikan dalam *Hamburger menu*. Header diperkecil.

---

## 9. Referensi Inspirasi
- Pendekatan Vercel / Supabase (Dashboard minimalis dengan kontras dominan di bagian tepi tombol, metrik besar yang terbaca dengan jelas).
- Glassmorphism subtil di area grafik untuk memetakan hirarki analitik (*Analytics*).
- Material Design 3 (Sistem warna Semantik dan interaksi per komponen).
