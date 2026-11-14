import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getLocalBackend } from "@/components/DataModeProvider";
import { Icon } from "@/components/ui/icons";
import { reportCode } from "@/lib/domain/follow-up";
import { sendDemo, useDemoMessages, type DemoMsg } from "@/lib/demo-channel";
import { DEMO_ARRANGE_NOTE, DEMO_REPORT_LOCATION, DEMO_REPORT_TEXT, DEMO_STEPS, type DemoStepKey } from "./scenario";

type StepState = "idle" | "active" | "done" | "failed";
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * /demo — alat bantu presentasi (BUKAN fitur produk).
 * Kiri: halaman pelapor asli dalam bingkai HP. Kanan: halaman operator asli.
 * Tombol "Mulai skenario" hanya menekan tombol yang sama dengan yang ditekan manusia (lewat BroadcastChannel);
 * data dan logika tetap melalui service layer yang sama dengan aplikasi. Semua data fiktif.
 */
export function DemoPage() {
  const [steps, setSteps] = useState<Record<DemoStepKey, StepState>>(() => Object.fromEntries(DEMO_STEPS.map((s) => [s.key, "idle"])) as Record<DemoStepKey, StepState>);
  const [running, setRunning] = useState(false);
  const [manual, setManual] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [phoneKey, setPhoneKey] = useState(0);
  const [opSrc, setOpSrc] = useState("/dashboard?demo=1");
  const runId = useRef(0);
  const manualRef = useRef(false);
  const nextGate = useRef<(() => void) | null>(null);
  const waiters = useRef<Array<{ type: DemoMsg["type"]; resolve: (m: DemoMsg) => void; reject: (e: Error) => void }>>([]);
  manualRef.current = manual;

  useDemoMessages((m) => {
    waiters.current = waiters.current.filter((w) => {
      if (m.type === "reporter-error" || m.type === "operator-error") {
        w.reject(new Error(m.message));
        return false;
      }
      if (w.type === m.type) {
        w.resolve(m);
        return false;
      }
      return true;
    });
  }, true);

  const waitFor = useCallback(
    <T extends DemoMsg["type"]>(type: T, timeoutMs: number, label: string) =>
      new Promise<Extract<DemoMsg, { type: T }>>((resolve, reject) => {
        const timer = setTimeout(() => {
          waiters.current = waiters.current.filter((w) => w.resolve !== wrapped);
          reject(new Error(`Tidak ada respons dari bingkai (${label}) dalam ${Math.round(timeoutMs / 1000)} detik.`));
        }, timeoutMs);
        const wrapped = (m: DemoMsg) => { clearTimeout(timer); resolve(m as Extract<DemoMsg, { type: T }>); };
        waiters.current.push({ type, resolve: wrapped, reject: (e) => { clearTimeout(timer); reject(e); } });
      }),
    [],
  );

  /** Jeda singkat; pada mode manual menunggu tombol "Langkah berikutnya". */
  const gate = (ms: number) =>
    manualRef.current ? new Promise<void>((r) => { nextGate.current = r; }) : wait(ms);

  const set = (key: DemoStepKey, st: StepState) => setSteps((s) => ({ ...s, [key]: st }));

  async function start() {
    const id = ++runId.current;
    const alive = () => runId.current === id;
    setRunning(true);
    setFinished(false);
    setError(null);
    setAiNote(null);
    setSteps(Object.fromEntries(DEMO_STEPS.map((s) => [s.key, "idle"])) as Record<DemoStepKey, StepState>);
    let current: DemoStepKey = "reset";
    const step = async (key: DemoStepKey, fn: () => Promise<void>) => {
      if (!alive()) throw new Error("dihentikan");
      current = key;
      set(key, "active");
      await fn();
      if (!alive()) throw new Error("dihentikan");
      set(key, "done");
    };
    try {
      await step("reset", async () => {
        getLocalBackend().reset(); // data simulasi awal; juga memberi tahu bingkai lain lewat BroadcastChannel
        setOpSrc("/dashboard?demo=1");
        setPhoneKey((k) => k + 1);
        await wait(1800);
      });
      let code = "";
      await step("send", async () => {
        const done = waitFor("reporter-done", 70_000, "layar pelapor");
        sendDemo({ type: "reporter-run", text: DEMO_REPORT_TEXT, location: DEMO_REPORT_LOCATION });
        const m = await done;
        code = m.code;
        if (!m.aiOk) setAiNote(m.aiNote);
        await gate(1500);
      });
      await step("queue", async () => {
        setOpSrc("/intake?demo=1");
        await gate(3000);
      });
      let reportId = "";
      await step("evidence", async () => {
        const q = await getLocalBackend().reviewQueue();
        const found = q.ok ? q.data.reports.find((r) => reportCode(r.id) === code) : undefined;
        if (!found) throw new Error("Laporan baru tidak ditemukan di antrean operator.");
        reportId = found.id;
        const loaded = waitFor("operator-loaded", 15_000, "layar operator");
        setOpSrc(`/intake?report=${found.id}&demo=1`);
        await loaded;
        await gate(7000); // waktu bagi penonton melihat sorotan bukti berpindah
      });
      await step("verify", async () => {
        const v = waitFor("operator-verified", 15_000, "layar operator");
        sendDemo({ type: "operator-verify" });
        await v;
        await gate(3000);
      });
      await step("arrange", async () => {
        const a = waitFor("operator-arranged", 15_000, "layar operator");
        sendDemo({ type: "operator-arrange", note: DEMO_ARRANGE_NOTE });
        await a;
        await gate(1500);
      });
      await step("status", async () => {
        if (!reportId) throw new Error("Laporan tidak diketahui.");
        await wait(1500);
      });
      setFinished(true);
    } catch (e) {
      if (!alive()) return;
      const msg = e instanceof Error ? e.message : "Terjadi kesalahan.";
      setError(msg);
      set(current, "failed");
    } finally {
      if (alive()) setRunning(false);
    }
  }

  function stop() {
    runId.current += 1;
    waiters.current = [];
    nextGate.current?.();
    setRunning(false);
  }

  useEffect(() => () => { runId.current += 1; }, []);

  return (
    <div className="mx-auto flex min-h-screen max-w-[1500px] flex-col gap-3 px-3 py-3 sm:px-5">
      <header className="rounded-lg border border-navy-700 bg-white p-3 sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold tracking-wide text-warn">ALAT PRESENTASI · DATA FIKTIF SEMUA</p>
            <h1 className="text-xl font-bold sm:text-2xl">Demo: satu lingkaran utuh</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" checked={manual} disabled={running} onChange={(e) => setManual(e.target.checked)} className="h-4 w-4" />
              Jeda tiap langkah
            </label>
            {running && manual && (
              <button type="button" onClick={() => nextGate.current?.()} className="min-h-11 rounded-md border border-navy-600 px-4 text-sm font-semibold hover:bg-navy-800">
                Langkah berikutnya
              </button>
            )}
            {running ? (
              <button type="button" onClick={stop} className="min-h-11 rounded-md border border-danger/50 px-4 text-sm font-semibold text-danger hover:bg-danger/10">Hentikan</button>
            ) : (
              <button type="button" onClick={() => void start()} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-teal-accent px-5 text-sm font-semibold text-white hover:bg-teal-strong">
                <Icon name="plus" size={16} />{finished || error ? "Ulangi skenario" : "Mulai skenario"}
              </button>
            )}
            <Link to="/" className="min-h-11 content-center rounded-md px-3 text-sm font-semibold text-teal-accent underline underline-offset-2">Keluar dari demo</Link>
          </div>
        </div>
        <ol aria-label="Langkah skenario" className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm sm:grid-cols-4 lg:grid-cols-7">
          {DEMO_STEPS.map((s, i) => {
            const st = steps[s.key];
            return (
              <li key={s.key} aria-current={st === "active" ? "step" : undefined} className={`flex items-start gap-1.5 ${st === "idle" ? "text-subtle" : st === "failed" ? "text-danger" : st === "done" ? "text-ok" : "font-semibold text-ink"}`}>
                <span className="mt-0.5 shrink-0">
                  {st === "done" ? <Icon name="ok" size={14} /> : st === "failed" ? <Icon name="critical" size={14} /> : <span className="inline-block w-3.5 text-center font-mono text-xs">{i + 1}</span>}
                </span>
                <span>{s.label}<span className="sr-only"> — {st === "done" ? "selesai" : st === "active" ? "sedang berjalan" : st === "failed" ? "gagal" : "belum"}</span></span>
              </li>
            );
          })}
        </ol>
        <div aria-live="polite" className="mt-2 space-y-1 text-sm">
          {error && <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 font-semibold text-danger">Skenario berhenti: {error} Tekan “Ulangi skenario”.</p>}
          {aiNote && <p className="rounded-md border border-warn/40 bg-warn/5 px-3 py-2">Ringkasan AI tidak tersedia ({aiNote}). Sesuai desain: laporan tetap masuk dan seluruh lingkaran berjalan tanpa AI.</p>}
          {finished && <p className="rounded-md border border-ok/40 bg-ok/10 px-3 py-2 font-semibold text-ok">Lingkaran selesai: kirim → antrean → verifikasi → bantuan diatur → status pelapor berubah.</p>}
        </div>
        <p className="mt-2 text-xs text-subtle">
          Kedua layar adalah halaman aplikasi yang sebenarnya, bukan tiruan. Tombol skenario hanya mengetik dan menekan tombol yang sama dengan yang ditekan manusia; tidak ada hasil yang dipalsukan. Sinkron lewat BroadcastChannel; data di localStorage browser ini.
        </p>
      </header>

      <div className="grid flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <section aria-label="Layar pelapor" className="flex flex-col items-center">
          <h2 className="mb-1.5 text-sm font-bold">Pelapor (HP) <span className="font-normal text-muted">· data simulasi</span></h2>
          <div className="w-full max-w-[400px] rounded-[2.2rem] border-[10px] border-ink bg-ink p-0 shadow-lg">
            <div className="mx-auto mb-1 h-1.5 w-20 rounded-full bg-navy-600" aria-hidden />
            <iframe key={phoneKey} title="Halaman pelapor (HP, simulasi)" src="/?demo=1" className="block h-[640px] w-full rounded-[1.4rem] bg-white sm:h-[720px] lg:h-[calc(100vh-14rem)] lg:min-h-[560px]" />
          </div>
        </section>
        <section aria-label="Layar operator" className="flex min-w-0 flex-col">
          <h2 className="mb-1.5 text-sm font-bold">Operator posko <span className="font-normal text-muted">· data simulasi</span></h2>
          <div className="overflow-hidden rounded-lg border-2 border-navy-600 bg-white">
            <iframe title="Dashboard operator (simulasi)" src={opSrc} className="block h-[640px] w-full sm:h-[720px] lg:h-[calc(100vh-12.5rem)] lg:min-h-[560px]" />
          </div>
        </section>
      </div>
    </div>
  );
}
