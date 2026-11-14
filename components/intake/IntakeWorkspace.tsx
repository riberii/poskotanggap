import { Link, useBlocker, useLocation, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ApiError } from "@/lib/api-client";
import { sendDemo, useDemoMessages } from "@/lib/demo-channel";
import { useDataChanged } from "@/lib/sync";
import { useDataMode } from "@/components/DataModeProvider";
import { explainDuplicate } from "@/lib/domain/duplicates";
import { normalizeArea } from "@/lib/domain/normalize";
import {
  INCIDENT_LABELS,
  INCIDENT_TYPES,
  type ExtractionResult,
  type IncidentType,
  type InventoryItem,
  type Report,
} from "@/lib/domain/types";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button, Evidence, Field, inputClass } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { Panel } from "@/components/ui/Panel";
import { InfoTip } from "@/components/ui/InfoTip";
import { FOLLOW_UP_NOTE_MAX, reportCode } from "@/lib/domain/follow-up";
import { draftClientErrors, draftFromExtraction, draftFromReport, draftToPayload, type Draft } from "./draft";
import { DuplicateCompare } from "./DuplicateCompare";
import { NeedsEditor } from "./NeedsEditor";
import { AiInsightPanel } from "@/components/report/AiInsightPanel";
import { AttachmentGallery } from "@/components/report/AttachmentGallery";
import { awaitingReply } from "@/lib/domain/chat";
import { fetchThreads } from "@/lib/remote";
import { ChatThread } from "@/components/report/ChatThread";
import { GeoMap } from "@/components/ui/GeoMap";
import { ReviewQueue } from "./ReviewQueue";
import { SAMPLE_REPORTS } from "./samples";
import { describeImpact, highlightSegments, validateDraft, type Issue } from "./validation";

type Message = {
  tone: "ok" | "warn" | "danger";
  text: string;
  lines?: string[];
  link?: { href: string; label: string };
  retry?: boolean;
};

type Resolution = "confirmed_duplicate" | "keep_both";

const MAX_LEN = 5000;
const STEPS = [{ title: "Teks" }, { title: "Temuan" }, { title: "Keputusan" }];

const draftNeedsView = (d: Draft) =>
  d.needs.map((n) => {
    const q = Number(n.quantity.trim().replace(",", "."));
    return { item: n.item, quantity: n.quantity.trim() !== "" && Number.isFinite(q) && q > 0 ? q : null, unit: n.unit || null };
  });

export function IntakeWorkspace({ initialReportId }: { initialReportId: string | null }) {
  const { api } = useDataMode();
  const navigate = useNavigate();
  const location = useLocation();
  const [rawText, setRawText] = useState("");
  const [existing, setExisting] = useState<Report | null>(null);
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dupReport, setDupReport] = useState<Report | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [confirmReject, setConfirmReject] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<null | "analyze" | "save" | "verify" | "reject" | "load" | "arrange">(null);
  const [message, setMessage] = useState<Message | null>(() => (location.state as { message?: Message } | null)?.message ?? null);
  const [queue, setQueue] = useState<Report[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);
  // Utas yang pesan terakhirnya dari pelapor (menunggu balasan tim).
  const [awaiting, setAwaiting] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    let stop = false;
    const poll = async () => {
      if (document.visibilityState === "hidden") return;
      const res = await fetchThreads();
      if (!stop && res.ok) setAwaiting(new Set(res.data.threads.filter(awaitingReply).map((t) => t.code)));
    };
    void poll();
    const t = setInterval(() => void poll(), 10_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, []);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [activeQuote, setActiveQuote] = useState<string | null>(null);
  const [arrangeNote, setArrangeNote] = useState("");
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
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
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

  const refreshInventory = useCallback(async () => {
    const res = await api.dashboard();
    if (res.ok) setInventory(res.data.inventory);
  }, [api]);

  const resetForm = () => {
    if (initialReportId) {
      allowNavigation.current = true;
      navigate("/intake", { replace: true });
    }
    setRawText("");
    setExisting(null);
    setExtraction(null);
    setDraft(null);
    initialDraft.current = null;
    setConfirmReject(false);
    setErrors({});
  };

  /** Mengubah teks laporan baru membuat draf lama tidak sesuai lagi; draf dibuang. false = dibatalkan operator. */
  function changeRawText(text: string): boolean {
    if (text !== rawText && draftChanged && !window.confirm("Mengubah teks akan menghapus perubahan pada draf. Lanjutkan?")) return false;
    setRawText(text);
    if (!existing && (draft || extraction)) {
      setDraft(null);
      initialDraft.current = null;
      setExtraction(null);
      setErrors({});
      setMessage({ tone: "warn", text: "Teks berubah. Analisis ulang." });
    }
    return true;
  }

  const loadReport = useCallback(async (id: string) => {
    setBusy("load");
    setMessage(null);
    setExisting(null);
    setDraft(null);
    setExtraction(null);
    setRawText("");
    const res = await api.getReport(id);
    setBusy(null);
    if (!res.ok) {
      setMessage({ tone: "danger", text: res.error.message });
      return;
    }
    const { report } = res.data;
    setExisting(report);
    setArrangeNote(report.followUp?.note ?? "");
    setRawText(report.rawText);
    setExtraction(report.extraction);
    setAiNote(null);
    const loadedDraft = draftFromReport(report);
    initialDraft.current = JSON.stringify(loadedDraft);
    setDraft(loadedDraft);
    setConfirmReject(false);
    setErrors({});
  }, [api]);

  useEffect(() => {
    refreshQueue();
    refreshInventory();
    if (initialReportId) loadReport(initialReportId);
  }, [initialReportId, loadReport, refreshQueue, refreshInventory]);

  // Jendela lain (mis. layar pelapor) mengubah data: muat ulang antrean, stok, dan laporan yang sedang dibuka
  // (kecuali operator sedang mengedit — suntingan tidak ditimpa).
  useDataChanged(() => {
    void refreshQueue();
    void refreshInventory();
    if (existing && !draftChanged) {
      void api.getReport(existing.id).then((r) => {
        if (!r.ok) return;
        const d = draftFromReport(r.data.report);
        initialDraft.current = JSON.stringify(d);
        setExisting(r.data.report);
        setDraft(d);
      });
    }
  });

  // Hanya bingkai /demo (?demo=1): perintah dari halaman /demo menjalankan handler ASLI tombol operator.
  const demoActRef = useRef({ verify: () => {}, arrange: (_note: string) => {} });
  demoActRef.current = { verify: () => void act("verify"), arrange: (note: string) => void arrange(note) };
  useDemoMessages((m) => {
    if (m.type === "operator-verify") demoActRef.current.verify();
    if (m.type === "operator-arrange") demoActRef.current.arrange(m.note);
  });
  // Sorot bukti satu per satu secara otomatis agar penonton melihat hubungan field ↔ kalimat sumber.
  const demoMode = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("demo") === "1";
  const demoQuotes = useMemo(
    () => (extraction ? [extraction.locationEvidence, ...extraction.needs.map((n) => n.evidenceQuote)].filter((q): q is string => !!q) : []),
    [extraction],
  );
  useEffect(() => {
    if (!demoMode || !existing || existing.status === "verified" || demoQuotes.length === 0) return;
    let i = 0;
    setActiveQuote(demoQuotes[0]);
    const t = setInterval(() => {
      i += 1;
      if (i >= demoQuotes.length) {
        clearInterval(t);
        return;
      }
      setActiveQuote(demoQuotes[i]);
    }, 1700);
    return () => clearInterval(t);
  }, [demoMode, existing, demoQuotes]);
  // /demo: bawa bagian yang sedang dibicarakan ke tengah bingkai (bingkai operator hanya setinggi layar).
  const demoScroll = (selector: string) =>
    requestAnimationFrame(() =>
      document.querySelector(selector)?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }),
    );
  useEffect(() => {
    if (demoMode && activeQuote) demoScroll("mark.sweep");
  }, [demoMode, activeQuote]);
  useEffect(() => {
    if (demoMode && existing?.status === "verified") demoScroll("#arrange-title");
  }, [demoMode, existing?.status, existing?.followUp]);
  useEffect(() => {
    if (demoMode && existing) sendDemo({ type: "operator-loaded", id: existing.id });
  }, [demoMode, existing?.id, existing?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Potensi duplikat dihitung dari area + jenis kejadian pada draf saat ini (sama dengan aturan server).
  const dupLocation = draft?.locationText ?? null;
  const dupIncident = draft?.incidentType ?? null;
  const hasDraft = draft !== null;
  const existingId = existing?.id;
  const existingRejected = existing?.status === "rejected";
  useEffect(() => {
    if (!hasDraft || existingRejected || !api.findDuplicate) {
      setDupReport(null);
      return;
    }
    let cancelled = false;
    api.findDuplicate({ locationText: dupLocation || null, incidentType: dupIncident || null }, existingId).then((r) => {
      if (!cancelled) setDupReport(r.ok ? r.data.duplicateOfReport : null);
    });
    return () => { cancelled = true; };
  }, [api, hasDraft, existingRejected, dupLocation, dupIncident, existingId]);

  async function analyze(text: string = rawText) {
    if (draftChanged && !window.confirm("Analisis ulang akan mengganti perubahan pada draf. Lanjutkan?")) return;
    setBusy("analyze");
    setMessage(null);
    setErrors({});
    const res = await api.extractHybrid(text);
    setBusy(null);
    if (!res.ok) {
      // Kegagalan ekstraksi tidak pernah ditutupi dengan data tiruan.
      setMessage({ tone: "danger", text: `Ekstraksi gagal: ${res.error.message}`, retry: true });
      return;
    }
    setExisting(null);
    setAiNote(res.data.aiNote);
    setExtraction(res.data.extraction);
    const extractedDraft = draftFromExtraction(res.data.extraction);
    initialDraft.current = JSON.stringify(extractedDraft);
    setDraft(extractedDraft);
  }

  /** Draf kosong — operator mengisi sendiri dari teks asli. */
  function startManual() {
    if (draftChanged && !window.confirm("Mengisi manual akan mengganti perubahan pada draf. Lanjutkan?")) return;
    setMessage(null);
    setErrors({});
    setExisting(null);
    setExtraction(null);
    const emptyDraft: Draft = { incidentType: "", locationText: "", needs: [] };
    initialDraft.current = JSON.stringify(emptyDraft);
    setDraft(emptyDraft);
  }

  function pickSample(text: string) {
    if (busy) return;
    if (!changeRawText(text)) return;
    void analyze(text);
  }

  function handleError(err: ApiError) {
    if (err.code === "exact_duplicate") {
      const existingId = (err.details as { existingId?: string } | null)?.existingId;
      setMessage({
        tone: "warn",
        text: "Laporan identik sudah ada. Tidak disimpan.",
        link: existingId ? { href: `/intake?report=${existingId}`, label: "Buka yang ada" } : undefined,
      });
      return;
    }
    if (err.code === "duplicate_review_required") {
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

  async function act(action: "save" | "verify" | "reject", resolution?: Resolution) {
    if (!draft) return;
    const clientErrors = action === "reject" && existing ? {} : draftClientErrors(draft);
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length > 0) {
      setMessage({ tone: "danger", text: "Periksa field bertanda." });
      return;
    }
    setBusy(action);
    setMessage(null);
    const payload = {
      ...draftToPayload(action === "reject" && existing ? draftFromReport(existing) : draft),
      duplicateReviewed: resolution === "keep_both",
      ...(resolution ? { duplicateResolution: resolution } : {}),
    };
    const res = existing
      ? await api.reviewReport(existing.id, payload, action)
      : await api.submitReport(rawText, payload, action, extraction);
    if (!res.ok) {
      setBusy(null);
      return handleError(res.error);
    }

    const r = res.data.report;
    const dash = await api.dashboard();
    setBusy(null);
    const lines = dash.ok ? describeImpact(r, dash.data) : [];
    const text =
      r.status === "verified"
        ? "Terverifikasi. Rekap diperbarui:"
        : r.status === "rejected"
          ? r.duplicateResolution === "confirmed_duplicate"
            ? "Duplikat ditolak, tidak dihitung."
            : "Ditolak, tidak dihitung."
          : r.duplicateOf
            ? "Disimpan. Potensi duplikat, belum dihitung."
            : "Disimpan, menunggu verifikasi.";
    const successMessage: Message = {
      tone: r.status === "rejected" ? "warn" : "ok",
      text,
      lines: r.status === "verified" || r.status === "rejected" ? lines : undefined,
      link: r.status === "verified" ? { href: `/intake?report=${r.id}`, label: "Atur bantuan →" } : { href: "/dashboard", label: "Dashboard →" },
    };
    if (demoMode && initialReportId) {
      // /demo: tetap di laporan ini agar penonton melihat status & tombol "Tandai bantuan diatur".
      const d = draftFromReport(r);
      initialDraft.current = JSON.stringify(d);
      setExisting(r);
      setDraft(d);
      setMessage(successMessage);
      sendDemo({ type: "operator-verified", id: r.id });
    } else if (initialReportId) {
      allowNavigation.current = true;
      navigate("/intake", { replace: true, state: { message: successMessage }, viewTransition: true });
    } else {
      resetForm();
      setMessage(successMessage);
      refreshQueue();
    }
    refreshInventory();
  }

  async function arrange(noteOverride?: string) {
    if (!existing || !api.arrangeAid) return;
    setBusy("arrange");
    if (noteOverride !== undefined) setArrangeNote(noteOverride);
    const res = await api.arrangeAid(existing.id, (noteOverride ?? arrangeNote).trim() || null);
    setBusy(null);
    if (!res.ok) {
      sendDemo({ type: "operator-error", message: res.error.message });
      return setMessage({ tone: "danger", text: res.error.message });
    }
    setExisting(res.data.report);
    setMessage({ tone: "ok", text: "Bantuan ditandai diatur. Pelapor melihatnya di halaman status." });
    sendDemo({ type: "operator-arranged", id: res.data.report.id });
  }

  const setField = (patch: Partial<Draft>) => {
    if (!draft) return;
    setDraft({ ...draft, ...patch });
  };
  const editedFromExtraction = (field: "incidentType" | "locationText") =>
    extraction && draft ? (extraction[field] ?? "") !== draft[field] : false;
  const disabled = busy !== null || existing?.status === "rejected";

  const issues: Issue[] = useMemo(
    () => (draft ? validateDraft(draft, { inventory, hasDuplicate: !!dupReport }) : []),
    [draft, inventory, dupReport],
  );
  const blockingIssue = issues.find((i) => i.blocking);
  /** Hubungan field ↔ kalimat sumber: fokus/hover menyorot kalimat di teks asli. */
  const quoteEvents = (q: string | null | undefined) => ({
    onMouseEnter: () => setActiveQuote(q ?? null),
    onMouseLeave: () => setActiveQuote(null),
    onFocus: () => setActiveQuote(q ?? null),
    onBlur: () => setActiveQuote(null),
  });
  const step = draft ? 1 : 0;

  const highlight = useMemo(
    () =>
      draft
        ? highlightSegments(rawText, [extraction?.incidentEvidence, extraction?.locationEvidence, ...draft.needs.map((n) => n.evidenceQuote)], activeQuote)
        : [],
    [draft, rawText, extraction, activeQuote],
  );

  const comparison = useMemo(
    () =>
      draft && dupReport
        ? explainDuplicate(
            { normalizedArea: normalizeArea(draft.locationText), incidentType: draft.incidentType || null, needs: draftNeedsView(draft) },
            dupReport,
            (t) => INCIDENT_LABELS[t],
          )
        : null,
    [draft, dupReport],
  );

  return (
    <>
      <ol aria-label="Alur laporan" className="mb-5 grid grid-cols-3 gap-2">
        {STEPS.map((s, index) => (
          <li
            key={s.title}
            aria-current={step === index ? "step" : undefined}
            className={`rounded-md border px-3 py-2.5 ${step === index ? "border-teal-accent bg-teal-accent/10" : "border-navy-700 bg-white"}`}
          >
            <span className="text-xs font-bold text-ink"><span className="mr-1.5 text-teal-accent">{index + 1}</span>{s.title}</span>
          </li>
        ))}
      </ol>

      {message && (
        <div
          role={message.tone === "danger" ? "alert" : "status"}
          className={`mb-5 rounded-md border px-4 py-3 text-sm ${
            message.tone === "ok" ? "border-ok/40 bg-ok/10" : message.tone === "warn" ? "border-warn/40 bg-warn/10" : "border-danger/40 bg-danger/10"
          }`}
        >
          <p className={`font-semibold ${message.tone === "ok" ? "text-ok" : message.tone === "warn" ? "text-warn" : "text-danger"}`}>{message.text}</p>
          {message.lines && message.lines.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-ink">
              {message.lines.map((l) => <li key={l}>{l}</li>)}
            </ul>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {message.link && (
              <Link to={message.link.href} className="font-semibold text-teal-accent underline underline-offset-2">{message.link.label}</Link>
            )}
            {message.retry && (
              <>
                <Button className="px-3 py-1 text-xs" onClick={() => analyze()} disabled={busy !== null || rawText.trim().length < 5}>Coba lagi</Button>
                <Button variant="ghost" className="px-3 py-1 text-xs" onClick={startManual}>Isi manual</Button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="min-w-0 space-y-6 lg:col-span-5">
          <Panel
            id="input"
            title="Teks"
            actions={
              existing ? (
                <Button className="px-3 py-1.5 text-xs" onClick={() => {
                  if (!draftChanged || window.confirm("Perubahan draf belum disimpan. Mulai laporan baru?")) resetForm();
                }}>
                  + Laporan baru
                </Button>
              ) : null
            }
          >
            {existing ? (
              <p className="max-h-40 overflow-auto rounded-md border border-navy-700 bg-navy-850 p-3 text-sm leading-relaxed text-muted">{existing.rawText}</p>
            ) : (
              <div className="space-y-4">
                <div>
                  <label htmlFor="raw-text" className="sr-only">Teks laporan</label>
                  <textarea
                    id="raw-text"
                    rows={6}
                    maxLength={MAX_LEN}
                    disabled={disabled}
                    value={rawText}
                    onChange={(e) => changeRawText(e.target.value)}
                    placeholder="Tempel pesan lapangan…"
                    className={`${inputClass} resize-y leading-relaxed`}
                  />
                  <div className="mt-1 flex justify-between text-xs text-subtle">
                    <span>{rawText.trim() && rawText.trim().length < 5 ? "Min. 5 karakter." : ""}</span>
                    <span className="font-mono">{rawText.length}/{MAX_LEN}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" onClick={() => analyze()} disabled={disabled || rawText.trim().length < 5}>
                    {busy === "analyze" ? "Menganalisis…" : "Analisis"}
                    {busy !== "analyze" && <Icon name="arrow" size={14} />}
                  </Button>
                  <Button onClick={startManual} disabled={disabled || rawText.trim().length < 5}>Isi manual</Button>
                </div>

                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Kasus demo</p>
                  <ul className="space-y-1.5">
                    {SAMPLE_REPORTS.map((s) => (
                      <li key={s.label}>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => pickSample(s.text)}
                          title={s.hint}
                          className="w-full rounded-md border border-navy-700 bg-white px-3 py-1.5 text-left hover:border-teal-accent hover:bg-navy-850 disabled:opacity-60"
                        >
                          <span className="block text-sm font-semibold text-ink">{s.label}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </Panel>

          <Panel id="queue" title="Antrean">
            <ReviewQueue
              reports={queue}
              activeId={existing?.id ?? null}
              loading={queueLoading}
              error={queueError}
              disabled={busy !== null}
              awaiting={awaiting}
              onSelect={(id) => {
                if (id === existing?.id) return;
                navigate(`/intake?report=${encodeURIComponent(id)}`);
              }}
              onRetry={refreshQueue}
            />
          </Panel>
        </div>

        <div className="min-w-0 lg:col-span-7">
          <Panel
            id="review"
            title="Temuan & keputusan"
            actions={existing ? <StatusBadge status={existing.status} resolution={existing.duplicateResolution} /> : null}
          >
            {busy === "load" ? (
              <div role="status" aria-label="Memuat laporan" className="space-y-3"><div className="skeleton h-20" /><div className="skeleton h-40" /></div>
            ) : !draft ? (
              <EmptyState
                icon="doc"
                title="Belum ada laporan"
                body="Pilih kasus demo atau tempel teks."
              />
            ) : (
              <div className="space-y-6">
                {existing?.status === "rejected" && (
                  <EmptyState tone="warn" icon="duplicate" title="Sudah ditolak" body={existing.duplicateResolution === "confirmed_duplicate" ? "Duplikat. Terkunci, tidak dihitung." : "Terkunci, tidak dihitung."} />
                )}

                {/* 1. Laporan asli + sorotan bukti */}
                <section aria-labelledby="orig-title">
                  <h3 id="orig-title" className="mb-1.5 text-sm font-bold">Laporan asli</h3>
                  <p className="rounded-md border border-navy-700 bg-navy-850 p-3 text-sm leading-relaxed">
                    {highlight.map((seg, i) => seg.evidence || seg.active ? <mark key={i} className={seg.active ? "evidence sweep" : "evidence"}>{seg.text}</mark> : <span key={i}>{seg.text}</span>)}
                  </p>
                  {extraction && highlight.some((s) => s.evidence) && (
                    <p className="mt-1 text-xs text-subtle"><mark className="evidence">Sorotan</mark> = sumber.</p>
                  )}
                </section>

                {/* Lokasi GPS dari pelapor */}
                {existing?.geo && (
                  <section aria-labelledby="geo-title" className="space-y-1.5">
                    <h3 id="geo-title" className="flex items-center gap-1.5 text-sm font-bold"><Icon name="pin" size={16} className="text-danger" />Lokasi GPS pelapor</h3>
                    <GeoMap geo={existing.geo} />
                  </section>
                )}

                {/* Pesan dengan pelapor */}
                {existing && (
                  <section aria-labelledby="chat-title">
                    <h3 id="chat-title" className="sr-only">Pesan dengan pelapor</h3>
                    <ChatThread key={existing.id} code={reportCode(existing.id)} as="team" />
                  </section>
                )}

                {/* Lampiran + saran AI dari pelapor */}
                {existing && ((existing.attachments?.length ?? 0) > 0 || existing.aiInsight) && (
                  <section aria-labelledby="media-title" className="space-y-4">
                    {(existing.attachments?.length ?? 0) > 0 && (
                      <div>
                        <h3 id="media-title" className="mb-1.5 text-sm font-bold">Lampiran</h3>
                        <AttachmentGallery items={existing.attachments ?? []} />
                      </div>
                    )}
                    <div>
                      <h3 className="mb-1.5 text-sm font-bold">Saran AI</h3>
                      <AiInsightPanel insight={existing.aiInsight} />
                    </div>
                  </section>
                )}

                {extraction ? (
                  <ExtractionNotice extraction={extraction} aiNote={aiNote} />
                ) : (
                  !existing && <p className="rounded-md border border-navy-700 bg-navy-850 px-3 py-2 text-sm text-muted">Isi manual.</p>
                )}

                {/* 2. Informasi yang ditemukan */}
                <section aria-labelledby="found-title" className="space-y-4">
                  <h3 id="found-title" className="text-sm font-bold">Temuan</h3>
                  <div className="grid gap-5 md:grid-cols-2">
                    <Field label="Jenis kejadian" htmlFor="incident-type" error={errors.incidentType} hint={extraction ? <Evidence quote={extraction.incidentEvidence} /> : undefined}>
                      <div className="flex items-center gap-2" {...quoteEvents(extraction?.incidentEvidence)}>
                        <select
                          id="incident-type"
                          className={inputClass}
                          value={draft.incidentType}
                          disabled={disabled}
                          onChange={(e) => setField({ incidentType: e.target.value as IncidentType | "" })}
                          aria-invalid={!!errors.incidentType}
                        >
                          <option value="">— tidak diketahui —</option>
                          {INCIDENT_TYPES.map((t) => (
                            <option key={t} value={t}>{INCIDENT_LABELS[t]}</option>
                          ))}
                        </select>
                        {editedFromExtraction("incidentType") && <Badge tone="neutral">diubah</Badge>}
                      </div>
                    </Field>
                    <Field label="Lokasi" htmlFor="location" error={errors.locationText} hint={extraction ? <Evidence quote={extraction.locationEvidence} /> : undefined}>
                      <div className="flex items-center gap-2" {...quoteEvents(extraction?.locationEvidence)}>
                        <input
                          id="location"
                          className={inputClass}
                          value={draft.locationText}
                          maxLength={200}
                          placeholder="— tidak diketahui —"
                          disabled={disabled}
                          onChange={(e) => setField({ locationText: e.target.value })}
                          aria-invalid={!!errors.locationText}
                        />
                        {editedFromExtraction("locationText") && <Badge tone="neutral">diubah</Badge>}
                      </div>
                    </Field>
                  </div>
                  <NeedsEditor needs={draft.needs} onChange={(needs) => setField({ needs })} errors={errors} disabled={disabled} onActive={setActiveQuote} />
                </section>

                {/* 3. Status validasi */}
                {existing?.status !== "rejected" && <ValidationList issues={issues} />}

                {/* 4. Duplikat */}
                {dupReport && comparison && existing?.status !== "rejected" && (
                  <DuplicateCompare
                    current={{
                      title: "Laporan A · ini",
                      status: existing?.status,
                      time: existing?.submittedAt ?? null,
                      incident: draft.incidentType,
                      location: draft.locationText.trim() || null,
                      text: rawText,
                      needs: draftNeedsView(draft),
                    }}
                    other={{
                      title: "Laporan B · sudah ada",
                      status: dupReport.status,
                      time: dupReport.submittedAt,
                      incident: dupReport.incidentType,
                      location: dupReport.locationText,
                      text: dupReport.rawText,
                      needs: dupReport.needs.map((n) => ({ item: n.item, quantity: n.quantity, unit: n.unit })),
                    }}
                    comparison={comparison}
                    busy={busy !== null}
                    verifyBlockedReason={blockingIssue ? `Lengkapi dulu: ${blockingIssue.message}` : null}
                    onConfirm={() => act("reject", "confirmed_duplicate")}
                    onKeepBoth={() => act("verify", "keep_both")}
                    onLater={() => act("save")}
                  />
                )}

                {/* 4b. Tindak lanjut: hanya setelah terverifikasi. Tidak memengaruhi hitungan. */}
                {existing?.status === "verified" && (
                  <section aria-labelledby="arrange-title" className="rounded-md border border-ok/40 bg-ok/5 p-3.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 id="arrange-title" className="text-sm font-bold">Tindak lanjut</h3>
                      {existing.followUp ? <Badge tone="ok" icon="ok">Bantuan diatur</Badge> : <Badge tone="neutral">Belum diatur</Badge>}
                      <InfoTip>Pelapor melihat catatan ini di halaman status. Tulis hanya yang benar-benar sudah diatur. Tidak memengaruhi hitungan.</InfoTip>
                    </div>
                    <label htmlFor="arrange-note" className="mt-2 block text-xs font-semibold text-muted">Catatan (opsional)</label>
                    <input
                      id="arrange-note"
                      className={`${inputClass} mt-1`}
                      value={arrangeNote}
                      maxLength={FOLLOW_UP_NOTE_MAX}
                      placeholder="Tim menuju lokasi, perkiraan 45 menit"
                      onChange={(e) => setArrangeNote(e.target.value)}
                    />
                    <Button variant="primary" className="mt-2" disabled={busy !== null || !api.arrangeAid} onClick={() => void arrange()}>
                      {busy === "arrange" ? "Menyimpan…" : existing.followUp ? "Perbarui catatan" : "Tandai bantuan diatur"}
                    </Button>
                  </section>
                )}

                {/* 5. Aksi */}
                {existing?.status !== "rejected" && (
                  <div className="border-t border-navy-700 pt-4">
                    {!dupReport && (
                      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          {existing && (confirmReject ? (
                            <div role="group" aria-label="Konfirmasi tolak laporan" className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="text-warn">Tolak? Tidak bisa dibatalkan.</span>
                              <Button variant="danger" onClick={() => act("reject")} disabled={disabled}>{busy === "reject" ? "Memproses…" : "Ya, tolak"}</Button>
                              <Button variant="ghost" onClick={() => setConfirmReject(false)} disabled={disabled}>Batal</Button>
                            </div>
                          ) : (
                            <Button variant="danger" onClick={() => setConfirmReject(true)} disabled={disabled}>Tolak</Button>
                          ))}
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Button onClick={() => act("save")} disabled={disabled}>{busy === "save" ? "Menyimpan…" : "Simpan nanti"}</Button>
                          <Button variant="primary" onClick={() => act("verify")} disabled={disabled || !!blockingIssue}>
                            {busy === "verify" ? "Memverifikasi…" : "Verifikasi"}
                          </Button>
                        </div>
                      </div>
                    )}
                    {!dupReport && blockingIssue && (
                      <p className="mt-2 text-sm text-danger">{blockingIssue.message}</p>
                    )}
                    <div className="mt-3"><InfoTip label="Aturan hitung">Hanya kebutuhan bertipe “Tambahan” dengan jumlah dan satuan jelas yang dijumlahkan. Sisanya tetap tercatat apa adanya.</InfoTip></div>
                  </div>
                )}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}

const ISSUE_STYLE: Record<Issue["level"], { icon: "critical" | "warning" | "ok"; cls: string; label: string }> = {
  critical: { icon: "critical", cls: "text-danger", label: "Wajib diperbaiki" },
  warning: { icon: "warning", cls: "text-warn", label: "Perhatian" },
  ok: { icon: "ok", cls: "text-ok", label: "Siap" },
};

/** Status validasi: setiap temuan memakai ikon + label teks, bukan hanya warna. */
function ValidationList({ issues }: { issues: Issue[] }) {
  return (
    <section aria-labelledby="valid-title">
      <h3 id="valid-title" className="mb-2 text-sm font-bold">Validasi</h3>
      <ul className="divide-y divide-navy-700 rounded-md border border-navy-700">
        {issues.map((i, idx) => {
          const st = ISSUE_STYLE[i.level];
          return (
            <li key={`${i.code}-${idx}`} className="flex items-start gap-2.5 px-3.5 py-2.5 text-sm">
              <Icon name={st.icon} size={16} className={`mt-0.5 ${st.cls}`} />
              <span><span className={`mr-1.5 text-xs font-bold uppercase ${st.cls}`}>{st.label}</span>{i.message}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Label sumber draf + ketidakpastian + temuan validasi bukti. */
function ExtractionNotice({ extraction, aiNote }: { extraction: ExtractionResult; aiNote: string | null }) {
  const nothingFound = !extraction.incidentType && !extraction.locationText && extraction.needs.length === 0;
  // Peringatan generik "bukan AI" sudah dijelaskan lewat lencana; tampilkan hanya temuan spesifik.
  const warnings = extraction.warnings.filter((w) => !w.startsWith("Ekstraksi berbasis aturan"));
  const hasIssues = extraction.uncertainties.length > 0 || warnings.length > 0;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-navy-700 bg-navy-850 px-3 py-2.5 text-xs">
        {extraction.source === "hybrid" ? (
          <Badge tone="accent" icon="sparkle">AI + aturan</Badge>
        ) : (
          <Badge tone="accent" icon="doc">Aturan, tanpa AI</Badge>
        )}
        <Badge tone="warn" icon="warning">Belum diverifikasi</Badge>
        <InfoTip>
          {extraction.source === "hybrid"
            ? "Dua pembaca membaca teks yang sama: aturan kode dan AI. Bila berbeda, nilai dikosongkan dan ditandai periksa. Yang tidak ditemukan tidak ditebak."
            : "Ekstraksi berbasis kata kunci. Yang tidak ditemukan dibiarkan kosong, tidak ditebak."}
        </InfoTip>
      </div>
      {aiNote && (
        <p role="status" className="flex items-start gap-2 rounded-md border border-warn/40 bg-warn/5 px-3 py-2 text-xs text-ink">
          <Icon name="warning" size={14} className="mt-0.5 text-warn" />
          AI tidak dipakai: {aiNote} Memakai aturan saja.
        </p>
      )}
      {extraction.checks && extraction.checks.length > 0 && (
        <div role="note" className="rounded-md border border-warn/40 bg-warn/5 px-3 py-3 text-sm">
          <p className="font-semibold text-warn">Periksa</p>
          <ul className="mt-1 space-y-1 text-ink">
            {extraction.checks.map((c) => (
              <li key={c.field}>
                {c.message}
                {(c.rules !== null || c.ai !== null) && (
                  <span className="block text-xs text-muted">Aturan: {c.rules ?? "tidak ada"} · AI: {c.ai ?? "tidak ada"}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {nothingFound && (
        <EmptyState tone="warn" icon="warning" role="status" title="Tidak ada temuan" body="Isi manual dari teks asli, atau tolak." />
      )}
      {extraction.occurredAtText && (
        <p className="text-xs text-muted">
          Waktu di teks: <span className="text-ink">“{extraction.occurredAtText}”</span>
        </p>
      )}
      {hasIssues && !nothingFound && (
        <div role="note" className="rounded-md border border-warn/40 bg-warn/5 px-3 py-3 text-sm">
          <p className="font-semibold text-warn">Catatan</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5 text-ink">
            {[...extraction.uncertainties, ...warnings].map((u) => <li key={u}>{u}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
