# DEPLOY — Ideaven Online

Panduan mengubah Ideaven dari projek lokal menjadi aplikasi web yang bisa
diakses siapa saja. Hanya butuh **dua layanan**, keduanya gratis:
**Neon** (database PostgreSQL) dan **Vercel** (frontend + API sekaligus,
via Vercel Services).

```
                         Vercel (satu project, satu domain)
        ┌──────────────────────────────────────────────────────────┐
        │  web  (apps/web, Next.js)          →  semua path         │
        │  api  (apps/api, Go)               →  path /api/*        │
        └──────────────────────────┬───────────────────────────────┘
                                   │ DATABASE_URL
                                   ▼
                            Neon PostgreSQL
```

Routing didefinisikan di `vercel.json` root: `/api/*` ke service `api`,
sisanya ke service `web`. Karena satu domain, cookie session otomatis
same-origin dan tidak perlu CORS lintas domain.

> Jalur alternatif (jika suatu saat ingin API long-running terpisah, misal
> Render): blueprint `render.yaml` masih ada di repo, lihat riwayat git.

---

## 1. Neon — database PostgreSQL (gratis)

1. Buka <https://neon.com> → **Sign up with GitHub** (sudah dilakukan ✓).
2. Buat project baru (nama bebas, misal `ideaven`).
3. Salin **Connection string** yang berakhiran `-pooler...neon.tech/...?sslmode=require`
   — gunakan varian **Pooled** (wajib untuk compute Vercel yang concurrency-nya
   tinggi). Ini nilai `DATABASE_URL`.

> Migrasi tabel dijalankan otomatis oleh API saat start — tidak perlu
> import SQL manual.

## 2. Vercel — web + API (gratis, satu project)

### Import

1. Buka <https://vercel.com> → **Sign up with GitHub**.
2. **Add New… → Project** → import `SulaimanTrid/ideaven-landing`.
3. Biarkan **Root Directory kosong** (repo root) — `vercel.json` yang
   mengatur dua service. Framework tidak perlu dipilih manual.
4. Sebelum menekan Deploy, isi **Environment Variables** (scope: All):

   | Key | Value | Catatan |
   |---|---|---|
   | `API_ENV` | `production` | Wajib. Cookie `Secure` + validasi ketat. |
   | `DATABASE_URL` | `postgresql://...pooler...neon.tech/neondb?sslmode=require` | Dari langkah 1. |
   | `SESSION_SECRET` | output `openssl rand -hex 32` | Wajib di produksi. |
   | `API_ALLOWED_ORIGINS` | `https://<nama-anda>.vercel.app` | URL produksi Vercel. Isi dulu `https://placeholder.vercel.app` jika URL belum terbentuk; perbarui setelah deploy pertama. |
   | `APP_URL` | sama dengan `API_ALLOWED_ORIGINS` | Dipakai untuk link di email. |
   | `NEXT_PUBLIC_SITE_URL` | sama dengan di atas | Canonical URL & sitemap. |

   `NEXT_PUBLIC_API_URL` **tidak perlu diisi** — default-nya same-origin.

5. **Deploy.** Vercel membangun kedua service: Next.js (apps/web) dan API
   Go (apps/api, entrypoint `cmd/api/main.go`, listen otomatis mengikuti
   env `PORT`).

### Setelah deploy pertama

1. Catat URL produksi (misal `https://ideaven-landing.vercel.app`).
2. Jika tadi masih placeholder: **Project → Settings → Environment
   Variables** → perbarui `API_ALLOWED_ORIGINS`, `APP_URL`, dan
   `NEXT_PUBLIC_SITE_URL` dengan URL asli → **Redeploy** (Deployments → ⋯
   → Redeploy).
3. Uji kesehatan: buka `https://<nama-anda>.vercel.app/api/health` — harus
   menjawab JSON `{"status":"ok",...}`. Lanjut uji register/login dari
   halaman utama.

---

## Batasan & catatan produksi

- **Extension build tidak aktif di Vercel.** Fitur build extension
  menjalankan `go run ./cmd/extbuild` saat runtime, dan runtime Go Vercel
  tidak menyertakan toolchain Go. Fitur lain (auth, project, builder,
  publish, asset) berjalan normal. Bila fitur ini dibutuhkan online, pindah
  service API ke runtime `container` (Dockerfile `apps/api/Dockerfile`
  sudah membawa toolchain) atau hosting terpisah.
- **Fitur Ask AI aktif hanya jika diisi** `AI_PROVIDER`, `AI_API_KEY`,
  `AI_MODEL` (dan `AI_BASE_URL` bila memakai gateway kompatibel). Tanpa itu
  API tetap hidup, fitur Ask AI yang mati.
- **Migrasi dijalankan tiap instance API start** — idempoten, aman.
- Paket gratis Vercel membatasi durasi & resource function; cukup untuk
  showcase dan penggunaan ringan, bukan beban produksi berat.
- `API_ENV=production` menolak start tanpa `SESSION_SECRET` dan
  `API_ALLOWED_ORIGINS` — jangan turunkan ke `development`.
