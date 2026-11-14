> **Arsip, digantikan.** Dokumen ini tidak lagi menjadi acuan; lihat `README.md`, `AGENTS.md`, dan `docs/TEST_REPORT.md` untuk keadaan terkini.

# POSKOTANGGAP — Project Brief

> Status dokumen: draf kerja tim untuk hackathon LOGICODIX 2026.
> Aplikasi ini adalah **prototipe MVP**, **bukan** sistem production-ready, dan
> **tidak terhubung** ke layanan tanggap darurat resmi mana pun.

## 1. Problem statement

Di posko bencana, laporan dari lapangan sering datang sebagai **teks bebas**
(pesan singkat yang diteruskan, catatan relawan, salinan dari grup chat).
Kami menduga (belum divalidasi dengan pengguna nyata) bahwa:

- Operator posko harus membaca ulang dan menyalin informasi lokasi, jenis
  kejadian, serta kebutuhan logistik secara manual.
- Laporan yang sama sering diteruskan berkali-kali sehingga kebutuhan
  terhitung ganda.
- Angka kebutuhan dalam pesan ambigu: apakah "butuh 50 dus air" itu kebutuhan
  **tambahan** atau **total** kebutuhan yang sudah sebagian terpenuhi.
- Rekap kebutuhan versus stok yang tersedia sulit dibuat dengan cepat.

POSKOTANGGAP membantu operator mengubah teks bebas menjadi data terstruktur
dengan bantuan AI, **selalu melalui verifikasi manusia**, lalu menghitung rekap
kebutuhan dan kekurangan stok dengan **kode deterministik**.

## 2. Target pengguna

| Peran | Kebutuhan utama |
|---|---|
| Operator posko (pengguna utama) | Memasukkan laporan, memeriksa hasil ekstraksi, memverifikasi, melihat rekap. |
| Relawan koordinator logistik | Melihat rekap kebutuhan vs stok per area. |

Asumsi: pengguna memakai laptop di posko atau ponsel dengan koneksi terbatas.
Asumsi ini **belum divalidasi** (lihat bagian 9).

## 3. MVP scope

Hanya dua tampilan utama:

1. **Report Intake** — tempel teks laporan → ekstraksi (AI, fase 3) → pratinjau
   hasil → edit lokasi, jenis kejadian, kebutuhan, kuantitas, satuan, dan basis
   kuantitas → lihat kutipan bukti → verifikasi.
2. **Situation Dashboard** — jumlah insiden terverifikasi, menunggu review,
   potensi duplikat, rekap kebutuhan, rekap stok dan kekurangan, tabel insiden
   terbaru.

Pendukung minimum: halaman login operator (Supabase Auth) karena data
operasional wajib dilindungi.

## 4. Non-goals

- Integrasi WhatsApp API atau kanal pesan apa pun.
- Dispatch darurat real-time / penugasan tim.
- Peta real-time atau peta dengan koordinat karangan.
- Auto-delete atau auto-merge laporan yang diduga duplikat.
- Notifikasi push, SMS, email.
- Manajemen pengguna multi-organisasi, multi-role yang kompleks.
- Klaim akurasi AI atau klaim kesiapan produksi.

## 5. Arsitektur (ringkas)

```
Browser (Next.js App Router, React, Tailwind)
   │  form / fetch (tanpa secret)
   ▼
Next.js server (Route Handlers, Vercel)
   ├─ Zod: validasi semua input
   ├─ lib/domain: normalisasi, fingerprint SHA-256, deteksi duplikat,
   │              agregasi, perhitungan kekurangan stok (deterministik)
   ├─ Gemini API (fase 3, server-side saja)
   └─ Supabase client (anon key + sesi user; RLS menegakkan akses)
          ▼
Supabase PostgreSQL (+ Auth, RLS)
```

Prinsip:
- AI hanya **mengusulkan** ekstraksi; manusia memutuskan.
- Semua angka di dashboard dihitung oleh kode deterministik dan teruji.
- Secret hanya di environment server. Service-role key tidak dipakai di runtime
  aplikasi.

## 6. Data model awal

- `reports` — teks mentah, waktu masuk, jenis kejadian, lokasi teks, area
  ternormalisasi, status (`pending_review`, `verified`, `rejected`),
  fingerprint SHA-256, `duplicate_of`, `extraction_json`, `created_at`,
  `verified_at`.
- `report_needs` — item, kuantitas (boleh null), satuan, basis kuantitas
  (`additional` / `total` / `unknown`), kutipan bukti, flag verified.
- `inventory` — item, area, satuan, jumlah tersedia (≥ 0), `updated_at`.
- `operators` — daftar user Supabase Auth yang diizinkan mengakses data.

Detail kolom dan constraint ada di `IMPLEMENTATION_PLAN.md` dan
`supabase/migrations/`.

## 7. Alur pengguna

1. Operator login.
2. Operator menempel teks laporan pada Report Intake, menekan **Analisis**.
3. Sistem menampilkan hasil ekstraksi; field yang tidak ditemukan tampil
   kosong (`null`) dan diberi tanda "tidak ditemukan".
4. Operator mengoreksi lokasi, jenis kejadian, kebutuhan, kuantitas, satuan,
   dan basis kuantitas, sambil membaca kutipan bukti.
5. Operator menyimpan (status `pending_review`) atau langsung
   **Verifikasi**.
6. Server menghitung fingerprint; jika identik dengan laporan yang ada,
   laporan ditolak sebagai duplikat persis dan tidak dihitung dua kali.
7. Jika area + jenis kejadian sama dengan laporan lain, laporan ditandai
   **potensi duplikat** untuk direview manusia (tidak dihapus/digabung).
8. Dashboard menampilkan rekap dari laporan terverifikasi saja.

## 8. Risiko implementasi

| Risiko | Mitigasi |
|---|---|
| Halusinasi AI (angka/lokasi karangan) | Wajib null jika tidak ada; kutipan bukti; verifikasi manusia. |
| Hitung ganda | Fingerprint SHA-256 + unique index; potensi duplikat ditandai. |
| Ambiguitas total vs tambahan | Field `quantity_basis`; hanya `additional` yang dijumlahkan. |
| Satuan tidak konsisten (dus vs botol) | Tidak ada konversi otomatis; pencocokan item+area+satuan persis; ketidakcocokan ditampilkan. |
| Kebocoran secret | Secret hanya di server env; `.env*` di-gitignore; RLS. |
| Normalisasi area yang naif | Normalisasi sederhana (lowercase, hapus tanda baca/awalan umum); operator bisa koreksi. |
| Waktu hackathon terbatas | Perubahan kecil bertahap, tes untuk logika kritis. |

## 9. Asumsi yang belum divalidasi

- Operator posko benar-benar menerima laporan dalam bentuk teks bebas dalam
  jumlah yang membebani.
- Duplikasi laporan adalah masalah nyata yang menyebabkan hitung ganda.
- Operator bersedia memverifikasi setiap laporan satu per satu.
- Pembedaan "tambahan" vs "total" dapat diputuskan operator dari teks.
- Penamaan area cukup konsisten untuk dicocokkan dengan normalisasi sederhana.
- Satuan stok dan kebutuhan dapat diseragamkan oleh operator.
- Koneksi internet di posko cukup untuk aplikasi web.
- Gemini cukup akurat untuk teks berbahasa Indonesia informal (belum diuji).

Tidak ada klaim bahwa masalah ini sudah divalidasi oleh pengguna nyata.

## 10. Rencana testing (ringkas)

- Unit test (Vitest) untuk logika domain: normalisasi, fingerprint, deteksi
  duplikat, agregasi, perhitungan kekurangan, validasi Zod.
- 8 skenario wajib: laporan normal terverifikasi, duplikat persis, laporan
  mirip perlu review, kuantitas hilang, lokasi hilang, laporan belum
  terverifikasi, satuan berbeda, stok negatif.
- Uji manual UI di desktop dan mobile.
- Hasil tes dilaporkan apa adanya.

## 11. Struktur repository yang direkomendasikan

```
app/                 # Next.js App Router (routes & route handlers)
components/          # Komponen UI sederhana
lib/domain/          # Logika bisnis deterministik (murni, teruji)
lib/data/            # Lapisan data (mock & Supabase) di balik satu interface
lib/supabase/        # Pembuat client Supabase (server/browser)
supabase/migrations/ # Migrasi SQL + RLS
tests/               # Vitest
docs/                # Catatan AI usage & third-party libraries
```

## 12. Penggunaan AI & library pihak ketiga

Lihat `docs/AI_USAGE.md` dan `docs/THIRD_PARTY.md`.
