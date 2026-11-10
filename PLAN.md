# POSKOTANGGAP — Milestones

Detail lengkap ada di `IMPLEMENTATION_PLAN.md`.

1. **[Selesai] Fase 0 — Perencanaan**: `PROJECT_BRIEF.md`, `IMPLEMENTATION_PLAN.md`.
2. **[Selesai] Fase 1 — Fondasi frontend**: Report Intake (`/intake`) dan Situation Dashboard (`/dashboard`), label SIMULATION DATA, lapisan data terpisah, responsif.
3. **[Selesai, perlu uji di Supabase nyata] Fase 2 — Persistensi & logika deterministik**: migrasi Supabase + RLS, login operator, fingerprint SHA-256, potensi duplikat, agregasi, kekurangan stok, 44 unit test lulus. RLS belum diuji terhadap project Supabase sungguhan.
<<<<<<< HEAD
4. **[Selesai, perlu uji dengan login Supabase nyata] Fase 3 — Ekstraksi Gemini**: `POST /api/extract-report` (model dari env `GEMINI_MODEL`, default `gemini-3.8-flash`), JSON Schema + Zod strict, pemeriksaan kutipan bukti terhadap teks asli, retry sekali untuk respons malformed, batas laju, hasil selalu draf. 63 unit test lulus; uji langsung ke model dengan 5 pesan simulasi dilakukan via `netlify dev` dalam mode mock. Ekstraktor simulasi kini hanya dipakai untuk data seed.
=======
4. **[Belum] Fase 3 — Ekstraksi Gemini** server-side dengan skema Zod ketat (field tidak ditemukan = null), menggantikan ekstraktor simulasi berbasis aturan di `lib/domain/simulated-extractor.ts`.
>>>>>>> 9d5b0f78dccc3e42ef7e3ebf32b603393a85ccb0
5. **[Belum] Fase 4 — Polishing & demo**: uji manual, `docs/AI_USAGE.md` dan `docs/THIRD_PARTY.md`, skrip demo dengan data simulasi.
