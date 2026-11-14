import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useDataMode, useFlushUnsynced } from "@/components/DataModeProvider";
import { formatCoords, type GeoPoint } from "@/lib/domain/geo";
import { isUnsynced } from "@/lib/remote";
import { LocationPicker } from "./LocationPicker";
import { CodeLookupForm } from "./StatusPage";
import { draftFromExtraction, draftToPayload } from "@/components/intake/draft";
import { Button, inputClass } from "@/components/ui/form";
import { Icon, type IconName } from "@/components/ui/icons";
import { analyzeReport } from "@/lib/ai-client";
import { MAX_ATTACHMENTS } from "@/lib/domain/insight";
import { detectDanger, servicesFor, type EmergencyService } from "@/lib/domain/danger";
import type { AiInsight, Attachment } from "@/lib/domain/types";
import { sendDemo, useDemoMessages } from "@/lib/demo-channel";
import { makeSimulatedPhoto } from "@/lib/demo-photo";
import { MediaError, processFile, type AiMedia } from "@/lib/media";
import { AiInsightPanel } from "./AiInsightPanel";
import { AttachmentGallery } from "./AttachmentGallery";
import { StatusTracker } from "./StatusTracker";
import { EmergencyActions } from "./EmergencyActions";

const MAX_LEN = 5000;

type Picked = { attachment: Attachment; ai: AiMedia[] };
type Done = { id: string; fullId: string; insight: AiInsight | null; aiNote: string | null; location: string | null; emergency: EmergencyService | null };

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
  // `location` (teks) hanya diisi skenario /demo; pelapor memakai GPS.
  const [location, setLocation] = useState("");
  const [geo, setGeo] = useState<GeoPoint | null>(null);
  const [picked, setPicked] = useState<Picked[]>([]);
  const [processing, setProcessing] = useState(false);
  const [phase, setPhase] = useState<null | "analyze" | "save">(null);
  const [error, setError] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const sending = useRef(false);
  useFlushUnsynced();

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

  async function submit(override?: { text: string; location: string; picked: Picked[] }) {
    const t = override?.text ?? text;
    if (sending.current || t.trim().length < 5) return;
    sending.current = true;
    setError(null);
    const loc = (override?.location ?? location).trim();
    const files = override?.picked ?? picked;
    const fullText = loc ? `Lokasi: ${loc}. ${t.trim()}` : t.trim();
    setPhase("analyze");
    const ai = await analyzeReport(fullText, files.flatMap((p) => p.ai));
    setPhase("save");
    const ex = await api.extract(fullText);
    if (!ex.ok) {
      setPhase(null);
      sending.current = false;
      if (override) sendDemo({ type: "reporter-error", message: ex.error.message });
      return setError(ex.error.message);
    }
    const extras = { attachments: files.map((p) => p.attachment), aiInsight: ai.ok ? ai.insight : null, geo };
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
      if (override) sendDemo({ type: "reporter-error", message: e.message });
      if (e.code === "exact_duplicate") return setError("Laporan yang sama persis sudah kami terima. Tidak perlu dikirim lagi.");
      if (e.code === "storage_failed") return setError("Penyimpanan di perangkat ini penuh. Kurangi foto atau video, lalu coba lagi.");
      return setError(e.message);
    }
    setCopied(false);
    if (override) sendDemo({ type: "reporter-done", code: res.data.report.id.slice(0, 8).toUpperCase(), aiOk: ai.ok, aiNote: ai.ok ? null : ai.message });
    setDone({
      fullId: res.data.report.id,
      id: res.data.report.id.slice(0, 8).toUpperCase(),
      insight: ai.ok ? ai.insight : null,
      aiNote: ai.ok ? null : ai.message,
      location: res.data.report.locationText ?? (geo ? formatCoords(geo) : null),
      emergency: servicesFor(detectDanger(fullText)),
    });
  }

  // Hanya aktif di bingkai /demo (?demo=1): mengetik teks contoh, melampirkan foto simulasi, lalu menekan kirim.
  useDemoMessages((m) => {
    if (m.type !== "reporter-run") return;
    void (async () => {
      setText("");
      setLocation("");
      setLocation(m.location);
      for (let i = 0; i <= m.text.length; i += 4) {
        setText(m.text.slice(0, i));
        await new Promise((r) => setTimeout(r, 16));
      }
      setText(m.text);
      const photo = makeSimulatedPhoto();
      setPicked([photo]);
      await new Promise((r) => setTimeout(r, 900));
      await submit({ text: m.text, location: m.location, picked: [photo] });
    })();
  });

  function again() {
    setText("");
    setLocation("");
    setGeo(null);
    setPicked([]);
    setDone(null);
    setError(null);
    setMediaError(null);
  }

  if (done) {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="rounded-lg border border-ok/40 bg-ok/10 p-5 text-center">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" aria-hidden className="pop-in mx-auto text-ok"><circle cx="12" cy="12" r="10.5" stroke="currentColor" strokeWidth="1.5" /><path d="M7 12.5l3.5 3.5L17 9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="check-draw" /></svg>
          <h1 className="mt-2 text-2xl font-bold text-ok">Laporan diterima</h1>
          <p className="mt-1 text-base text-ink">Posko sedang memeriksa laporan Anda. Anda tidak sendirian.</p>
          <p className="mt-3 text-sm text-muted">Kode laporan</p>
          <p className="flex items-center justify-center gap-2">
            <strong className="font-mono text-2xl tracking-widest">{done.id}</strong>
            <button type="button" onClick={() => void navigator.clipboard?.writeText(done.id).then(() => setCopied(true), () => undefined)} className="min-h-11 rounded-md border border-navy-600 bg-white px-3 text-sm font-semibold">{copied ? "Tersalin" : "Salin"}</button>
          </p>
          <div className="mt-4 text-left"><StatusTracker code={done.id} /></div>
          <p className="mt-3 text-sm text-ink">Simpan kode ini. Dengan kode ini Anda bisa melihat status dan berkirim pesan dengan tim dari perangkat mana pun.</p>
          <Link to={`/status/${done.id}`} className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-md bg-teal-accent px-4 text-base font-bold text-navy-950"><Icon name="chat" size={18} />Lihat status dan chat</Link>
          {isUnsynced(done.fullId) && <p role="note" className="mt-3 rounded-md border border-warn/40 bg-warn/5 px-3 py-2 text-left text-sm text-ink">Laporan tersimpan di perangkat ini tetapi belum sampai ke posko. Dikirim ulang otomatis saat tersambung; atau buka halaman status lalu tekan “Kirim ulang”.</p>}
        </div>
        {done.emergency && (
          <div className="rounded-lg border border-danger/40 bg-danger/5 p-5">
            <p className="mb-1 text-base font-bold text-danger">Ada orang terluka atau api? Telepon sekarang.</p>
            <p className="mb-3 text-sm text-ink">Laporan Anda menyebut kata bahaya. Nomor ini nasional, tersambung ke layanan setempat.</p>
            <EmergencyActions service={done.emergency} location={done.location} />
          </div>
        )}
        {done.insight ? (
          <details className="rounded-lg border border-navy-700 bg-white">
            <summary className="min-h-11 cursor-pointer px-4 py-3 text-base font-bold">Lihat ringkasan</summary>
            <div className="p-4 pt-0"><AiInsightPanel insight={done.insight} /></div>
          </details>
        ) : (
          <p role="note" className="rounded-md border border-warn/40 bg-warn/5 px-4 py-3 text-sm text-ink">
            Ringkasan AI belum tersedia ({done.aiNote}). Laporan tetap tersimpan dan dibaca langsung oleh tim.
          </p>
        )}
        <a href="tel:112" className="flex min-h-12 items-center justify-center gap-2 rounded-md bg-danger px-4 text-base font-bold text-white"><Icon name="phone" size={18} />Telepon 112 (darurat)</a>
        <Button className="min-h-12 w-full text-base" onClick={again}>Kirim laporan lain</Button>
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
          <p className="mb-1.5 text-base font-bold">2. Di mana? <span className="font-normal text-muted">(boleh dilewati)</span></p>
          <LocationPicker value={geo} onChange={setGeo} disabled={busy} />
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
            {busy && <span aria-hidden className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}{phase === "analyze" ? "Membaca laporan…" : phase === "save" ? "Mengirim…" : "Kirim laporan"}
          </Button>
          <p className="mt-2 text-center text-xs text-subtle">
            AI membantu merangkum dan menerjemahkan. Laporan diperiksa manusia sebelum dipakai. Ini prototipe — jangan kirim data pribadi korban.
          </p>
        </div>
      </form>

      <section aria-label="Cek status laporan" className="mt-8 rounded-lg border border-navy-700 bg-white p-4">
        <h2 className="mb-2 text-base font-bold">Sudah melapor? Cek status</h2>
        <CodeLookupForm label="Masukkan kode laporan" />
      </section>

      <p className="mt-8 border-t border-navy-700 pt-4 text-center text-sm text-muted">
        Petugas posko? <Link to="/dashboard" className="font-semibold text-teal-accent underline underline-offset-2">Buka halaman tim</Link>
      </p>
    </div>
  );
}
