// Skenario /demo — SEMUA data fiktif. Teks memakai campuran bahasa Jawa dan Indonesia.
// Kata benda barang ("air mineral", "selimut") dan satuan sengaja ditulis seperti yang dikenali
// ekstraktor berbasis aturan: demo tidak boleh terlihat lebih pintar dari produk sebenarnya.
export const DEMO_REPORT_TEXT =
  "[SIMULASI] Banjir mlebu omah warga ing Desa Lawang Sewu Fiktif. 25 KK ngungsi ning masjid, bocah-bocah kedinginan. Butuh tambahan 20 dus air mineral lan 30 lembar selimut.";
export const DEMO_REPORT_LOCATION = "Desa Lawang Sewu Fiktif RT 02 RW 01";
export const DEMO_ARRANGE_NOTE = "[SIMULASI] Tim menuju lokasi, perkiraan 45 menit";

export const DEMO_STEPS = [
  { key: "reset", label: "Siapkan data simulasi" },
  { key: "send", label: "Pelapor menulis & mengirim" },
  { key: "queue", label: "Laporan muncul di antrean" },
  { key: "evidence", label: "Operator memeriksa bukti" },
  { key: "verify", label: "Operator memverifikasi" },
  { key: "arrange", label: "Operator menandai bantuan diatur" },
  { key: "status", label: "Layar pelapor berubah" },
] as const;
export type DemoStepKey = (typeof DEMO_STEPS)[number]["key"];
