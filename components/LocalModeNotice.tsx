"use client";

import { useEffect, useState } from "react";
import { getLocalBackend } from "./DataModeProvider";

/** Penjelasan jujur tentang penyimpanan localStorage + tombol reset data simulasi. */
export function LocalModeNotice() {
  const [recovered, setRecovered] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    setRecovered(getLocalBackend().repo.loadOutcome === "recovered_from_corruption");
  }, []);

  function reset() {
    getLocalBackend().reset();
    // Muat ulang agar semua tampilan membaca state baru.
    window.location.reload();
  }

  return (
    <div className="border-b border-navy-700 bg-navy-900/60">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-2 text-xs text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <p>
          <span className="font-medium text-ink">Penyimpanan prototipe:</span> data tersimpan di localStorage browser ini
          saja — tidak tersinkron antar perangkat, browser, atau pengguna, dan hilang bila data situs dihapus.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {confirming ? (
            <>
              <span className="text-warn">Hapus semua perubahan di browser ini?</span>
              <button type="button" onClick={reset} className="rounded border border-danger/60 px-2 py-1 font-medium text-danger hover:bg-danger/10">
                Ya, reset
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="rounded border border-navy-600 px-2 py-1 hover:bg-navy-800">
                Batal
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} className="rounded border border-navy-600 px-2 py-1 font-medium text-ink hover:bg-navy-800">
              Reset data simulasi
            </button>
          )}
        </div>
      </div>
      {recovered && (
        <div role="alert" className="mx-auto max-w-7xl px-4 pb-2 text-xs text-warn sm:px-6 lg:px-8">
          Data di localStorage rusak atau tidak dikenali, sehingga tidak dipakai. Aplikasi memulai ulang dengan data simulasi awal.
        </div>
      )}
    </div>
  );
}
