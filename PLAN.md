# POSKOTANGGAP — Milestones

Detail lengkap ada di `IMPLEMENTATION_PLAN.md`.

1. **[Selesai] Fase 0 — Perencanaan**: `PROJECT_BRIEF.md`, `IMPLEMENTATION_PLAN.md`.
2. **[Selesai] Fase 1 — Fondasi frontend**: Report Intake (`/intake`) dan Situation Dashboard (`/dashboard`), label SIMULATION DATA, lapisan data terpisah, responsif.
3. **[Selesai, perlu uji di Supabase nyata] Fase 2 — Persistensi & logika deterministik**: migrasi Supabase + RLS, login operator, fingerprint SHA-256, potensi duplikat, agregasi, kekurangan stok, 44 unit test lulus. RLS belum diuji terhadap project Supabase sungguhan.
4. **[Belum] Fase 3 — Ekstraksi Gemini** server-side dengan skema Zod ketat (field tidak ditemukan = null), menggantikan ekstraktor simulasi berbasis aturan di `lib/domain/simulated-extractor.ts`.
5. **[Belum] Fase 4 — Polishing & demo**: uji manual, `docs/AI_USAGE.md` dan `docs/THIRD_PARTY.md`, skrip demo dengan data simulasi.
