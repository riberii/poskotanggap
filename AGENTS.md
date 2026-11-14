# POSKOTANGGAP — catatan proyek

Dokumen lama (digantikan) ada di `docs/archive/`. Skrip demo: `DEMO_GUIDE.md`. Penggunaan AI: `docs/AI_USAGE.md`. Hasil evaluasi: `docs/EVAL.md`. Hasil tes: `docs/TEST_REPORT.md`.

## Arsitektur (build yang diterbitkan = SPA Vite)
- `src/main.tsx` — rute `/dashboard` (default) dan `/intake`; `src/index.css` — tema terang datar (nama token `navy-*`/`teal-*` dipertahankan, nilainya netral).
- `lib/domain/` — logika murni & deterministik: normalisasi, fingerprint, duplikat (`explainDuplicate` hanya untuk tampilan), agregasi (`aggregateNeeds`, `computeShortages`, `priorityOf`, `sortByPriority`, `unresolved`), schema Zod. Wajib diuji di `tests/`.
- `lib/services/reports.ts` — aturan bisnis; menghitung ulang semua nilai turunan. Keputusan duplikat: `duplicateResolution` (`confirmed_duplicate` → laporan `rejected`; `keep_both` → `verified`).
- `lib/data/` — repository + backend localStorage (divalidasi Zod; data rusak → pulih ke seed + pemberitahuan). `seed-data.ts` memuat data demo.
- `components/dashboard/` — `attention.ts` (urutan KRITIS→PERINGATAN→INFORMASI), panel dashboard. `components/intake/` — `validation.ts` (status validasi, sorotan bukti, dampak verifikasi), `DuplicateCompare`, `IntakeWorkspace`, `samples.ts` (kasus demo A–E; indeks 0 dan 3 dipakai tes).
- `components/ui/` — Badge (selalu ikon + teks), EmptyState, Panel, Table, form.
- `lib/server/auth.ts` — gerbang operator (HMAC Web Crypto, cookie `pk_op` 8 jam). `requireOperator(req)` wajib di setiap endpoint tim; gagal-tertutup bila `OPERATOR_PASSCODE`/`SESSION_SECRET` kosong. Hanya `npm run dev` (scripts/dev-api.mts) menyetel `POSKOTANGGAP_DEV_OPEN=1` yang membukanya. UI: `components/OperatorGate.tsx` membungkus rute tim dan `/demo`; respons 401 memicu `UNAUTHORIZED_EVENT` sehingga layar kode muncul.
- `lib/domain/injection.ts` — guard deterministik terhadap kalimat instruksi di dalam laporan (dipakai `enforceEvidence` dan `revalidateDraft`).
- `lib/domain/sitrep.ts` — sitrep teks + CSV (fungsi murni, tanpa AI); tombol di `components/dashboard/SitrepActions.tsx`.
- Server: `netlify/functions/` (`sync.mts` Netlify Database, `auth.mts`, `extract.mts`, `analyze-report.mts`). Endpoint pelapor (kirim laporan, `status/:code`, chat pelapor, `analyze-report`) publik dengan rate limit; endpoint tim dilindungi.

## Halaman tim ringkas & animasi
- Teks halaman tim dipadatkan: penjelasan panjang ada di `components/ui/InfoTip.tsx` (`<details>`), bukan di layar. Jangan menambah paragraf subjudul; label maks 3 kata.
- Tindak lanjut pelapor: `lib/domain/follow-up.ts` (received → verified → arranged), `arrangeAid` di service; operator memakai “Tandai bantuan diatur” di `/intake?report=<id>` untuk laporan terverifikasi. Tidak memengaruhi agregasi (diuji di `tests/follow-up.test.ts`). Sinkron antar tab lewat event `storage`; kalimat “bantuan sedang diatur” hanya tampil bila operator menandai.
- Animasi: hanya transform/opacity, ≤400 ms (centang 500 ms), dimatikan oleh `prefers-reduced-motion`; kelas di `src/index.css` (`row-new`, `flash`, `short-bar`, `mark.sweep`, `pulse-once`). `CountUp` (dengan `id`) mengingat nilai terakhir selama sesi SPA. Antrean memakai View Transitions (`navigate(..., { viewTransition: true })`).
- Hitung kata: `scripts/count-words.mts` (Playwright, 1280 px).

## Aturan non-obvious
- **AI hanya penasihat** (`netlify/functions/analyze-report.mts`: ringkasan, terjemahan, kewajaran, saran, rekomendasi 113/119). Jangan pakai AI untuk ekstraksi kebutuhan atau agregasi; saran AI tidak pernah masuk hitungan. Ekstraksi tetap rule-based; hasil selalu draf yang diperiksa operator. Halaman utama `/` = pelapor; tim di `/dashboard` & `/intake` (di balik kode operator).
- Unknown tetap `null`; tampilkan sebagai “tidak diketahui”, jangan 0. Tidak ada konversi satuan (unit mismatch → perlu verifikasi manusia).
- Hanya laporan `verified` + kebutuhan `verified` + basis `additional` yang dijumlahkan. Potensi duplikat tidak pernah dihapus/digabung otomatis; laporan tidak dihapus (gunakan `rejected`).
- Status harus memakai ikon + teks, bukan hanya warna. Istilah konsisten: Kritis / Peringatan / Terverifikasi / Potensi duplikat / Satuan tidak cocok (unit mismatch) / Tidak diketahui.
- Semua data demo diberi label simulasi; jangan simpan data korban nyata.
