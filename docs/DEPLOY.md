# DEPLOY — Ideaven Online

Panduan mengubah Ideaven dari projek lokal menjadi aplikasi web yang bisa
diakses siapa saja. Semua layanan punya paket gratis.

```
┌─────────────┐     HTTPS      ┌─────────────┐     Postgres     ┌─────────┐
│  Vercel     │ ─────────────► │  Render     │ ───────────────► │  Neon   │
│  (apps/web) │                │  (apps/api) │                  │  (DB)   │
└─────────────┘                └─────────────┘                  └─────────┘
  Frontend Next.js               API Go                         Database
```

Urutan pengerjaan: **Neon → Render → Vercel → sambungkan ulang CORS**.
Variabel `VERCEL_URL` di bawah baru diketahui setelah Vercel selesai, jadi
langkah terakhir adalah mengisi ulang env Render lalu redeploy.

---

## 1. Neon — database PostgreSQL (gratis)

1. Buka <https://neon.com> → **Sign up with GitHub**.
2. Buat project baru (nama bebas, misal `ideaven`). Region terdekat:
   `Singapore`.
3. Setelah project jadi, salin **Connection string** (dimulai dengan
   `postgresql://...neon.tech/...?sslmode=require`). Ini nilai `DATABASE_URL`.

> Migrasi tabel dijalankan otomatis oleh API saat pertama kali start —
> tidak perlu import SQL manual.

## 2. Render — API Go (gratis)

1. Buka <https://render.com> → **Sign up with GitHub**, izinkan akses repo
   `SulaimanTrid/ideaven-landing`.
2. **New +** → **Blueprint** → pilih repo `ideaven-landing`. Render membaca
   `render.yaml` dan mengisi sebagian besar pengaturan otomatis.
3. Isi tiga variabel yang ditandai `sync: false`:
   - `DATABASE_URL` → connection string dari Neon (langkah 1).
   - `API_ALLOWED_ORIGINS` → isi dulu `https://placeholder` (diperbarui di
     langkah 4 dengan URL Vercel yang sebenarnya).
   - `APP_URL` → sama, `https://placeholder` untuk saat ini.
4. **Apply** → Render membangun image Docker dari `apps/api/Dockerfile`.
   `SESSION_SECRET` dibuat otomatis oleh Render.
5. Tunggu status **Live**, lalu catat URL-nya, misal
   `https://ideaven-api.onrender.com`. Uji: buka
   `https://ideaven-api.onrender.com/api/health` (atau endpoint health yang
   tersedia) — respons JSON berarti API hidup.

> Paket free Render "tidur" setelah ±15 menit tanpa trafik; request pertama
> berikutnya butuh 30–60 detik untuk bangun. Ini normal untuk free tier.

## 3. Vercel — frontend Next.js (gratis)

1. Buka <https://vercel.com> → **Sign up with GitHub**.
2. **Add New** → **Project** → import `SulaimanTrid/ideaven-landing`.
3. Sebelum menekan Deploy, atur:
   - **Root Directory** → `apps/web` (Vercel mendeteksi Next.js otomatis).
   - **Environment Variables**:
     | Key | Value |
     |---|---|
     | `NEXT_PUBLIC_API_URL` | URL Render dari langkah 2, misal `https://ideaven-api.onrender.com` |
     | `NEXT_PUBLIC_SITE_URL` | URL Vercel default, misal `https://ideaven-landing.vercel.app` (boleh diisi belakangan lewat Settings jika belum yakin) |
4. **Deploy** → tunggu selesai, catat URL produksi
   `https://<vercel-anda>.vercel.app`.

## 4. Sambungkan ulang CORS (Render)

Frontend dan API saling memanggil lintas domain, jadi API harus mengizinkan
origin Vercel:

1. Di Render, buka layanan `ideaven-api` → **Environment**.
2. Ubah:
   - `API_ALLOWED_ORIGINS` → `https://<vercel-anda>.vercel.app`
   - `APP_URL` → `https://<vercel-anda>.vercel.app`
3. **Save** — Render otomatis redeploy. Selesai: buka URL Vercel, Ideaven
   sudah online dan bisa login/register.

---

## Opsional

### Fitur Ask AI

Tanpa variabel berikut API tetap hidup, hanya fitur Ask AI yang mati:

| Key | Contoh |
|---|---|
| `AI_PROVIDER` | `openai` atau `anthropic` |
| `AI_API_KEY` | API key provider |
| `AI_MODEL` | misal `gpt-4o-mini` |
| `AI_BASE_URL` | hanya jika pakai gateway kompatibel |

### Domain sendiri

- Vercel: Settings → Domains, lalu tambahkan domain baru itu ke
  `API_ALLOWED_ORIGINS` dan `NEXT_PUBLIC_SITE_URL`.

### Catatan produksi

- `API_ENV=production` memaksa cookie `Secure` dan menolak start tanpa
  `SESSION_SECRET` / `API_ALLOWED_ORIGINS` — jangan turunkan ke `development`.
- Image Docker API sengaja membawa toolchain Go karena fitur *extension
  build* menjalankan `go run` saat runtime.
