import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { GeoMap } from "@/components/ui/GeoMap";
import { Button, inputClass } from "@/components/ui/form";
import type { GeoPoint } from "@/lib/domain/geo";
import { ChatThread } from "./ChatThread";
import { StatusTracker, type StatusSource } from "./StatusTracker";

/** Kode laporan: 8 karakter heksadesimal. Dipakai juga di halaman pelapor. */
export function CodeLookupForm({ initial = "", label = "Kode laporan" }: { initial?: string; label?: string }) {
  const navigate = useNavigate();
  const [code, setCode] = useState(initial);
  const clean = code.trim().toUpperCase();
  const valid = /^[0-9A-F]{8}$/.test(clean);
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) navigate(`/status/${clean}`);
      }}
    >
      <div className="min-w-0 flex-1">
        <label htmlFor="status-code" className="mb-1.5 block text-sm font-semibold">{label}</label>
        <input
          id="status-code"
          value={code}
          maxLength={8}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setCode(e.target.value)}
          placeholder="8 huruf/angka"
          aria-invalid={code.trim() !== "" && !valid}
          className={`${inputClass} font-mono text-base uppercase tracking-widest`}
        />
      </div>
      <Button type="submit" variant="primary" className="min-h-11" disabled={!valid}>Lihat status</Button>
    </form>
  );
}

export function StatusPage() {
  const { code = "" } = useParams();
  const clean = code.toUpperCase();
  const [info, setInfo] = useState<{ source: StatusSource; geo: GeoPoint | null } | null>(null);
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-2xl font-bold">Status laporan</h1>
      <p className="font-mono text-lg font-bold tracking-widest">{clean}</p>
      <StatusTracker key={clean} code={clean} onLoaded={setInfo} />
      {info?.geo && (
        <section aria-label="Lokasi laporan">
          <h2 className="mb-1.5 text-base font-bold">Lokasi yang Anda kirim</h2>
          <GeoMap geo={info.geo} height={180} />
        </section>
      )}
      {info?.source === "server" && <ChatThread key={clean} code={clean} as="reporter" />}
      <details className="rounded-lg border border-navy-700 bg-white">
        <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-semibold">Cek kode lain</summary>
        <div className="p-4 pt-0"><CodeLookupForm /></div>
      </details>
      <Link to="/" className="inline-block font-semibold text-teal-accent underline underline-offset-2">← Halaman pelapor</Link>
    </div>
  );
}
