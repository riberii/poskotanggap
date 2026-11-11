# POSKOTANGGAP

Prototipe hackathon LOGICODIX 2026 untuk membantu operator posko mengubah laporan bencana teks bebas menjadi data terstruktur, mendeteksi laporan berulang, memverifikasi kebutuhan secara manual, dan merekap kebutuhan vs stok.

> **Bukan production-ready. Tidak terhubung ke layanan tanggap darurat resmi. Semua data demo adalah simulasi (SIMULATION DATA).**
> Ekstraksi memakai **RuleBasedExtractor** (regex + kata kunci), **bukan AI**. Data hanya tersimpan di `localStorage` browser ini dan **tidak tersinkron** antar perangkat, browser, atau pengguna.

## Teknologi
Vite 8 · React 19 · TypeScript · Tailwind CSS 4 · React Router · Zod 4 · Vitest. Tanpa backend, tanpa API key.

## Instalasi dan menjalankan
Butuh Node.js ≥ 20.19 (dites rilis 22).
```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit + alur end-to-end tingkat service (Vitest)
npm run typecheck  # tsc untuk kode SPA
npm run build      # keluaran statis di dist/
npm run preview    # menyajikan dist/ di http://localhost:4173
```
Rute: `/intake` (Report Intake) dan `/dashboard` (Situation Dashboard). Rute lain dialihkan ke `/intake`.

## Alur demo
Lihat [DEMO_GUIDE.md](DEMO_GUIDE.md). Ringkasan: tempel/pilih laporan simulasi → ekstrak (berbasis aturan) → periksa bukti & edit → verifikasi manual → dashboard menghitung kebutuhan vs stok.

## Aturan data (dijaga kode + tes)
- Hanya laporan **terverifikasi** dengan kebutuhan terverifikasi dan basis **Tambahan** yang dijumlahkan.
- Duplikat persis (fingerprint SHA-256 dari teks ternormalisasi) ditolak, tidak dihitung dua kali.
- Potensi duplikat (area + jenis kejadian sama) hanya ditandai; verifikasi butuh konfirmasi manusia. Tidak ada penggabungan/penghapusan otomatis.
- Kuantitas yang tidak disebutkan tetap kosong (`null`), tidak ditebak, dan tidak dijumlahkan.
- Tidak ada konversi satuan; area + barang + satuan harus sama persis. Stok dalam satuan lain ditampilkan sebagai "Satuan berbeda".
- Stok tidak boleh negatif. Kekurangan = max(0, kebutuhan − stok), deterministik.

## Batasan yang diketahui
- Data hanya di `localStorage` satu browser; menghapus data situs menghapus data. Tab lain pada browser yang sama disinkronkan saat operasi berikutnya, bukan secara langsung.
- RuleBasedExtractor sengaja sederhana: hanya barang dalam katalog (`lib/domain/catalog.ts`), mengenali pola "`<angka> <satuan> <barang>`" (angka setelah nama barang, mis. "air mineral 40 botol", dibiarkan kosong), awalan lokasi harus "Kel./Desa/Kampung/Dusun" + nama berhuruf kapital.
- Katalog barang/satuan adalah asumsi awal dan perlu divalidasi bersama operator posko.
- Kode Next.js/Supabase/Gemini lama masih ada di repo (`app/`, `proxy.ts`, `lib/supabase`, `lib/services/gemini-extractor.ts`, `supabase/`) tetapi **tidak dibangun dan tidak ada di bundel Vite**. Skrip `legacy:*` hanya untuk referensi.

## Deploy (Netlify)
`netlify.toml`: build `npm run build`, publish `dist`, fallback SPA `/* → /index.html (200)`, `NODE_VERSION=22`, `NETLIFY_NEXT_PLUGIN_SKIP=true`.
Status deploy publik: lihat [SUBMISSION_CHECKLIST.md](SUBMISSION_CHECKLIST.md) dan [FINAL_QA_REPORT.md](FINAL_QA_REPORT.md).

## Dokumen
`PROJECT_BRIEF.md`, `IMPLEMENTATION_PLAN.md`, `PLAN.md` (perencanaan awal, sebagian merujuk arsitektur Next.js lama), `FINAL_QA_REPORT.md`, `DEMO_GUIDE.md`, `SUBMISSION_CHECKLIST.md`.
