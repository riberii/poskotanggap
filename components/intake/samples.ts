// Contoh teks laporan SIMULASI (fiktif) untuk demonstrasi alur.
// Urutan indeks 0 dan 3 dipakai oleh tes; jangan ubah posisinya.
export const SAMPLE_REPORTS = [
  {
    label: "A · Laporan normal",
    hint: "Lengkap: lokasi, barang, jumlah, satuan.",
    text: "[SIMULASI] Banjir mulai masuk rumah warga di Desa Contoh Makmur. Ada 25 KK di masjid. Masih butuh tambahan 20 dus air mineral, 30 lembar selimut dan 10 paket popok.",
  },
  {
    label: "C · Potensi duplikat",
    hint: "Area & jenis kejadian sama dengan laporan yang sudah terverifikasi.",
    text: "[SIMULASI] Air naik lagi di Kelurahan Simulasi Barat RW 03, pengungsi bertambah. Butuh tambahan 15 dus air mineral.",
  },
  {
    label: "Duplikat persis",
    hint: "Identik dengan laporan tersimpan — ditolak otomatis.",
    text: "[SIMULASI] Banjir setinggi lutut di Kelurahan Simulasi Barat RW 03. Sekitar 40 KK mengungsi di balai warga. Masih butuh tambahan 30 dus air mineral dan 50 kg beras.",
  },
  {
    label: "E · Laporan tidak lengkap",
    hint: "Tanpa lokasi dan jumlah — tidak bisa diverifikasi sebelum dilengkapi.",
    text: "[SIMULASI] Ada kebakaran rumah, warga butuh selimut dan makanan siap saji secepatnya.",
  },
  {
    label: "B · Jumlah tidak diketahui",
    hint: "Barang disebut, jumlah tidak. Harus tetap “tidak diketahui”, bukan 0.",
    text: "[SIMULASI] Kebakaran permukiman di Desa Contoh Makmur. Warga membutuhkan tenda.",
  },
  {
    label: "D · Satuan berbeda dengan stok",
    hint: "Kebutuhan dalam botol, stok tercatat dalam dus — tidak dikonversi.",
    text: "[SIMULASI] Tanah longsor di Desa Contoh Makmur. Masih butuh tambahan 100 botol air mineral.",
  },
  {
    label: "Total vs tambahan",
    hint: "Ada angka total dan tambahan sekaligus — operator memilih mana yang benar; total tidak dijumlahkan.",
    text: "[SIMULASI] Gempa bumi di Desa Contoh Makmur. Total kebutuhan air mineral 120 dus, tetapi 30 dus sudah tersedia. Tim masih butuh tambahan 15 dus.",
  },
];
