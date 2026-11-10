<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# POSKOTANGGAP — catatan proyek

Rencana & status milestone: `PLAN.md` (detail: `IMPLEMENTATION_PLAN.md`, `PROJECT_BRIEF.md`).

## Arsitektur
- `app/` — halaman `/intake`, `/dashboard`, `/login`; route handler `/api/extract-report` (Gemini, hanya draf), `/api/reports`, `/api/reports/[id]`, `/api/review-queue`, `/api/dashboard`, `/api/inventory`, `/auth/logout`.
- `lib/domain/` — logika murni & deterministik (normalisasi, fingerprint SHA-256, duplikat, agregasi, kekurangan stok, schema Zod, ekstraktor simulasi). Wajib diuji di `tests/`.
- `lib/services/` — aturan bisnis server; menghitung ulang semua nilai turunan (status, fingerprint, area, duplicate_of, verified_at) — jangan percaya browser.
- `lib/data/` — interface `DataRepository` dengan `MockRepository` (tanpa env Supabase) dan `SupabaseRepository`. `getRequestContext()` menegakkan login + keanggotaan tabel `operators`.
- `supabase/migrations/` — skema, constraint, RLS (hanya operator), fungsi RPC transaksional `security invoker`.
- `proxy.ts` — konvensi Next 16 pengganti middleware; refresh sesi Supabase.

## Aturan non-obvious
- Hanya laporan `verified` + kebutuhan `verified` + basis `additional` yang dijumlahkan. Tidak ada konversi satuan; cocokkan area+barang+satuan persis.
- Potensi duplikat hanya ditandai; tidak pernah dihapus/digabung. Laporan tidak punya policy DELETE; gunakan status `rejected`.
- Field yang tidak ditemukan harus `null`. Semua data demo diberi label simulasi.
- Jangan pakai service-role key; jangan taruh secret di frontend.
- Output AI hanya draf: `lib/domain/ai-extraction.ts` mengosongkan nilai yang tidak didukung kutipan persis dari teks asli; respons di luar skema ditolak, bukan diperbaiki. Mode mock (tanpa login) menolak ekstraksi AI kecuali `AI_EXTRACTION_ALLOW_MOCK_MODE=true`.
