# POSKOTANGGAP — Implementation Plan

> Prototipe hackathon LOGICODIX 2026. Bukan production-ready.
> Semua data demonstrasi adalah **data simulasi**.

## 0. Hasil pemeriksaan repository & lingkungan (awal)

- Repository berisi satu commit awal tanpa kode aplikasi.
- Node.js v22, npm 10, akses registry npm tersedia.
- Hosting pratinjau saat ini adalah Netlify; **target deployment akhir tetap
  Vercel** sesuai keputusan tim. Next.js App Router berjalan di kedua platform.
- Belum ada project Supabase maupun Gemini API key yang dikonfigurasi.

## 1. Problem statement, target pengguna, non-goals

Lihat `PROJECT_BRIEF.md` bagian 1, 2, 4. Ringkas: operator posko mengubah
laporan teks bebas menjadi data terstruktur dengan verifikasi manusia, tanpa
WhatsApp API, dispatch real-time, atau peta.

## 2. MVP scope per fase

| Fase | Isi | Kriteria selesai |
|---|---|---|
| 0 | Dokumen ini & brief | Dokumen disetujui tim |
| 1 | Fondasi frontend: Report Intake + Situation Dashboard, data mock terpisah, label SIMULATION DATA | Kedua view berjalan responsif |
| 2 | Supabase migrations + RLS, Auth, logika deterministik, route handler tervalidasi Zod, unit test | Semua tes lulus, dilaporkan apa adanya |
| 3 | Ekstraksi Gemini server-side dengan skema Zod ketat (null bila tidak ada) | Output tervalidasi, selalu lewat review |
| 4 | Polishing, uji manual, dokumentasi demo | Demo berjalan dengan data simulasi |

Hanya fase yang diminta yang dikerjakan; fitur di luar tabel ini perlu
persetujuan tim.

## 3. Arsitektur

- **Next.js App Router (TypeScript)**: halaman `/intake`, `/dashboard`,
  `/login`; route handler `/api/reports`, `/api/reports/[id]/verify`,
  `/api/dashboard`.
- **Lapisan data** `lib/data/`: interface `DataRepository` dengan dua
  implementasi — `mock` (in-memory, data simulasi, untuk dev tanpa Supabase)
  dan `supabase`. Pemilihan berdasarkan env var server.
- **Logika domain** `lib/domain/`: fungsi murni tanpa I/O.
- **Supabase**: Postgres + Auth. Aplikasi memakai anon key + sesi user,
  sehingga RLS selalu berlaku. Service-role key **tidak** dipakai runtime.
- **Gemini (fase 3)**: dipanggil hanya dari server; key di env server.

## 4. Data model awal

### reports
| Kolom | Tipe | Catatan |
|---|---|---|
| id | uuid PK | default `gen_random_uuid()` |
| raw_text | text not null | 1..5000 karakter |
| submitted_at | timestamptz not null | |
| incident_type | text null | enum terkontrol via check |
| location_text | text null | |
| normalized_area | text null | |
| status | text not null | `pending_review` / `verified` / `rejected` |
| fingerprint | char(64) not null unique | SHA-256 hex dari teks ternormalisasi |
| duplicate_of | uuid null FK → reports.id | potensi duplikat (bukan merge) |
| extraction_json | jsonb null | output mentah ekstraksi |
| created_at | timestamptz | default now() |
| verified_at | timestamptz null | wajib ada jika status verified |

### report_needs
| Kolom | Tipe | Catatan |
|---|---|---|
| id | uuid PK | |
| report_id | uuid FK → reports.id on delete cascade | |
| item | text not null | |
| quantity | numeric null | > 0 jika ada |
| unit | text null | |
| quantity_basis | text not null | `additional` / `total` / `unknown` |
| evidence_quote | text null | |
| verified | boolean default false | |

### inventory
| Kolom | Tipe | Catatan |
|---|---|---|
| id | uuid PK | |
| item, area, unit | text not null | unik bersama |
| available_quantity | numeric not null | ≥ 0 |
| updated_at | timestamptz | |

### operators
`user_id uuid PK FK → auth.users`. Fungsi `is_operator()` dipakai di policy RLS.

## 5. Aturan bisnis deterministik

- **A. Duplikat persis**: normalisasi (Unicode NFKC, lowercase, rapikan spasi,
  hapus tanda baca di ujung) → SHA-256. Fingerprint unik di DB.
- **B. Potensi duplikat**: area ternormalisasi + jenis kejadian sama dengan
  laporan lain yang belum ditolak → `duplicate_of` diisi, tetap disimpan,
  ditampilkan untuk review.
- **C. Verifikasi**: hanya `status = verified` yang dihitung.
- **D. Agregasi**: hanya kebutuhan `verified`, `quantity_basis = additional`,
  kuantitas valid (> 0, finite), satuan dan area tidak null.
- **E. Stok**: dicocokkan per (area, item, unit). Kekurangan =
  max(0, kebutuhan − stok). Satuan berbeda tidak dikonversi; ditandai.

## 6. Alur pengguna

Lihat `PROJECT_BRIEF.md` bagian 7.

## 7. Risiko implementasi

Lihat `PROJECT_BRIEF.md` bagian 8. Tambahan teknis:
- RLS salah konfigurasi → tes manual dengan user non-operator.
- Mode mock bisa tertukar dengan mode Supabase → label mode tampil di UI.
- Data mock in-memory hilang saat server restart (sengaja; hanya untuk demo).

## 8. Rencana testing

- Vitest untuk `lib/domain` dan validasi Zod (8 skenario wajib, lihat brief).
- Tes repository mock untuk alur submit → duplikat → verifikasi → agregasi.
- Typecheck (`tsc --noEmit`) dan lint.
- Uji manual UI responsif; RLS diuji manual di project Supabase tim.

## 9. Struktur repository

Lihat `PROJECT_BRIEF.md` bagian 11.

## 10. Keputusan teknis

1. Target deployment akhir: Vercel (pratinjau saat ini di Netlify).
2. Persistensi & auth: Supabase PostgreSQL + Supabase Auth.
3. Tidak ada konversi satuan otomatis di MVP.
4. Mode mock otomatis aktif bila env Supabase tidak diset; UI menampilkannya.

## 11. Blocker untuk tim

- Membuat project Supabase dan menjalankan migrasi.
- Menyediakan env `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Membuat akun operator dan menambahkannya ke tabel `operators`.
- Gemini API key (fase 3) disimpan di env server.
- Menetapkan daftar jenis kejadian & satuan baku bersama calon pengguna.
- Validasi masalah dengan operator posko nyata (belum dilakukan).
