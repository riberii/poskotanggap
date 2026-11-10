# POSKOTANGGAP

Prototipe hackathon LOGICODIX 2026 untuk membantu operator posko mengubah laporan bencana teks bebas menjadi data terstruktur, mendeteksi laporan berulang, memverifikasi kebutuhan secara manual, dan merekap kebutuhan vs stok. **Bukan production-ready. Tidak terhubung ke layanan tanggap darurat resmi. Semua data demo adalah simulasi.**

## Teknologi
Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Zod 4 · Supabase (PostgreSQL + Auth, via `@supabase/ssr`) · Gemini via `@google/genai` (server-side) · Vitest.

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

### Ekstraksi AI (Gemini)
- Endpoint server `POST /api/extract-report` → hanya menghasilkan **draf** untuk review manusia; tidak menyimpan dan tidak pernah memverifikasi.
- Model dibaca dari `GEMINI_MODEL` (default `gemini-3.8-flash`). Kredensial dibaca SDK dari `GEMINI_API_KEY` di server. Di Netlify, kredensial ini disuntik otomatis oleh Netlify AI Gateway; di platform lain (mis. Vercel) isi `GEMINI_API_KEY` sebagai env server, jangan pernah `NEXT_PUBLIC_`.
- Ekstraksi AI butuh operator login (mode Supabase). Untuk demo lokal mode mock, set `AI_EXTRACTION_ALLOW_MOCK_MODE=true` di env server.
- Validasi: JSON Schema ke model, Zod strict, kutipan bukti wajib potongan persis teks asli, angka/satuan wajib tertulis di kutipan; nilai yang tidak terbukti dikosongkan dan ditampilkan sebagai peringatan. Respons malformed dicoba ulang sekali lalu dilaporkan sebagai error.
- Gunakan hanya pesan simulasi. Jangan kirim data penyintas sungguhan ke AI.

## Roadmap
Lihat `PLAN.md`: polishing dan dokumentasi demo (fase 4).
