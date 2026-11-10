import { STATUS_LABELS, type ReportStatus } from "@/lib/domain/types";

type Tone = "ok" | "warn" | "dup" | "danger" | "neutral" | "accent";

const TONES: Record<Tone, string> = {
  ok: "border-ok/50 bg-ok/10 text-ok",
  warn: "border-warn/50 bg-warn/10 text-warn",
  dup: "border-dup/50 bg-dup/10 text-dup",
  danger: "border-danger/50 bg-danger/10 text-danger",
  neutral: "border-navy-600 bg-navy-800 text-muted",
  accent: "border-teal-accent/50 bg-teal-accent/10 text-teal-strong",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded border px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

const STATUS_TONE: Record<ReportStatus, Tone> = {
  verified: "ok",
  pending_review: "warn",
  rejected: "neutral",
};

export function StatusBadge({ status }: { status: ReportStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABELS[status]}</Badge>;
}
