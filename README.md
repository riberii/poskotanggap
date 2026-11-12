# POSKOTANGGAP

Alat operator posko yang sederhana tetapi andal: mengubah laporan bencana teks bebas menjadi **data kebutuhan yang diverifikasi manusia**, lalu membandingkannya dengan stok untuk memperlihatkan **apa yang paling butuh perhatian sekarang**.

```
Laporan teks → ekstraksi (aturan) → verifikasi operator → rekap → kebutuhan vs stok → dashboard
```

**Tanpa AI.** Ekstraksi memakai kata kunci/regex, seluruh perhitungan deterministik. Data fiktif dan tersimpan di localStorage browser (prototipe).

## Layar
- **Dashboard** (`/dashboard`) — panel “Perlu perhatian sekarang” (KRITIS → PERINGATAN → INFORMASI), angka kunci, kebutuhan vs stok (kekurangan, unit mismatch, stok belum tercatat), kebutuhan tanpa jumlah pasti, stok, laporan terbaru.
- **Laporan & verifikasi** (`/intake`) — Laporan asli (kalimat sumber disorot) → informasi yang ditemukan + bukti → status validasi → tindakan. Perbandingan potensi duplikat (Konfirmasi duplikat / Pertahankan keduanya / Tinjau nanti). Kasus demo A–E satu klik.

## Prinsip data
- Field tidak ditemukan = `null` / “tidak diketahui”, tidak pernah 0 atau tebakan.
- Hanya laporan `verified` + kebutuhan basis “Tambahan” + jumlah & satuan valid yang dijumlahkan.
- Tidak ada konversi satuan: 100 botol vs stok 5 dus = **unit mismatch**, perlu verifikasi manusia.
- Potensi duplikat hanya ditandai; keputusan di operator. Laporan ditolak disimpan, tidak dihapus.

## Teknologi
Vite + React 19 + TypeScript, React Router, Tailwind CSS 4, Zod, Vitest. Dideploy sebagai SPA statis di Netlify.

## Menjalankan
```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit & alur end-to-end (localStorage backend)
npm run build
```
Panduan presentasi: `DEMO_GUIDE.md`. Catatan arsitektur: `AGENTS.md`.

Kode Next.js/Supabase/Gemini lama (`app/`, `supabase/`, `lib/supabase`, `lib/services/gemini-extractor.ts`) tidak dipakai oleh build yang diterbitkan.
