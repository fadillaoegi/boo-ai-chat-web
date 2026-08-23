# Boo AI Chat

Antarmuka chat AI monokrom bergaya chunky 3D, dibangun dengan React, TypeScript, Vite, dan Tailwind CSS. Aplikasi mendukung pemilihan model 9Router, chat teks, voice input, text-to-speech, serta light/dark mode (default: light).

## Menjalankan aplikasi

> **Penting:** API key yang pernah ditempel di chat harus dianggap terekspos. Cabut/rotasi key tersebut dari Dashboard 9Router dan gunakan key baru.

```bash
pnpm install
cp .env.example .env.local
# isi NINEROUTER_URL dan NINEROUTER_KEY di .env.local
pnpm dev
```

Buka URL yang ditampilkan Vite. Secara default aplikasi mencoba 9Router lokal di `http://localhost:20128`. `NINEROUTER_KEY` boleh dikosongkan hanya jika autentikasi instance lokal memang dinonaktifkan.

## Keamanan integrasi

Browser memanggil endpoint proxy `/api/models`, `/api/models/vision`, `/api/models/image`, `/api/chat`, dan `/api/images/generations`. Plugin proxy pada `vite.config.ts` membaca `NINEROUTER_KEY` di sisi proses Vite lalu meneruskan request ke:

- `GET {NINEROUTER_URL}/v1/models`
- `GET {NINEROUTER_URL}/v1/models/image-to-text`
- `GET {NINEROUTER_URL}/v1/models/image`
- `POST {NINEROUTER_URL}/v1/chat/completions`
- `POST {NINEROUTER_URL}/v1/images/generations`

Key tidak memakai prefix `VITE_`, sehingga tidak dibundel ke JavaScript browser. `.env` dan `.env.*` juga diabaikan Git.

Plugin proxy berjalan pada `pnpm dev` dan `pnpm preview`. Untuk produksi di static hosting, pindahkan handler proxy yang sama ke server/serverless function milik deployment Anda; jangan pernah mengganti implementasi frontend agar memanggil 9Router langsung dengan secret.

## Fitur

- Model selector dinamis untuk chat, vision, dan image generation.
- Chat teks, status loading, error handling, dan percakapan baru.
- Upload JPG/PNG/WebP untuk analisis gambar; file dikompresi sebelum dikirim dan disimpan lokal.
- Mode **Buat Gambar** melalui `/v1/images/generations`, termasuk pilihan rasio, rendering hasil, dan generasi lanjutan yang mempertahankan prompt serta hasil gambar terakhir dalam sesi yang sama.
- Voice chat melalui Web Speech API (`id-ID`) dan balasan text-to-speech.
- Tema light sebagai default, dark mode manual, dan preferensi tersimpan lokal.
- Layout responsif untuk desktop dan mobile.

Voice recognition bergantung pada dukungan Web Speech API browser. Chrome/Edge umumnya mendukung; browser yang tidak mendukung akan menonaktifkan tombol mikrofon.

## Clean architecture

```text
src/
├── domain/          # Entitas dan kontrak ChatGateway
├── application/     # Use case/state percakapan
├── infrastructure/  # Adapter HTTP 9Router dan browser voice
├── presentation/    # Komponen UI reusable
└── App.tsx          # Composition root dan layar chat
```

Dependency mengarah ke domain: UI menggunakan application hook, application bergantung pada kontrak domain, dan detail HTTP/voice berada di infrastructure.

## Validasi

```bash
pnpm lint
pnpm build
```

## Riwayat lokal dan log

Percakapan disimpan di `localStorage` browser dengan key `boo-ai-chat-history:v1` (maksimal 50 sesi). Tombol **Chat Baru** membuka sesi kosong tanpa menghapus riwayat; pilih judul pada sidebar untuk membuka sesi lama. Data tidak disinkronkan antarperangkat dan akan hilang jika storage browser dibersihkan.

Enam log terbaru dapat dilihat di bagian bawah sidebar. Log yang lebih lengkap tersedia di terminal tempat `pnpm dev` dijalankan dengan prefix `[9router-proxy]`, dan di browser console dengan prefix `[boo-client]`. Log hanya mencatat route, status, durasi, dan pesan error—tidak mencatat API key atau isi percakapan.

Jika UI menampilkan **API key diperlukan**:

1. Buat atau perbarui `.env.local` di root proyek.
2. Isi `NINEROUTER_URL` dan `NINEROUTER_KEY` dengan key baru dari Dashboard 9Router.
3. Hentikan lalu jalankan ulang `pnpm dev`; Vite hanya membaca env saat startup.
