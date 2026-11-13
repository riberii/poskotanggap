<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# POSKOTANGGAP — catatan proyek

Rencana lama & riwayat: `PLAN.md`, `IMPLEMENTATION_PLAN.md`, `PROJECT_BRIEF.md`. Skrip demo: `DEMO_GUIDE.md`.

## Arsitektur (build yang diterbitkan = SPA Vite)
- `src/main.tsx` — rute `/dashboard` (default) dan `/intake`; `src/index.css` — tema terang datar (nama token `navy-*`/`teal-*` dipertahankan, nilainya netral).
- `lib/domain/` — logika murni & deterministik: normalisasi, fingerprint, duplikat (`explainDuplicate` hanya untuk tampilan), agregasi (`aggregateNeeds`, `computeShortages`, `priorityOf`, `sortByPriority`, `unresolved`), schema Zod. Wajib diuji di `tests/`.
- `lib/services/reports.ts` — aturan bisnis; menghitung ulang semua nilai turunan. Keputusan duplikat: `duplicateResolution` (`confirmed_duplicate` → laporan `rejected`; `keep_both` → `verified`).
- `lib/data/` — repository + backend localStorage (divalidasi Zod; data rusak → pulih ke seed + pemberitahuan). `seed-data.ts` memuat data demo.
- `components/dashboard/` — `attention.ts` (urutan KRITIS→PERINGATAN→INFORMASI), panel dashboard. `components/intake/` — `validation.ts` (status validasi, sorotan bukti, dampak verifikasi), `DuplicateCompare`, `IntakeWorkspace`, `samples.ts` (kasus demo A–E; indeks 0 dan 3 dipakai tes).
- `components/ui/` — Badge (selalu ikon + teks), EmptyState, Panel, Table, form.
- Legacy tidak dibangun: `app/`, `proxy.ts`, `next.config.ts`, `supabase/`, `lib/supabase`, `lib/services/gemini-extractor.ts`.

## Aturan non-obvious
- **AI hanya penasihat** (`netlify/functions/analyze-report.mts`: ringkasan, terjemahan, kewajaran, saran, rekomendasi 113/119). Jangan pakai AI untuk ekstraksi kebutuhan atau agregasi; saran AI tidak pernah masuk hitungan. Ekstraksi tetap rule-based; hasil selalu draf yang diperiksa operator. Halaman utama `/` = pelapor; tim di `/dashboard` & `/intake`.
- Unknown tetap `null`; tampilkan sebagai “tidak diketahui”, jangan 0. Tidak ada konversi satuan (unit mismatch → perlu verifikasi manusia).
- Hanya laporan `verified` + kebutuhan `verified` + basis `additional` yang dijumlahkan. Potensi duplikat tidak pernah dihapus/digabung otomatis; laporan tidak dihapus (gunakan `rejected`).
- Status harus memakai ikon + teks, bukan hanya warna. Istilah konsisten: Kritis / Peringatan / Terverifikasi / Potensi duplikat / Satuan tidak cocok (unit mismatch) / Tidak diketahui.
- Semua data demo diberi label simulasi; jangan simpan data korban nyata.
