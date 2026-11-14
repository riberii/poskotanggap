# Submission Checklist

Submission hanya sekali; code freeze 14 Nov 2026 23.59 WIB. Centang hanya setelah benar-benar dikerjakan. Hasil tes ada di `docs/TEST_REPORT.md`.

## Perlu manusia (tidak bisa dikerjakan agen)
- [ ] Surat pernyataan orisinalitas: PDF, **bermeterai**, ditandatangani sesuai guidebook
- [ ] Video YouTube **3–5 menit** yang direkam dari **commit final** (alur: pelapor di HP → tim di laptop → dashboard/sitrep); tautan dimasukkan ke form
- [ ] **Hash commit final** dimasukkan ke form submission (cocokkan dengan `git log -1` setelah push terakhir)
- [ ] Repo tetap **public** sampai pengumuman
- [ ] Deploy Netlify berasal dari **commit final** (cek hash di Deploys); URL dimasukkan ke form
- [ ] Env di Netlify terisi: `OPERATOR_PASSCODE`, `SESSION_SECRET` (acak ≥16 karakter); opsional kunci AI
- [ ] README: isi `[ISI: ...]` (nama tim, anggota, URL deploy, hash commit, kode demo, atribusi)
- [ ] `docs/PROBLEM_EVIDENCE.md`: isi sumber nyata dan jawaban wawancara
- [ ] `docs/AI_USAGE.md`: isi bagian "Pemakaian AI dalam pengembangan"
- [ ] Jalankan `npm run eval` dengan kunci AI bila ingin memperbarui angka `docs/EVAL.md` (belum dijalankan ulang setelah perbaikan injeksi)
- [ ] Coba di HP dan laptop sungguhan di URL deploy: kirim laporan → muncul di tim → verifikasi → status berubah
- [ ] Latih `DEMO_GUIDE.md` sekali di URL deploy

## Dikerjakan di kode (lihat TEST_REPORT untuk bukti)
- [x] Gerbang operator (cookie HMAC 8 jam, gagal-tertutup); endpoint pelapor publik dengan rate limit
- [x] Penjaga injeksi perintah + tes regresi
- [x] Sitrep + CSV deterministik
- [x] Kartu orientasi, pemberitahuan privasi, EXIF dibuang lewat canvas
- [x] CI GitHub Actions
