import { STATUS_LABELS, type ReportStatus } from "@/lib/domain/types";
import type { Priority } from "@/lib/domain/aggregation";
import { Icon, type IconName } from "./icons";

type Tone = "ok" | "warn" | "dup" | "danger" | "neutral" | "accent";

const TONES: Record<Tone, string> = {
  ok: "border-ok/40 bg-ok/10 text-ok",
  warn: "border-warn/40 bg-warn/10 text-warn",
  dup: "border-dup/40 bg-dup/10 text-dup",
  danger: "border-danger/40 bg-danger/10 text-danger",
  neutral: "border-navy-600 bg-navy-800 text-muted",
  accent: "border-teal-accent/40 bg-teal-accent/10 text-teal-accent",
};

/** Lencana status: SELALU ikon + teks (tidak bergantung pada warna). */
export function Badge({ tone = "neutral", icon, children }: { tone?: Tone; icon?: IconName; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${TONES[tone]}`}>
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  );
}

const STATUS_TONE: Record<ReportStatus, { tone: Tone; icon: IconName }> = {
  verified: { tone: "ok", icon: "ok" },
  pending_review: { tone: "warn", icon: "warning" },
  rejected: { tone: "neutral", icon: "duplicate" },
};

export function StatusBadge({ status, resolution }: { status: ReportStatus; resolution?: string | null }) {
  const s = STATUS_TONE[status];
  const label = status === "rejected" && resolution === "confirmed_duplicate" ? "Duplikat (dikonfirmasi)" : STATUS_LABELS[status];
  return <Badge tone={s.tone} icon={s.icon}>{label}</Badge>;
}

const PRIORITY: Record<Priority, { tone: Tone; icon: IconName; label: string }> = {
  critical: { tone: "danger", icon: "critical", label: "Kritis" },
  warning: { tone: "warn", icon: "warning", label: "Peringatan" },
  ok: { tone: "ok", icon: "ok", label: "Tercukupi" },
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  const p = PRIORITY[priority];
  return <Badge tone={p.tone} icon={p.icon}>{p.label}</Badge>;
}
