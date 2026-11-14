# Penggunaan AI

Ringkasan jujur tentang di mana AI dipakai di POSKOTANGGAP, apa yang dikirim, dan apa yang tidak. Disinkronkan dengan kode per 14 Nov 2026.

## Prinsip
- **AI hanya penasihat.** Keluaran AI tidak pernah masuk hitungan kebutuhan, stok, atau kekurangan. Hanya laporan `verified` + kebutuhan `verified` + basis "additional" yang dijumlahkan, dan itu keputusan manusia.
- Model: Gemini (bawaan `gemini-3.5-flash`, dapat diganti lewat `GEMINI_MODEL`) melalui Netlify AI Gateway atau `GEMINI_API_KEY`. Kunci hanya ada di env server, tidak pernah di browser.
- Bila AI tidak tersedia, aplikasi tetap bekerja: ekstraksi kembali ke aturan saja dan pengguna diberi tahu.

## Titik pemakaian
| Fungsi | Siapa yang memanggil | Yang dikirim ke model | Dipakai untuk |
|---|---|---|---|
| `POST /api/analyze-report` | Halaman pelapor saat mengirim laporan (publik, rate limit 8/menit/klien) | Teks laporan **setelah redaksi** + lampiran (foto/bingkai video/PDF/teks) | Ringkasan, terjemahan bahasa daerah, deskripsi media, penilaian kewajaran, saran langkah untuk tim. Disimpan sebagai `aiInsight` pada laporan, hanya tampil sebagai saran. |
| `POST /api/extract` | Layar operator (`IntakeWorkspace`), **wajib sesi operator** (rate limit 12/menit/klien) | Teks laporan **setelah redaksi** | Pembaca kedua untuk ekstraksi draf. Digabung dengan pembaca aturan (`lib/domain/hybrid.ts`); nilai yang berbeda dikosongkan dan ditandai "periksa". Hasil tetap draf yang diverifikasi operator. |

Tidak memakai AI: rekomendasi Damkar/Ambulans (`lib/domain/danger.ts`, kata kunci), agregasi, deteksi duplikat, sitrep, CSV, status pelapor.

## Perlindungan
- **Redaksi PII** (`lib/domain/redact.ts`) pada teks sebelum ke model: email → `[EMAIL]`, NIK 16 digit → `[NIK]`, telepon Indonesia → `[TELEPON]`. Nama dan alamat **tidak** diredaksi (lokasi dibutuhkan).
- **Lampiran tidak diredaksi.** Foto/video/PDF dikirim apa adanya ke model. Karena itu halaman pelapor memberi pemberitahuan sebelum tombol kirim agar tidak mengirim data pribadi korban.
- **EXIF/GPS foto dibuang** di browser: gambar digambar ulang lewat canvas dan di-encode JPEG baru (`lib/media.ts`), jadi metadata tidak ikut tersimpan atau terkirim. Video hanya diambil bingkainya (3 bingkai). PDF dan teks polos dikirim apa adanya (metadata dalam PDF tidak dibersihkan).
- **Injeksi perintah**: pesan dibungkus `<pesan>…</pesan>` dan diperlakukan sebagai data pada instruksi sistem; keluaran divalidasi Zod strict, kutipan bukti harus potongan persis teks asli, angka harus ada di teks. Guard deterministik `lib/domain/injection.ts` membuang nilai yang berasal dari kalimat instruksi pada jalur aturan dan jalur AI.
- Cache hasil ekstraksi di memori server (hash teks, maksimum 200 entri, hilang saat instance berhenti). Log server tidak memuat isi pesan.

## Evaluasi
`docs/EVAL.md` (46 pesan fiktif berlabel tim, bukan pihak independen). Angka AI/hibrida di sana belum dijalankan ulang setelah perbaikan injeksi; lihat bagian Catatan di dokumen itu.

## Pemakaian AI dalam pengembangan
[ISI: tim menjelaskan alat AI yang dipakai membantu menulis kode/dokumen dan bagian mana yang ditinjau manusia — diisi oleh anggota tim]
