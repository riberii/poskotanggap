"use client";

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
    <div className="border-b border-white/5 bg-navy-950/20">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs text-muted sm:px-6 lg:px-8">
        <details>
          <summary className="cursor-pointer text-muted hover:text-ink">Data tersimpan di browser ini · Detail</summary>
          <p className="max-w-xl pt-2">Data tidak tersinkron antar perangkat atau pengguna, dan akan hilang jika data situs dihapus.</p>
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
