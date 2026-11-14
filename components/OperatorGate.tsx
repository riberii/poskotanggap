import { useCallback, useEffect, useState } from "react";
import { Button, Field, inputClass } from "@/components/ui/form";
import { UNAUTHORIZED_EVENT } from "@/lib/remote";
import { authHeaders, setOperatorToken } from "@/lib/operator-token";

type State = "checking" | "open" | "locked" | "unreachable";

/**
 * Gerbang halaman tim. Memeriksa sesi lewat GET /api/auth; setiap jawaban 401 dari API tim
 * (event UNAUTHORIZED_EVENT) mengembalikan layar kode, bukan layar kosong.
 * Pelapor (/ dan /status/:code) tidak melewati gerbang ini.
 */
export function OperatorGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>("checking");
  const [configured, setConfigured] = useState(true);
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    try {
      const res = await fetch("/api/auth", { cache: "no-store", headers: authHeaders() });
      if (!(res.headers.get("content-type") ?? "").includes("json")) return setState("unreachable");
      const b = (await res.json()) as { authenticated?: boolean; configured?: boolean };
      setConfigured(b.configured !== false);
      setState(b.authenticated ? "open" : "locked");
    } catch {
      setState("unreachable");
    }
  }, []);

  useEffect(() => {
    void check();
    const lock = () => {
      setOperatorToken(null);
      setState("locked");
    };
    window.addEventListener(UNAUTHORIZED_EVENT, lock);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, lock);
  }, [check]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ passcode }) });
      const b = (await res.json().catch(() => null)) as { token?: string; error?: { message?: string } } | null;
      if (res.ok) {
        setOperatorToken(b?.token ?? null);
        setPasscode("");
        setState("open");
      } else setError(b?.error?.message ?? "Gagal masuk. Coba lagi.");
    } catch {
      setError("Tidak ada koneksi ke server.");
    } finally {
      setBusy(false);
    }
  }

  if (state === "open") return <>{children}</>;
  if (state === "checking") return <p role="status" className="py-16 text-center text-sm text-muted">Memeriksa sesi…</p>;
  if (state === "unreachable") {
    return (
      <div role="alert" className="mx-auto my-12 max-w-md rounded-md border border-warn/40 bg-white p-5 text-sm">
        <p className="font-semibold text-ink">Server belum terjangkau</p>
        <p className="mt-1 text-muted">Halaman tim butuh server untuk memeriksa kode operator.</p>
        <Button className="mt-3" onClick={() => void check()}>Coba lagi</Button>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="mx-auto my-10 max-w-sm space-y-4 rounded-md border border-navy-700 bg-white p-5 shadow-sm">
      <h1 className="text-xl font-bold">Khusus tim posko</h1>
      <p className="text-sm text-muted">Masukkan kode operator untuk membuka halaman tim.</p>
      <p className="rounded border border-warn/40 bg-warn/5 px-2.5 py-2 text-xs text-ink">Ini kode demo untuk juri, bukan akun nyata. Kode tercantum di README bagian “Akun demonstrasi”.</p>
      {!configured && <p role="alert" className="text-xs text-danger">Kode operator belum diatur di server, sehingga halaman tim tertutup.</p>}
      <Field label="Kode operator" htmlFor="passcode" error={error ?? undefined}>
        <input id="passcode" type="password" autoComplete="current-password" required value={passcode} onChange={(e) => setPasscode(e.target.value)} className={inputClass} />
      </Field>
      <Button type="submit" variant="primary" disabled={busy || passcode.length === 0} className="w-full">
        {busy ? "Memeriksa…" : "Masuk"}
      </Button>
    </form>
  );
}
