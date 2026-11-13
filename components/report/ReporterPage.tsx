import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useDataMode } from "@/components/DataModeProvider";
import { draftFromExtraction, draftToPayload } from "@/components/intake/draft";
import { Button, inputClass } from "@/components/ui/form";
import { Icon, type IconName } from "@/components/ui/icons";
import { analyzeReport } from "@/lib/ai-client";
import { MAX_ATTACHMENTS } from "@/lib/domain/insight";
import type { AiInsight, Attachment } from "@/lib/domain/types";
import { MediaError, processFile, type AiMedia } from "@/lib/media";
import { AiInsightPanel } from "./AiInsightPanel";
import { AttachmentGallery } from "./AttachmentGallery";
import { EmergencyActions } from "./EmergencyActions";

const MAX_LEN = 5000;

type Picked = { attachment: Attachment; ai: AiMedia[] };
type Done = { id: string; insight: AiInsight | null; aiNote: string | null; location: string | null };

function PickButton({ icon, label, accept, capture, disabled, onFiles }: {
  icon: IconName;
  label: string;
  accept: string;
  capture?: "environment";
  disabled: boolean;
  onFiles: (files: File[]) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={accept}
        capture={capture}
        multiple={!capture}
        hidden
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => ref.current?.click()}
        className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-navy-600 bg-white px-2 py-3 text-sm font-semibold text-ink hover:border-teal-accent hover:bg-navy-850 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Icon name={icon} size={26} className="text-teal-accent" />
        {label}
      </button>
    </>
  );
}

/** Halaman utama untuk pelapor: tulis, tambah foto/video/berkas, kirim. */
export function ReporterPage() {
  const { api } = useDataMode();
  const [text, setText] = useState("");
  const [location, setLocation] = useState("");
  const [picked, setPicked] = useState<Picked[]>([]);
  const [processing, setProcessing] = useState(false);
  const [phase, setPhase] = useState<null | "analyze" | "save">(null);
  const [error, setError] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const sending = useRef(false);

  const dirty = !done && (text.trim() !== "" || picked.length > 0);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const busy = phase !== null || processing;
  const tooShort = text.trim().length < 5;

  async function addFiles(files: File[]) {
    if (files.length === 0) return;
    setMediaError(null);
    const room = MAX_ATTACHMENTS - picked.length;
    if (room <= 0) return setMediaError(`Maksimal ${MAX_ATTACHMENTS} lampiran. Hapus satu dulu.`);
    setProcessing(true);
    const added: Picked[] = [];
    let problem: string | null = files.length > room ? `Hanya ${room} lampiran lagi yang muat; sisanya diabaikan.` : null;
    for (const file of files.slice(0, room)) {
      try {
        added.push(await processFile(file));
      } catch (err) {
        problem = err instanceof MediaError ? err.message : `“${file.name}” tidak dapat diproses.`;
      }
    }
    setPicked((p) => [...p, ...added]);
    setMediaError(problem);
    setProcessing(false);
  }

  async function submit() {
    if (sending.current || tooShort) return;
    sending.current = true;
    setError(null);
    const loc = location.trim();
    const fullText = loc ? `Lokasi: ${loc}. ${text.trim()}` : text.trim();
    setPhase("analyze");
    const ai = await analyzeReport(fullText, picked.flatMap((p) => p.ai));
    setPhase("save");
    const ex = await api.extract(fullText);
    if (!ex.ok) {
      setPhase(null);
      sending.current = false;
      return setError(ex.error.message);
    }
    const extras = { attachments: picked.map((p) => p.attachment), aiInsight: ai.ok ? ai.insight : null };
    const payload = draftToPayload(draftFromExtraction(ex.data.extraction));
    let res = await api.submitReport(fullText, payload, "save", ex.data.extraction, extras);
    // Hasil ekstraksi yang tidak lolos validasi tidak diperbaiki diam-diam: laporan tetap masuk dan operator mengisi sendiri.
    if (!res.ok && res.error.code === "invalid_input") {
      res = await api.submitReport(fullText, { ...payload, needs: [] }, "save", ex.data.extraction, extras);
    }
    setPhase(null);
    sending.current = false;
    if (!res.ok) {
      const e = res.error;
      if (e.code === "exact_duplicate") return setError("Laporan yang sama persis sudah kami terima. Tidak perlu dikirim lagi.");
      if (e.code === "storage_failed") return setError("Penyimpanan di perangkat ini penuh. Kurangi foto atau video, lalu coba lagi.");
      return setError(e.message);
    }
    setDone({
      id: res.data.report.id.slice(0, 8).toUpperCase(),
      insight: ai.ok ? ai.insight : null,
      aiNote: ai.ok ? null : ai.message,
      location: res.data.report.locationText,
    });
  }

  function again() {
    setText("");
    setLocation("");
    setPicked([]);
    setDone(null);
    setError(null);
    setMediaError(null);
  }

  if (done) {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <div role="status" className="rounded-lg border border-ok/40 bg-ok/10 p-5">
          <p className="flex items-center gap-2 text-xl font-bold text-ok"><Icon name="ok" size={24} />Laporan terkirim</p>
          <p className="mt-2 text-base text-ink">Tim posko akan memeriksa laporan Anda. Nomor laporan: <strong className="font-mono">{done.id}</strong></p>
        </div>
        {done.insight && done.insight.emergency.service !== "tidak_perlu" && (
          <div className="rounded-lg border border-danger/40 bg-danger/5 p-5">
            <p className="mb-1 text-base font-bold text-danger">Ada orang terluka atau api? Telepon sekarang.</p>
            <p className="mb-3 text-sm text-ink">{done.insight.emergency.reason}</p>
            <EmergencyActions service={done.insight.emergency.service} location={done.location} />
          </div>
        )}
        {done.insight ? (
          <section aria-labelledby="ai-done">
            <h2 id="ai-done" className="mb-2 text-base font-bold">Yang kami pahami dari laporan Anda</h2>
            <AiInsightPanel insight={done.insight} location={done.location} />
          </section>
        ) : (
          <p role="note" className="rounded-md border border-warn/40 bg-warn/5 px-4 py-3 text-sm text-ink">
            Ringkasan AI belum tersedia ({done.aiNote}). Laporan tetap tersimpan dan dibaca langsung oleh tim.
          </p>
        )}
        <Button variant="primary" className="min-h-12 w-full text-base" onClick={again}>Kirim laporan lain</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold sm:text-3xl">Lapor kejadian</h1>
      <p className="mt-1 text-base text-muted">Ceritakan apa yang terjadi dan apa yang dibutuhkan. Boleh memakai bahasa daerah.</p>

      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-danger/40 bg-danger/5 p-4">
        <p className="min-w-0 flex-1 text-sm text-ink"><strong>Darurat sekarang?</strong> Jangan menunggu laporan. Telepon langsung.</p>
        <a href="tel:112" className="inline-flex min-h-11 items-center gap-2 rounded-md bg-danger px-4 py-2 text-sm font-bold text-white hover:opacity-90">
          <Icon name="phone" size={18} />Telepon 112
        </a>
      </div>

      <form
        className="mt-6 space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div>
          <label htmlFor="report-text" className="mb-1.5 block text-base font-bold">1. Apa yang terjadi?</label>
          <textarea
            id="report-text"
            rows={6}
            maxLength={MAX_LEN}
            disabled={busy}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Contoh: Banjir di Desa Contoh Makmur. Kami butuh 20 dus air mineral."
            className={`${inputClass} resize-y text-base leading-relaxed`}
          />
          <p className="mt-1 text-xs text-subtle">
            {text.trim() && tooShort ? "Tulis minimal 5 karakter." : "Tulis jumlah dan nama barang bila ada."} <span className="font-mono">{text.length}/{MAX_LEN}</span>
          </p>
        </div>

        <div>
          <label htmlFor="report-loc" className="mb-1.5 block text-base font-bold">2. Di mana? <span className="font-normal text-muted">(boleh dikosongkan)</span></label>
          <input
            id="report-loc"
            value={location}
            maxLength={150}
            disabled={busy}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Contoh: Desa Contoh Makmur RT 02 RW 01"
            className={`${inputClass} text-base`}
          />
        </div>

        <div>
          <p className="mb-1.5 text-base font-bold">3. Tambah foto atau video <span className="font-normal text-muted">(boleh dilewati)</span></p>
          <div className="grid grid-cols-3 gap-3">
            <PickButton icon="camera" label="Ambil foto" accept="image/*" capture="environment" disabled={busy} onFiles={addFiles} />
            <PickButton icon="video" label="Rekam video" accept="video/*" capture="environment" disabled={busy} onFiles={addFiles} />
            <PickButton icon="clip" label="Pilih file" accept="image/*,video/*,application/pdf,text/plain" disabled={busy} onFiles={addFiles} />
          </div>
          {processing && <p role="status" className="mt-2 text-sm text-muted">Menyiapkan lampiran…</p>}
          {mediaError && <p role="alert" className="mt-2 text-sm text-danger">{mediaError}</p>}
          <div className="mt-3">
            <AttachmentGallery items={picked.map((p) => p.attachment)} onRemove={(id) => setPicked((p) => p.filter((x) => x.attachment.id !== id))} />
          </div>
        </div>

        {error && <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">{error}</p>}

        <div>
          <Button type="submit" variant="primary" disabled={busy || tooShort} className="min-h-14 w-full text-lg">
            {phase === "analyze" ? "Membaca laporan…" : phase === "save" ? "Mengirim…" : "Kirim laporan"}
          </Button>
          <p className="mt-2 text-center text-xs text-subtle">
            AI membantu merangkum dan menerjemahkan. Laporan diperiksa manusia sebelum dipakai. Ini prototipe — jangan kirim data pribadi korban.
          </p>
        </div>
      </form>

      <p className="mt-8 border-t border-navy-700 pt-4 text-center text-sm text-muted">
        Petugas posko? <Link to="/dashboard" className="font-semibold text-teal-accent underline underline-offset-2">Buka halaman tim</Link>
      </p>
    </div>
  );
}
