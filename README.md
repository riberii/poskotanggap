# POSKOTANGGAP

Prototipe hackathon LOGICODIX 2026 untuk membantu operator posko mengubah laporan bencana teks bebas menjadi data terstruktur, mendeteksi laporan berulang, memverifikasi kebutuhan secara manual, dan merekap kebutuhan vs stok. **Bukan production-ready. Tidak terhubung ke layanan tanggap darurat resmi. Semua data demo adalah simulasi.**

## Teknologi
Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Zod 4 · Supabase (PostgreSQL + Auth, via `@supabase/ssr`) · Vitest. Gemini direncanakan untuk fase 3.

## Menjalankan lokal
```bash
npm install
npm run dev          # http://localhost:3000
npm test             # unit test logika bisnis
npm run typecheck
```
Tanpa env Supabase, aplikasi berjalan dalam **mode mock** (data simulasi in-memory, tanpa login).

### Mode Supabase
1. Buat project Supabase, jalankan `supabase/migrations/20261110000000_init.sql`.
2. Opsional: `npm run seed:sql` lalu jalankan `supabase/seed.sql` (data simulasi).
3. Buat user di Supabase Auth, lalu `insert into public.operators (user_id) values ('<uuid>');`.
4. Salin `.env.example` ke `.env.local`, isi `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Service-role key tidak dipakai.

## Roadmap
Lihat `PLAN.md`: integrasi Gemini (fase 3), polishing dan dokumentasi demo (fase 4).
