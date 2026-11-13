import { Link, useParams } from "react-router-dom";
import { StatusTracker } from "./StatusTracker";

export function StatusPage() {
  const { code = "" } = useParams();
  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold">Status laporan</h1>
      <p className="font-mono text-lg font-bold">{code.toUpperCase()}</p>
      <StatusTracker code={code} />
      <p className="text-xs text-subtle">Prototipe: status hanya terlihat di perangkat ini.</p>
      <Link to="/" className="font-semibold text-teal-accent underline underline-offset-2">← Halaman pelapor</Link>
    </div>
  );
}
