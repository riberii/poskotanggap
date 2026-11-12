"use client";

import { Link, useBlocker, useLocation, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiError } from "@/lib/api-client";
import { useDataMode } from "@/components/DataModeProvider";
import {
  INCIDENT_LABELS,
  INCIDENT_TYPES,
  type ExtractionResult,
  type IncidentType,
  type Report,
} from "@/lib/domain/types";
import { formatDateTime } from "@/lib/format";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Button, Evidence, Field, inputClass } from "@/components/ui/form";
import { Panel } from "@/components/ui/Panel";
import { draftClientErrors, draftFromExtraction, draftFromReport, draftToPayload, type Draft } from "./draft";
import { NeedsEditor } from "./NeedsEditor";
import { ReviewQueue } from "./ReviewQueue";
import { SAMPLE_REPORTS } from "./samples";

type Message = {
  tone: "ok" | "warn" | "danger";
  text: string;
  link?: { href: string; label: string };
  retry?: boolean;
};

const MAX_LEN = 5000;

export function IntakeWorkspace({ initialReportId }: { initialReportId: string | null }) {
  const { api, extractAi } = useDataMode();
  const navigate = useNavigate();
  const location = useLocation();
  const [rawText, setRawText] = useState("");
  const [existing, setExisting] = useState<Report | null>(null);
  const [duplicateOfReport, setDuplicateOfReport] = useState<Report | null>(null);
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [duplicateReviewed, setDuplicateReviewed] = useState(false);
  const [duplicatePromptId, setDuplicatePromptId] = useState<string | null>(null);
  const [confirmReject, setConfirmReject] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<null | "analyze-ai" | "analyze-rules" | "save" | "verify" | "reject" | "load">(null);
  const [message, setMessage] = useState<Message | null>(() => (location.state as { message?: Message } | null)?.message ?? null);
  const [queue, setQueue] = useState<Report[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [retryKind, setRetryKind] = useState<"ai" | "rules">("rules");
  const initialDraft = useRef<string | null>(null);
  const allowNavigation = useRef(false);
  const draftChanged = draft !== null && JSON.stringify(draft) !== initialDraft.current;
  const hasUnsavedChanges = draftChanged || (!existing && !!rawText.trim());
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    !allowNavigation.current && hasUnsavedChanges &&
    (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search),
  );

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (window.confirm("Perubahan laporan belum disimpan. Tinggalkan halaman ini?")) blocker.proceed();
    else blocker.reset();
  }, [blocker]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", warnBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if ((location.state as { message?: Message } | null)?.message) {
      navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    }
  }, [location.pathname, location.search, location.state, navigate]);

  const refreshQueue = useCallback(async () => {
    setQueueLoading(true);
    const res = await api.reviewQueue();
    setQueueLoading(false);
    if (res.ok) {
      setQueue(res.data.reports);
      setQueueError(null);
    } else setQueueError(res.error.message);
  }, [api]);

  const resetForm = () => {
    if (initialReportId) {
      allowNavigation.current = true;
      navigate("/intake", { replace: true });
    }
    setRawText("");
    setExisting(null);
    setDuplicateOfReport(null);
    setExtraction(null);
    setDraft(null);
    initialDraft.current = null;
    setDuplicateReviewed(false);
    setDuplicatePromptId(null);
    setConfirmReject(false);
    setErrors({});
  };

  /**
   * Mengubah teks laporan baru setelah ekstraksi membuat draf lama tidak lagi sesuai teks.
   * Draf dibuang agar field/kutipan hasil ekstraksi teks lama tidak melekat pada teks baru.
   */
  function changeRawText(text: string) {
    if (text !== rawText && draftChanged && !window.confirm("Mengubah teks akan menghapus perubahan pada draf. Lanjutkan?")) return;
    setRawText(text);
    if (!existing && (draft || extraction)) {
      setDraft(null);
      initialDraft.current = null;
      setExtraction(null);
      setDuplicatePromptId(null);
      setDuplicateReviewed(false);
      setDuplicateOfReport(null);
      setErrors({});
      setMessage({ tone: "warn", text: "Teks berubah. Analisis kembali atau isi secara manual." });
    }
  }

  const loadReport = useCallback(async (id: string) => {
    setBusy("load");
    setMessage(null);
    setExisting(null);
    setDraft(null);
    setExtraction(null);
    setRawText("");
    setDuplicateOfReport(null);
    setDuplicatePromptId(null);
    const res = await api.getReport(id);
    setBusy(null);
    if (!res.ok) {
      setMessage({ tone: "danger", text: res.error.message });
      return;
    }
    const { report, duplicateOfReport } = res.data;
    setExisting(report);
    setDuplicateOfReport(duplicateOfReport);
    setRawText(report.rawText);
    setExtraction(report.extraction);
    const loadedDraft = draftFromReport(report);
    initialDraft.current = JSON.stringify(loadedDraft);
    setDraft(loadedDraft);
    setDuplicateReviewed(false);
    setDuplicatePromptId(report.duplicateOf);
    setConfirmReject(false);
    setErrors({});
  }, [api]);

  useEffect(() => {
    refreshQueue();
    if (initialReportId) loadReport(initialReportId);
  }, [initialReportId, loadReport, refreshQueue]);

  useEffect(() => {
    if (!duplicatePromptId) return;
    let cancelled = false;
    api.getReport(duplicatePromptId).then((result) => {
      if (!cancelled && result.ok) setDuplicateOfReport(result.data.report);
    });
    return () => { cancelled = true; };
  }, [api, duplicatePromptId]);

  async function analyze(kind: "ai" | "rules" = extractAi ? "ai" : "rules") {
    if (draftChanged && !window.confirm("Analisis ulang akan mengganti perubahan pada draf. Lanjutkan?")) return;
    const useAi = kind === "ai" && extractAi !== null;
    setRetryKind(useAi ? "ai" : "rules");
    setBusy(useAi ? "analyze-ai" : "analyze-rules");
    setMessage(null);
    setErrors({});
    const res = useAi ? await extractAi(rawText) : await api.extract(rawText);
    setBusy(null);
    if (!res.ok) {
      // Tidak ada draf pengganti: kegagalan ekstraksi tidak pernah ditutupi dengan data tiruan.
      const retryable =
        res.error.status === 0 ||
        (res.error.details as { retryable?: boolean } | null)?.retryable === true;
      setMessage({
        tone: "danger",
        text: `${useAi ? "Analisis AI" : "Analisis"} gagal: ${res.error.message}`,
        retry: retryable,
      });
      return;
    }
    setExisting(null);
    setDuplicateOfReport(null);
    setDuplicatePromptId(null);
    setDuplicateReviewed(false);
    setExtraction(res.data.extraction);
    const extractedDraft = draftFromExtraction(res.data.extraction);
    initialDraft.current = JSON.stringify(extractedDraft);
    setDraft(extractedDraft);
  }

  /** Draf kosong tanpa AI — operator mengisi sendiri dari teks asli. */
  function startManual() {
    if (draftChanged && !window.confirm("Mengisi manual akan mengganti perubahan pada draf. Lanjutkan?")) return;
    setMessage(null);
    setErrors({});
    setExisting(null);
    setDuplicateOfReport(null);
    setDuplicatePromptId(null);
    setDuplicateReviewed(false);
    setExtraction(null);
    const emptyDraft: Draft = { incidentType: "", locationText: "", needs: [] };
    initialDraft.current = JSON.stringify(emptyDraft);
    setDraft(emptyDraft);
  }

  function handleError(err: ApiError) {
    if (err.code === "exact_duplicate") {
      const existingId = (err.details as { existingId?: string } | null)?.existingId;
      setMessage({
        tone: "warn",
        text: "Laporan identik sudah tercatat. Laporan ini tidak disimpan agar tidak dihitung dua kali.",
        link: existingId ? { href: `/intake?report=${existingId}`, label: "Buka laporan yang sudah ada" } : undefined,
      });
      return;
    }
    if (err.code === "duplicate_review_required") {
      const dupId = (err.details as { duplicateOf?: string } | null)?.duplicateOf ?? null;
      setDuplicatePromptId(dupId);
      setMessage({ tone: "warn", text: err.message });
      return;
    }
    if (err.code === "invalid_input" && Array.isArray(err.details)) {
      const map: Record<string, string> = {};
      for (const d of err.details as Array<{ path: string; message: string }>) map[d.path] = d.message;
      setErrors(map);
    }
    if (err.code === "verification_incomplete" && Array.isArray(err.details)) {
      const map: Record<string, string> = {};
      for (const f of err.details as string[]) map[f] = "Wajib diisi untuk verifikasi";
      setErrors(map);
    }
    setMessage({ tone: "danger", text: err.message });
  }

  async function act(action: "save" | "verify" | "reject") {
    if (!draft) return;
    const clientErrors = action === "reject" && existing ? {} : draftClientErrors(draft);
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length > 0) {
      setMessage({ tone: "danger", text: "Periksa kembali field yang ditandai." });
      return;
    }
    setBusy(action);
    setMessage(null);
    const payload = { ...draftToPayload(action === "reject" && existing ? draftFromReport(existing) : draft), duplicateReviewed };
    const res = existing
      ? await api.reviewReport(existing.id, payload, action)
      : await api.submitReport(rawText, payload, action as "save" | "verify", extraction);
    setBusy(null);
    if (!res.ok) return handleError(res.error);

    const r = res.data.report;
    const text =
      r.status === "verified"
        ? "Laporan terverifikasi. Hanya kebutuhan tambahan yang terverifikasi masuk ke rekap dashboard."
        : r.status === "rejected"
          ? "Laporan ditandai ditolak. Data tidak dihapus dan tidak dihitung."
          : r.duplicateOf
            ? "Laporan disimpan untuk review. Ditandai sebagai potensi duplikat."
            : "Laporan disimpan dan menunggu review.";
    const successMessage: Message = { tone: r.status === "rejected" ? "warn" : "ok", text, link: { href: "/dashboard", label: "Lihat dashboard" } };
    if (initialReportId) {
      allowNavigation.current = true;
      navigate("/intake", { replace: true, state: { message: successMessage } });
    } else {
      resetForm();
      setMessage(successMessage);
      refreshQueue();
    }
  }

  const setField = (patch: Partial<Draft>) => {
    if (!draft) return;
    if ((patch.incidentType !== undefined && patch.incidentType !== draft.incidentType) ||
        (patch.locationText !== undefined && patch.locationText !== draft.locationText)) {
      setDuplicateReviewed(false);
      setDuplicatePromptId(null);
      setDuplicateOfReport(null);
    }
    setDraft({ ...draft, ...patch });
  };
  const editedFromExtraction = (field: "incidentType" | "locationText") =>
    extraction && draft ? (extraction[field] ?? "") !== draft[field] : false;
  const disabled = busy !== null || existing?.status === "rejected";

  return (
    <>
    <ol aria-label="Alur laporan" className="mb-5 grid grid-cols-3 gap-2">
      {[
        { title: "Masukkan", detail: "Tempel laporan" },
        { title: "Periksa", detail: "Koreksi draf" },
        { title: "Verifikasi", detail: "Masuk rekap" },
      ].map((step, index) => (
        <li key={step.title} aria-current={(draft ? 1 : 0) === index ? "step" : undefined} className={`rounded-xl border px-3 py-3 ${((draft ? 1 : 0) === index) ? "border-teal-accent/40 bg-teal-accent/10" : "border-white/10 bg-navy-950/30"}`}>
          <span className="text-xs font-semibold text-ink"><span className="mr-2 text-teal-accent">0{index + 1}</span>{step.title}</span>
          <span className="mt-1 hidden text-xs text-muted sm:block">{step.detail}</span>
        </li>
      ))}
    </ol>
    <div className="grid gap-6 lg:grid-cols-12">
      <div className="min-w-0 space-y-6 lg:col-span-5">
        <Panel
          id="input"
          title={existing ? "Teks laporan tersimpan" : "01  ·  Masukkan laporan"}
          description={
            existing
              ? "Teks asli tidak dapat diubah."
              : "Tempel pesan atau pilih contoh untuk mencoba."
          }
          actions={
            existing ? (
              <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => {
                if (!draftChanged || window.confirm("Perubahan draf belum disimpan. Mulai laporan baru?")) resetForm();
              }}>
                Laporan baru
              </Button>
            ) : null
          }
        >
          <div className="space-y-3">
            <label htmlFor="raw-text" className="sr-only">
              Teks laporan
            </label>
            <textarea
              id="raw-text"
              rows={9}
              maxLength={MAX_LEN}
              readOnly={!!existing}
              disabled={disabled}
              value={rawText}
              onChange={(e) => changeRawText(e.target.value)}
              placeholder="Contoh: Banjir di Desa … butuh tambahan 20 dus air mineral …"
              className={`${inputClass} resize-y leading-relaxed ${existing ? "cursor-default opacity-80" : ""}`}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="font-mono text-xs text-subtle">
                {rawText.length}/{MAX_LEN}
              </span>
              {!existing && (
                <div className="flex flex-wrap gap-2">
                  <label htmlFor="sample" className="sr-only">
                    Isi dengan contoh simulasi
                  </label>
                  <select
                    id="sample"
                    className={`${inputClass} w-auto py-1.5 text-xs`}
                    value=""
                    disabled={disabled}
                    onChange={(e) => {
                      const s = SAMPLE_REPORTS[Number(e.target.value)];
                      if (s) changeRawText(s.text);
                    }}
                  >
                    <option value="">Pilih contoh…</option>
                    {SAMPLE_REPORTS.map((s, i) => (
                      <option key={s.label} value={i}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <Button onClick={startManual} disabled={disabled || rawText.trim().length < 5}>
                    Isi manual
                  </Button>
                  <Button variant="primary" onClick={() => analyze()} disabled={disabled || rawText.trim().length < 5}>
                    {busy === "analyze-ai" ? "AI membaca…" : busy === "analyze-rules" ? "Menganalisis…" : extractAi ? "Analisis AI →" : "Analisis laporan →"}
                  </Button>
                  {extractAi && <Button onClick={() => analyze("rules")} disabled={disabled || rawText.trim().length < 5}>Analisis berbasis aturan</Button>}
                </div>
              )}
            </div>
          </div>
        </Panel>

        <Panel id="queue" title="Perlu diperiksa" description="Laporan tersimpan yang menunggu verifikasi.">
          <ReviewQueue
            reports={queue}
            activeId={existing?.id ?? null}
            loading={queueLoading}
            error={queueError}
            disabled={busy !== null}
            onSelect={(id) => {
              if (id === existing?.id) return;
              navigate(`/intake?report=${encodeURIComponent(id)}`);
            }}
            onRetry={refreshQueue}
          />
        </Panel>
      </div>

      <div className="min-w-0 lg:col-span-7">
        {message && (
          <div
            role={message.tone === "danger" ? "alert" : "status"}
            className={`mb-4 rounded-md border px-4 py-3 text-sm ${
              message.tone === "ok"
                ? "border-ok/50 bg-ok/10 text-ok"
                : message.tone === "warn"
                  ? "border-warn/50 bg-warn/10 text-warn"
                  : "border-danger/50 bg-danger/10 text-danger"
            }`}
          >
            {message.text}{" "}
            {message.link && (
              <Link to={message.link.href} className="font-medium underline underline-offset-2">
                {message.link.label}
              </Link>
            )}
            {message.retry && (
              <Button variant="ghost" className="ml-1 px-2 py-1 text-xs" onClick={() => analyze(retryKind)} disabled={disabled}>
                {busy === "analyze-ai" || busy === "analyze-rules" ? "Mencoba lagi…" : "Coba lagi"}
              </Button>
            )}
            {message.retry === false && (
              <span className="block pt-1 text-xs text-muted">
                Anda tetap dapat mengisi field secara manual dengan tombol “Isi manual”.
              </span>
            )}
          </div>
        )}

        <Panel
          id="review"
          title="02  ·  Periksa & verifikasi"
          description="Hasil analisis hanya saran. Periksa kembali sebelum verifikasi."
          actions={existing ? <StatusBadge status={existing.status} /> : null}
        >
          {busy === "load" ? (
            <p className="text-sm text-subtle">Memuat laporan…</p>
          ) : !draft ? (
            <div className="rounded-2xl border border-dashed border-white/15 bg-navy-950/20 px-5 py-16 text-center">
              <div aria-hidden="true" className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl border border-teal-accent/20 bg-teal-accent/10 text-teal-accent">
                <svg width="25" height="25" viewBox="0 0 24 24" fill="none"><path d="M7 3h7l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.5"/><path d="M14 3v5h5M9 12h6M9 16h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </div>
              <p className="font-semibold text-ink">Hasil laporan muncul di sini</p>
              <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-muted">Masukkan pesan, lalu pilih <span className="text-teal-accent">Analisis laporan</span> atau isi detail secara manual.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {existing?.status === "rejected" && <p role="status" className="rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-warn">Laporan ini ditolak dan tidak dapat diubah.</p>}
              {extraction ? (
                <ExtractionNotice extraction={extraction} />
              ) : (
                !existing && (
                  <p className="rounded-md border border-navy-700 bg-navy-850 px-3 py-2.5 text-xs text-muted">
                    Draf diisi manual oleh operator — tidak ada hasil ekstraksi otomatis.
                  </p>
                )
              )}

              <div className="grid gap-5 md:grid-cols-2">
                <Field
                  label="Jenis kejadian"
                  htmlFor="incident-type"
                  error={errors.incidentType}
                  hint={<Evidence quote={extraction?.incidentEvidence} />}
                >
                  <div className="flex items-center gap-2">
                    <select
                      id="incident-type"
                      className={inputClass}
                      value={draft.incidentType}
                      disabled={disabled}
                      onChange={(e) => setField({ incidentType: e.target.value as IncidentType | "" })}
                      aria-invalid={!!errors.incidentType}
                    >
                      <option value="">— tidak ditemukan —</option>
                      {INCIDENT_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {INCIDENT_LABELS[t]}
                        </option>
                      ))}
                    </select>
                    {editedFromExtraction("incidentType") && <Badge tone="neutral">diubah</Badge>}
                  </div>
                </Field>
                <Field
                  label="Lokasi"
                  htmlFor="location"
                  error={errors.locationText}
                  hint={<Evidence quote={extraction?.locationEvidence} />}
                >
                  <div className="flex items-center gap-2">
                    <input
                      id="location"
                      className={inputClass}
                      value={draft.locationText}
                      maxLength={200}
                      placeholder="— tidak ditemukan —"
                      disabled={disabled}
                      onChange={(e) => setField({ locationText: e.target.value })}
                      aria-invalid={!!errors.locationText}
                    />
                    {editedFromExtraction("locationText") && <Badge tone="neutral">diubah</Badge>}
                  </div>
                </Field>
              </div>

              <NeedsEditor
                needs={draft.needs}
                onChange={(needs) => setField({ needs })}
                errors={errors}
                disabled={disabled}
              />

              {duplicatePromptId && (
                <div className="rounded-md border border-dup/50 bg-dup/10 p-3 text-sm">
                  <p className="font-medium text-dup">Potensi duplikat</p>
                  <p className="mt-1 text-xs text-ink/90">
                    Ada laporan lain dengan area dan jenis kejadian yang sama. Laporan tidak dihapus atau digabung otomatis —
                    putuskan secara manual.
                  </p>
                  {duplicateOfReport && (
                    <div className="mt-2 rounded border border-navy-700 bg-navy-950/60 p-2 text-xs">
                      <div className="mb-1 flex flex-wrap items-center gap-2 text-subtle">
                        <StatusBadge status={duplicateOfReport.status} />
                        <span>{formatDateTime(duplicateOfReport.submittedAt)}</span>
                      </div>
                      <p className="text-muted">{duplicateOfReport.rawText}</p>
                    </div>
                  )}
                  <label className="mt-3 flex items-start gap-2 text-xs text-ink">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 accent-teal-accent"
                      checked={duplicateReviewed}
                      onChange={(e) => setDuplicateReviewed(e.target.checked)}
                    />
                    Saya sudah membandingkan kedua laporan dan laporan ini memuat informasi yang perlu dicatat.
                  </label>
                </div>
              )}

              <div className="flex flex-col-reverse gap-2 border-t border-navy-700 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  {existing &&
                    (confirmReject ? (
                      <div role="group" aria-label="Konfirmasi tolak laporan" className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="text-warn">Tolak laporan ini? Data tetap tersimpan tetapi tidak dihitung dan tidak bisa diubah lagi.</span>
                        <Button variant="danger" onClick={() => act("reject")} disabled={disabled}>
                          {busy === "reject" ? "Memproses…" : "Ya, tolak"}
                        </Button>
                        <Button variant="ghost" onClick={() => setConfirmReject(false)} disabled={disabled}>
                          Batal
                        </Button>
                      </div>
                    ) : (
                      <Button variant="danger" onClick={() => setConfirmReject(true)} disabled={disabled}>
                        Tolak laporan
                      </Button>
                    ))}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button onClick={() => act("save")} disabled={disabled}>
                    {busy === "save" ? "Menyimpan…" : "Simpan untuk review"}
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => act("verify")}
                    disabled={disabled || (!!duplicatePromptId && !duplicateReviewed)}
                  >
                    {busy === "verify" ? "Memverifikasi…" : "Verifikasi laporan"}
                  </Button>
                </div>
              </div>
              <p className="text-xs text-subtle">
                Hanya kebutuhan terverifikasi dengan jenis jumlah “Tambahan” yang masuk ke rekap.
              </p>
            </div>
          )}
        </Panel>
      </div>
    </div>
    </>
  );
}

/** Label sumber draf + ketidakpastian model + temuan validasi server, ditampilkan menonjol. */
function ExtractionNotice({ extraction }: { extraction: ExtractionResult }) {
  const isAi = extraction.source === "gemini";
  const hasIssues = extraction.uncertainties.length > 0 || extraction.warnings.length > 0;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-navy-700 bg-navy-850 px-3 py-2.5 text-xs">
        <Badge tone="accent">
          {isAi ? `Draf AI · ${extraction.model ?? "Gemini"}` : "Analisis berbasis aturan · bukan AI"}
        </Badge>
        <Badge tone="warn">Belum diverifikasi</Badge>
        <span className="text-subtle">Informasi yang tidak ditemukan dibiarkan kosong.</span>
      </div>
      {extraction.occurredAtText && (
        <p className="text-xs text-muted">
          Waktu kejadian menurut teks: <span className="text-ink">“{extraction.occurredAtText}”</span>{" "}
          <span className="text-subtle">(informasi saja, tidak disimpan sebagai tanggal)</span>
        </p>
      )}
      {hasIssues && (
        <div role="alert" className="rounded-md border border-warn/60 bg-warn/10 px-3 py-3 text-sm">
          <p className="font-semibold text-warn">Perlu diperiksa operator</p>
          {extraction.uncertainties.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-medium uppercase tracking-wide text-warn/90">{isAi ? "Ketidakpastian dari AI" : "Ketidakpastian ekstraksi"}</p>
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-ink/90">
                {extraction.uncertainties.map((u) => (
                  <li key={u}>{u}</li>
                ))}
              </ul>
            </div>
          )}
          {extraction.warnings.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-medium uppercase tracking-wide text-warn/90">Temuan validasi bukti</p>
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-ink/90">
                {extraction.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
