import { useState } from "react";
import { GeoMap } from "@/components/ui/GeoMap";
import { Button } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { makeGeoPoint, type GeoPoint } from "@/lib/domain/geo";

type State =
  | { s: "idle" }
  | { s: "asking" }
  | { s: "preview"; geo: GeoPoint }
  | { s: "error"; message: string };

function messageFor(err: GeolocationPositionError | { code: number }): string {
  if (err.code === 1) return "Izin lokasi ditolak. Aktifkan izin lokasi untuk situs ini di pengaturan browser, lalu coba lagi. Anda tetap bisa mengirim laporan tanpa lokasi.";
  if (err.code === 2) return "Lokasi tidak bisa ditentukan. Pindah ke tempat terbuka dan coba lagi.";
  if (err.code === 3) return "Terlalu lama menunggu sinyal GPS. Coba lagi.";
  return "Lokasi tidak bisa diambil.";
}

/**
 * Lokasi lewat GPS perangkat. Alur: tekan tombol → browser minta izin → peta Google Maps dengan pin merah →
 * pelapor menekan "Ya, lokasi ini benar". Titik hanya dikirim bila dikonfirmasi.
 */
export function LocationPicker({ value, onChange, disabled }: { value: GeoPoint | null; onChange: (g: GeoPoint | null) => void; disabled?: boolean }) {
  const [st, setSt] = useState<State>({ s: "idle" });
  const supported = typeof navigator !== "undefined" && "geolocation" in navigator;

  function locate() {
    if (!supported) return setSt({ s: "error", message: "Browser ini tidak mendukung GPS. Tulis lokasi di dalam laporan." });
    setSt({ s: "asking" });
    navigator.geolocation.getCurrentPosition(
      (p) => setSt({ s: "preview", geo: makeGeoPoint(p.coords.latitude, p.coords.longitude, p.coords.accuracy) }),
      (e) => setSt({ s: "error", message: messageFor(e) }),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  }

  if (value) {
    return (
      <div className="space-y-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-ok"><Icon name="ok" size={16} />Lokasi GPS dipakai</p>
        <GeoMap geo={value} />
        <Button type="button" variant="ghost" disabled={disabled} onClick={() => { onChange(null); setSt({ s: "idle" }); }}>Hapus lokasi</Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {st.s === "preview" ? (
        <>
          <GeoMap geo={st.geo} />
          <p className="text-sm text-muted">Pin merah di peta sudah sesuai tempat Anda?</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="primary" className="min-h-11" onClick={() => { onChange(st.geo); setSt({ s: "idle" }); }}>Ya, lokasi ini benar</Button>
            <Button type="button" className="min-h-11" onClick={locate}>Ambil ulang</Button>
            <Button type="button" variant="ghost" className="min-h-11" onClick={() => setSt({ s: "idle" })}>Batal</Button>
          </div>
        </>
      ) : (
        <Button type="button" className="min-h-12 w-full text-base" disabled={disabled || st.s === "asking"} onClick={locate}>
          <Icon name="pin" size={18} className="mr-2" />{st.s === "asking" ? "Menunggu izin dan sinyal GPS…" : "Gunakan lokasi saya"}
        </Button>
      )}
      {st.s === "error" && <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{st.message}</p>}
      <p className="text-xs text-subtle">Koordinat dikirim ke posko. Peta ditampilkan oleh Google Maps, yang menerima koordinat saat peta dimuat.</p>
    </div>
  );
}
