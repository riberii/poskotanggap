import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/form";
import { InfoTip } from "@/components/ui/InfoTip";

const KEY = "poskotanggap:try-card-dismissed";
const read = () => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};

/** Kartu orientasi untuk juri/pengunjung baru. Bisa ditutup; pilihan diingat di browser ini. */
export function TryCard({ onFillSample, disabled }: { onFillSample: () => void; disabled: boolean }) {
  const [hidden, setHidden] = useState(read);
  if (hidden) return null;
  const close = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      // Tidak kritis: kartu muncul lagi di kunjungan berikutnya.
    }
    setHidden(true);
  };
  return (
    <section aria-label="Coba dalam 3 langkah" className="mt-4 rounded-lg border border-teal-accent/40 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-bold">
          Coba dalam 3 langkah{" "}
          <InfoTip label="Info">Semua data fiktif dan tersimpan di browser ini. Halaman tim meminta kode operator demo (lihat README, “Akun demonstrasi”). Untuk menonton tanpa mengetik, buka /demo.</InfoTip>
        </h2>
        <button type="button" onClick={close} aria-label="Tutup panduan" className="-m-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded text-lg text-muted hover:bg-navy-800">
          ×
        </button>
      </div>
      <ol className="mt-2 space-y-2 text-sm">
        <li className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-teal-accent">1.</span> Kirim laporan contoh
          <Button disabled={disabled} onClick={onFillSample} className="min-h-9 px-3 py-1 text-xs">Isi contoh</Button>
        </li>
        <li>
          <span className="font-bold text-teal-accent">2.</span> Buka{" "}
          <Link to="/intake" className="font-semibold text-teal-accent underline underline-offset-2">halaman tim</Link>
        </li>
        <li>
          <span className="font-bold text-teal-accent">3.</span> Lihat{" "}
          <Link to="/dashboard" className="font-semibold text-teal-accent underline underline-offset-2">dashboard</Link> dan jejak bukti
        </li>
      </ol>
    </section>
  );
}
