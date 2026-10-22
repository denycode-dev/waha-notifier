# Coolify to WAHA Notifier

Bridge notifikasi webhook ringan dari **Coolify** ke **WAHA** (WhatsApp HTTP API).

## 🚀 Fitur & Peningkatan

- **TypeScript Modern (ESM & Strict Mode)**: Penuh dengan type-safety, tidak ada tipe implisit `any`.
- **Zero Runtime Dependencies**: Sangat ringan, hanya mengandalkan fitur native Node.js (`node:http`, `fetch`, `node:crypto`).
- **Timing-Safe Webhook Comparison**: Mencegah celah timing attack pada secret URL webhook via `crypto.timingSafeEqual`.
- **Graceful Shutdown**: Menangani sinyal `SIGTERM` dan `SIGINT` dengan aman saat deployment atau restart container.
- **Validasi Environment Variables**: Fail-fast saat booting jika ada konfigurasi yang belum diisi.
- **Docker Multi-Stage Build**: Image Docker produksi minimalis menggunakan user non-root (`node`) dan native Docker healthcheck.
- **Built-in Testing**: Dilengkapi unit test menggunakan Node.js test runner (`node:test`).

---

## 🛠️ Persyaratan Sistem

- Node.js `>= 22`
- npm `>= 10`

---

## ⚙️ Konfigurasi Environment (`.env`)

Salin file `.env.example` ke `.env`:

```bash
cp .env.example .env
```

Isi variabel berikut:

| Variabel | Deskripsi | Contoh |
| :--- | :--- | :--- |
| `PORT` | Port server HTTP | `3000` |
| `WEBHOOK_SECRET` | Secret token acak untuk URL webhook | `01a1627c-5576-7e2c-a0ae-0a2475aa4820` |
| `WAHA_URL` | Base URL instance WAHA | `https://wa.domain.com` atau `http://waha:3000` |
| `WAHA_API_KEY` | API Key WAHA (jika diaktifkan) | `api-key-waha` |
| `WAHA_SESSION` | Nama sesi WhatsApp WAHA | `default` |
| `WAHA_CHAT_ID` | WhatsApp ID tujuan notifikasi | `6281234567890@c.us` |
| `ALLOW_SELF_SIGNED_CERTS` | Abaikan verifikasi SSL jika WAHA memakai sertifikat self-signed | `true` atau `false` |

---

## 📦 Perintah npm

| Perintah | Deskripsi |
| :--- | :--- |
| `npm run dev` | Menjalankan server dalam mode development dengan watch & auto-load `.env` |
| `npm run typecheck` | Menjalankan pengecekan tipe TypeScript (`tsc --noEmit`) |
| `npm run build` | Melakukan kompilasi TypeScript ke folder `dist/` |
| `npm test` | Menjalankan build dan unit testing suite |
| `npm start` | Menjalankan server hasil build (`dist/server.js`) |

---

## 🐳 Deployment via Docker

Build dan jalankan container:

```bash
docker build -t coolify-waha-notifier .
docker run -d --name coolify-notifier -p 3000:3000 --env-file .env coolify-waha-notifier
```

---

## 🔗 Endpoint & Pengujian

- **Health Check**: `GET /health` -> `{"status":"ok"}`
- **Webhook Coolify**: `POST /hook/<WEBHOOK_SECRET>`

### Cara Test di Windows PowerShell:
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/hook/<WEBHOOK_SECRET>" -Method Post -ContentType "application/json" -Body '{"event":"test","message":"Testing Coolify to WAHA"}'
```

### Cara Test di Linux / Mac / Git Bash (curl):
```bash
curl -X POST http://localhost:3000/hook/<WEBHOOK_SECRET> \
  -H "Content-Type: application/json" \
  -d '{"event":"test","message":"Testing Coolify to WAHA"}'
```
