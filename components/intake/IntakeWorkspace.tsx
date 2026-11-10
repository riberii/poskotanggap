"use client";

import { Link } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
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
  const { api } = useDataMode();
  const [rawText, setRawText] = useState("");
  const [existing, setExisting] = useState<Report | null>(null);
  const [duplicateOfReport, setDuplicateOfReport] = useState<Report | null>(null);
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [duplicateReviewed, setDuplicateReviewed] = useState(false);
  const [duplicatePromptId, setDuplicatePromptId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<null | "analyze" | "save" | "verify" | "reject" | "load">(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [queue, setQueue] = useState<Report[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueError, setQueueError] = useState<string | null>(null);

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
    setRawText("");
    setExisting(null);
    setDuplicateOfReport(null);
    setExtraction(null);
    setDraft(null);
    setDuplicateReviewed(false);
    setDuplicatePromptId(null);
    setErrors({});
  };

  const loadReport = useCallback(async (id: string) => {
    setBusy("load");
    setMessage(null);
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
    setDraft(draftFromReport(report));
    setDuplicateReviewed(false);
    setDuplicatePromptId(report.duplicateOf);
    setErrors({});
  }, [api]);

  useEffect(() => {
    refreshQueue();
    if (initialReportId) loadReport(initialReportId);
  }, [initialReportId, loadReport, refreshQueue]);

  async function analyze() {
    setBusy("analyze");
    setMessage(null);
    setErrors({});
    const res = await api.extract(rawText);
    setBusy(null);
    if (!res.ok) {
      // Tidak ada draf pengganti: kegagalan AI tidak pernah ditutupi dengan data tiruan.
      const retryable =
        res.error.status === 0 ||
        (res.error.details as { retryable?: boolean } | null)?.retryable === true;
      setMessage({
        tone: "danger",
        text: `Ekstraksi gagal: ${res.error.message}`,
        retry: retryable,
      });
      return;
    }
    setExisting(null);
    setDuplicateOfReport(null);
    setDuplicatePromptId(null);
    setDuplicateReviewed(false);
    setExtraction(res.data.extraction);
    setDraft(draftFromExtraction(res.data.extraction));
  }

  /** Draf kosong tanpa AI — operator mengisi sendiri dari teks asli. */
  function startManual() {
    setMessage(null);
    setErrors({});
    setExisting(null);
    setDuplicateOfReport(null);
    setDuplicatePromptId(null);
    setDuplicateReviewed(false);
    setExtraction(null);
    setDraft({ incidentType: "", locationText: "", needs: [] });
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
      if (dupId) api.getReport(dupId).then((r) => r.ok && setDuplicateOfReport(r.data.report));
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
    const clientErrors = draftClientErrors(draft);
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length > 0) {
      setMessage({ tone: "danger", text: "Periksa kembali field yang ditandai." });
      return;
    }
    setBusy(action);
    setMessage(null);
    const payload = { ...draftToPayload(draft), duplicateReviewed };
    const res = existing
      ? await api.reviewReport(existing.id, payload, action)
      : await api.submitReport(rawText, payload, action as "save" | "verify", extraction);
    setBusy(null);
    if (!res.ok) return handleError(res.error);

    const r = res.data.report;
    const text =
      r.status === "verified"
        ? "Laporan terverifikasi dan masuk ke rekap dashboard."
        : r.status === "rejected"
          ? "Laporan ditandai ditolak. Data tidak dihapus dan tidak dihitung."
          : r.duplicateOf
            ? "Laporan disimpan untuk review. Ditandai sebagai potensi duplikat."
            : "Laporan disimpan dan menunggu review.";
    resetForm();
    setMessage({ tone: r.status === "rejected" ? "warn" : "ok", text, link: { href: "/dashboard", label: "Lihat dashboard" } });
    refreshQueue();
  }

  const setField = (patch: Partial<Draft>) => draft && setDraft({ ...draft, ...patch });
  const editedFromExtraction = (field: "incidentType" | "locationText") =>
    extraction && draft ? (extraction[field] ?? "") !== draft[field] : false;
  const disabled = busy !== null;

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <div className="min-w-0 space-y-6 lg:col-span-5">
        <Panel
          id="input"
          title={existing ? "Teks laporan (tersimpan)" : "1 · Teks laporan"}
          description={
            existing
              ? "Teks asli tidak dapat diubah. Fingerprint dihitung dari teks ini."
              : "Tempel pesan teks bebas dari lapangan. Gunakan hanya data simulasi."
          }
          actions={
            existing ? (
              <Button variant="ghost" className="px-2 py-1 text-xs" onClick={resetForm}>
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
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
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
                    onChange={(e) => {
                      const s = SAMPLE_REPORTS[Number(e.target.value)];
                      if (s) setRawText(s.text);
                    }}
                  >
                    <option value="">Isi contoh simulasi…</option>
                    {SAMPLE_REPORTS.map((s, i) => (
                      <option key={s.label} value={i}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <Button onClick={startManual} disabled={disabled || rawText.trim().length < 5}>
                    Isi manual
                  </Button>
                  <Button variant="primary" onClick={analyze} disabled={disabled || rawText.trim().length < 5}>
                    {busy === "analyze" ? "Mengekstrak…" : "Ekstrak (berbasis aturan)"}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </Panel>

        <Panel id="queue" title="Antrian review" description="Laporan tersimpan yang belum diverifikasi, terlama di atas.">
          <ReviewQueue
            reports={queue}
            activeId={existing?.id ?? null}
            loading={queueLoading}
            error={queueError}
            onSelect={loadReport}
          />
        </Panel>
      </div>

      <div className="min-w-0 lg:col-span-7">
        {message && (
          <div
            role="status"
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
              <Button variant="ghost" className="ml-1 px-2 py-1 text-xs" onClick={analyze} disabled={disabled}>
                {busy === "analyze" ? "Mencoba lagi…" : "Coba lagi"}
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
          title="2 · Hasil ekstraksi & verifikasi manusia"
          description="Hasil AI hanya draf dan bisa salah. Periksa setiap field terhadap teks asli sebelum verifikasi."
          actions={existing ? <StatusBadge status={existing.status} /> : null}
        >
          {busy === "load" ? (
            <p className="text-sm text-subtle">Memuat laporan…</p>
          ) : !draft ? (
            <div className="rounded-md border border-dashed border-navy-600 px-4 py-10 text-center">
              <p className="text-sm text-muted">Belum ada hasil ekstraksi.</p>
              <p className="mt-1 text-xs text-subtle">
                Tempel teks laporan lalu tekan <span className="text-ink">Analisis dengan AI</span> atau <span className="text-ink">Isi manual</span>, atau pilih laporan dari antrian review.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {extraction ? (
                <ExtractionNotice extraction={extraction} />
              ) : (
                !existing && (
                  <p className="rounded-md border border-navy-700 bg-navy-850 px-3 py-2.5 text-xs text-muted">
                    Draf diisi manual oleh operator — tidak ada hasil ekstraksi AI.
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
                  {existing && (
                    <Button variant="danger" onClick={() => act("reject")} disabled={disabled}>
                      {busy === "reject" ? "Memproses…" : "Tolak laporan"}
                    </Button>
                  )}
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
                Verifikasi menyatakan bahwa operator sudah memeriksa isi laporan. Hanya laporan terverifikasi dengan basis
                kuantitas “Tambahan” yang dihitung di dashboard.
              </p>
            </div>
          )}
        </Panel>
      </div>
    </div>
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
          {isAi ? `Draf AI · ${extraction.model ?? "Gemini"}` : "Ekstraksi simulasi · berbasis aturan, bukan AI"}
        </Badge>
        <Badge tone="warn">Belum diverifikasi</Badge>
        <span className="text-subtle">Field yang tidak ditemukan dibiarkan kosong (null).</span>
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
              <p className="text-xs font-medium uppercase tracking-wide text-warn/90">Ketidakpastian dari AI</p>
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-ink/90">
                {extraction.uncertainties.map((u) => (
                  <li key={u}>{u}</li>
                ))}
              </ul>
            </div>
          )}
          {extraction.warnings.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-medium uppercase tracking-wide text-warn/90">Temuan validasi server</p>
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
