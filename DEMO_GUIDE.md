# Panduan Demo — POSKOTANGGAP (± 4 menit, semua data fiktif)

Sebelum mulai: buka aplikasi di tab baru, lalu tekan **Reset data → Ya, reset** (bilah di bawah header) agar data awal bersih.

**Alur yang ditunjukkan:** laporan teks → ekstraksi → verifikasi operator → rekap → kebutuhan vs stok → dashboard.

## 0. Dashboard awal (20 detik)
Buka **Dashboard**. Tunjukkan panel **Perlu perhatian sekarang**: KRITIS (kekurangan air mineral & selimut) → PERINGATAN (potensi duplikat, menunggu verifikasi, satuan tidak cocok, stok belum tercatat, jumlah tidak diketahui) → INFORMASI. Catat angka “Kebutuhan kurang”.

## 1. Kasus A — laporan normal
**Laporan & verifikasi** → klik **A · Laporan normal** (otomatis memuat & menganalisis).
Tunjukkan: teks asli dengan kalimat sumber disorot, tiga kebutuhan (air mineral 20 dus, selimut 30 lembar, popok 10 paket), tiap item punya “Dari kalimat: …”. Klik **Verifikasi & masukkan ke rekap**.
Kotak hijau menjelaskan dampaknya: *Air mineral 20 dus masuk rekap Contoh Makmur → stok 5, KURANG 15 dus (KRITIS)*. Buka **Dashboard** — angka berubah.

## 2. Kasus B — jumlah tidak diketahui
Klik **B · Jumlah tidak diketahui**. Tenda tampil **Jumlah: tidak diketahui** (bukan 0). Verifikasi → di dashboard muncul di **Kebutuhan tanpa jumlah pasti**, tidak masuk hitungan kekurangan.

## 3. Kasus C — potensi duplikat
Klik **C · Potensi duplikat**. Muncul panel **Potensi duplikat**: Laporan A vs Laporan B, alasan sistem (area sama, jenis kejadian sama, barang sama), dan tiga keputusan: **Konfirmasi duplikat** (disimpan sebagai ditolak, tidak dihapus, tidak dihitung) / **Pertahankan keduanya** / **Tinjau nanti**. Pilih *Konfirmasi duplikat* → total di dashboard tidak berubah (tidak double-count).
(Laporan persis sama ditolak otomatis: pilih **Duplikat persis**.)

## 4. Kasus D — satuan tidak cocok
Klik **D · Satuan berbeda dengan stok**. Di *Status validasi* tampil **UNIT MISMATCH — 100 botol dibutuhkan, stok 5 dus**. Verifikasi → dashboard menampilkan kartu **Satuan tidak cocok · Unit mismatch**: *100 botol dibutuhkan / 5 dus tersedia / Tindakan: perlu verifikasi manusia*. Tidak ada konversi, tidak ada angka kekurangan karangan.

## 5. Kasus E — laporan tidak lengkap
Klik **E · Laporan tidak lengkap**. Lokasi & jumlah kosong; *Status validasi* menandai “Wajib diperbaiki” dan tombol verifikasi nonaktif sampai lokasi diisi.

## 6. Ketahanan
Muat ulang halaman: data bertahan. Reset data mengembalikan data awal. Data localStorage rusak → aplikasi pulih ke data awal dan memberi tahu operator.

## Poin bicara
- Manusia memverifikasi semuanya; ekstraktor hanya membuat draf (aturan kata kunci, **bukan AI**).
- Hanya kebutuhan “Tambahan” terverifikasi dengan jumlah dan satuan jelas yang dijumlahkan. Unknown tetap unknown.
- Batas: data di satu browser, katalog barang kecil, prototipe.
