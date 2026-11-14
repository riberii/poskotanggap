import { useEffect, useState } from "react";
import { getLocalBackend } from "./DataModeProvider";

/** Penjelasan jujur tentang penyimpanan localStorage + tombol reset data simulasi. */
export function LocalModeNotice() {
  const [recovered, setRecovered] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [resetError, setResetError] = useState(false);

  useEffect(() => {
    setRecovered(getLocalBackend().repo.loadOutcome === "recovered_from_corruption");
  }, []);

  function reset() {
    const backend = getLocalBackend();
    const snapshot = backend.repo.snapshot();
    backend.reset();
    if (backend.repo.lastPersistFailed) {
      backend.repo.restore(snapshot);
      setResetError(true);
      return;
    }
    window.location.reload();
  }

  return (
    <div className="border-b border-navy-700 bg-navy-850">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs text-muted sm:px-6 lg:px-8">
        <details className="relative">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-ink">
            <span className="rounded bg-warn px-1.5 py-0.5 font-bold tracking-wide text-white">SIMULASI</span>
            <span className="rounded border border-navy-600 px-2 py-1 font-medium">Info</span>
          </summary>
          <p className="absolute left-0 top-full z-20 mt-1 w-72 rounded-md border border-navy-700 bg-white p-3 text-ink shadow-md">Data demo, bukan layanan darurat. Jangan isi data korban asli. Data tim tersimpan di browser ini; laporan dari pelapor tiba lewat server sinkron.</p>
        </details>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {confirming ? (
            <>
              <span className="text-warn">Kembalikan data simulasi awal?</span>
              <button type="button" onClick={reset} className="rounded border border-danger/60 px-2 py-1 font-medium text-danger hover:bg-danger/10">
                Ya, reset
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="rounded border border-navy-600 px-2 py-1 hover:bg-navy-800">
                Batal
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} className="rounded border border-navy-600 px-2 py-1 font-medium text-ink hover:bg-navy-800">
              Reset data
            </button>
          )}
        </div>
      </div>
      {resetError && <p role="alert" className="mx-auto max-w-7xl px-4 pb-2 text-xs text-danger sm:px-6 lg:px-8">Reset gagal. Periksa izin atau ruang penyimpanan browser.</p>}
      {recovered && (
        <div role="alert" className="mx-auto max-w-7xl px-4 pb-2 text-xs text-warn sm:px-6 lg:px-8">
          Data di localStorage rusak atau tidak dikenali, sehingga tidak dipakai. Aplikasi memulai ulang dengan data simulasi awal.
        </div>
      )}
    </div>
  );
}
