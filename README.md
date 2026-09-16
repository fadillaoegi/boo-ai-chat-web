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

## Design token

Token visual Boo (warna, kedalaman shadow, radius, border, font) berada di `src/design/tokens.ts`
dan menjadi satu-satunya sumber kebenaran. File itu sengaja tidak mengimpor apa pun dan tidak
menyebut CSS maupun DOM, sehingga bisa dipakai web maupun CLI `boo` nanti.

```bash
# ubah src/design/tokens.ts, lalu:
pnpm tokens     # regenerate src/design/tokens.css
```

`tokens.css` **hasil generate — jangan diedit manual.** Isinya custom property pada `:root`/`:root.dark`
plus blok `@theme inline` Tailwind.

Shadow chunky punya empat varian warna:

| Utility | Warna | Dipakai untuk |
|---|---|---|
| `shadow-boo-*` | ikut tema (`#000` → `#525252`) | permukaan normal |
| `shadow-boo-soft-*` | ikut tema (`#a3a3a3` → `#525252`) | elemen markdown |
| `shadow-boo-inverse-*` | tetap `#a3a3a3` | permukaan hitam |
| `shadow-boo-danger-*` | tetap `#7f1d1d` | permukaan merah |

Skala `*`: `xs`=1px, `sm`=2px, `md`=3px, `lg`=4px, `xl`=5px, `2xl`=8px.

Karena warnanya sudah membalik lewat custom property, **jangan tulis varian `dark:` untuk shadow**
— cukup `shadow-boo-md`, bukan `shadow-boo-md dark:shadow-boo-md`.

CLI membaca token yang sama sebagai hex:

```ts
import { resolve } from './design/tokens.ts'
resolve('dark').accent   // '#7dd3fc'
```

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
pnpm test
```

### Memeriksa dukungan function calling

```bash
pnpm check:tools                       # model kurasi
pnpm check:tools ag/claude-sonnet-4-6  # model tertentu
pnpm check:tools --all                 # seluruh model terdaftar
```

Skrip ini menguji tiga lapis: model mengeluarkan `tool_calls` yang valid, `arguments`
tetap utuh setelah disambung dari chunk SSE, dan hasil tool yang dikirim balik
(`role: "tool"`) benar-benar diterima sehingga percakapan bisa dilanjutkan.

Jalankan ulang setiap kali menambah provider atau memperbarui 9Router — dukungan
tool calling berbeda per provider dan bisa berubah tanpa pemberitahuan.

Catatan dari hasil pengujian yang perlu diingat saat memakai API ini:

- **Kirim `stream` secara eksplisit.** Provider `ag/*` default-nya streaming, sehingga
  request tanpa field tersebut membalas SSE saat JSON yang diharapkan.
- **Model thinking mengirim `reasoning_content`** terpisah dari `content`; jangan
  dianggap balasan kosong.
- **Format `tool_call_id` berbeda antarprovider.** Kembalikan apa adanya, jangan diparsing.
- **Balasan kosong sesekali terjadi**, jadi pemanggilnya perlu retry.

## Riwayat lokal dan log

Percakapan disimpan di `localStorage` browser dengan key `boo-ai-chat-history:v1` (maksimal 50 sesi). Tombol **Chat Baru** membuka sesi kosong tanpa menghapus riwayat; pilih judul pada sidebar untuk membuka sesi lama. Data tidak disinkronkan antarperangkat dan akan hilang jika storage browser dibersihkan.

Enam log terbaru dapat dilihat di bagian bawah sidebar. Log yang lebih lengkap tersedia di terminal tempat `pnpm dev` dijalankan dengan prefix `[9router-proxy]`, dan di browser console dengan prefix `[boo-client]`. Log hanya mencatat route, status, durasi, dan pesan error—tidak mencatat API key atau isi percakapan.

Jika UI menampilkan **API key diperlukan**:

1. Buat atau perbarui `.env.local` di root proyek.
2. Isi `NINEROUTER_URL` dan `NINEROUTER_KEY` dengan key baru dari Dashboard 9Router.
3. Hentikan lalu jalankan ulang `pnpm dev`; Vite hanya membaca env saat startup.
