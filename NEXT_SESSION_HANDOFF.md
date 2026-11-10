# Handoff — migrasi Vite

## Status
Aplikasi Vite + React + TS + Tailwind 4 ada di `src/`, `index.html`, `vite.config.ts`. Memakai ulang `components/` dan `lib/` (alias `@`).
Mode tunggal: localStorage + RuleBasedExtractor. Tanpa Gemini/Supabase/AI di bundel.
Rute: `/intake` (`?report=<id>`), `/dashboard`. Netlify: build `npm run build`, publish `dist`, fallback SPA ke `/index.html`.

## Terverifikasi
- `npm test`: 63 test lulus. `npm run build`: sukses. `vite preview` menyajikan `/` dan `/dashboard` (HTTP).
- `tsc -p tsconfig.vite.json` bersih.

## Belum diverifikasi
- Uji klik manual di browser (submit/edit/verifikasi, duplikat, persistensi localStorage) belum dijalankan; logikanya dipakai ulang tanpa perubahan dan dicakup unit test.
- Font IBM Plex (next/font) diganti font sistem.

## Kode legacy (belum dihapus)
`app/`, `proxy.ts`, `next.config.ts`, `supabase/`, `lib/supabase`, `lib/services/gemini-extractor.ts` (server-only, nonaktif, tidak diimpor Vite). Skrip: `npm run legacy:dev|legacy:build`.

## Langkah berikut
1. Uji manual di browser lalu hapus kode legacy Next bila disetujui.
2. Pertimbangkan code-splitting (bundel 536 kB).
