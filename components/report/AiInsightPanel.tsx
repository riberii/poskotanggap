import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/icons";
import { AUTHENTICITY_LABELS, EMERGENCY_LABELS } from "@/lib/domain/insight";
import type { AiInsight, AuthenticityLevel } from "@/lib/domain/types";
import { EmergencyActions } from "./EmergencyActions";

const LEVEL: Record<AuthenticityLevel, { tone: "ok" | "warn" | "danger"; icon: "ok" | "warning" | "critical" }> = {
  wajar: { tone: "ok", icon: "ok" },
  perlu_dicek: { tone: "warn", icon: "warning" },
  mencurigakan: { tone: "danger", icon: "critical" },
};

const H = "text-xs font-bold uppercase tracking-wide text-muted";

/** Saran AI untuk tim. Selalu berlabel "saran": tidak dihitung, tidak memverifikasi. */
export function AiInsightPanel({ insight, location }: { insight: AiInsight | null | undefined; location: string | null }) {
  if (!insight) {
    return (
      <p className="rounded-md border border-navy-700 bg-navy-850 px-3 py-2.5 text-sm text-muted">
        Tidak ada saran AI untuk laporan ini. Periksa teks asli dan lampiran secara manual.
      </p>
    );
  }
  const lv = LEVEL[insight.authenticity.level];
  return (
    <div className="space-y-4 rounded-md border border-navy-700 bg-navy-850 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="accent" icon="sparkle">Saran AI</Badge>
        <Badge tone={lv.tone} icon={lv.icon}>{AUTHENTICITY_LABELS[insight.authenticity.level]}</Badge>
        {insight.language && <Badge tone="neutral">Bahasa: {insight.language}</Badge>}
      </div>

      <div>
        <h4 className={H}>Ringkasan</h4>
        <p className="mt-1 text-sm leading-relaxed text-ink">{insight.summary}</p>
      </div>

      {insight.translation && (
        <div>
          <h4 className={H}>Terjemahan ke Indonesia</h4>
          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink">{insight.translation}</p>
        </div>
      )}

      {insight.mediaDescription && (
        <div>
          <h4 className={H}>Isi foto / video</h4>
          <p className="mt-1 text-sm leading-relaxed text-ink">{insight.mediaDescription}</p>
        </div>
      )}

      <div>
        <h4 className={H}>Keaslian laporan</h4>
        {insight.authenticity.reasons.length > 0 ? (
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-ink">
            {insight.authenticity.reasons.map((r) => <li key={r}>{r}</li>)}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-muted">Tidak ada alasan yang diberikan.</p>
        )}
      </div>

      {insight.suggestions.length > 0 && (
        <div>
          <h4 className={H}>Saran langkah untuk tim</h4>
          <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-sm text-ink">
            {insight.suggestions.map((r) => <li key={r}>{r}</li>)}
          </ol>
        </div>
      )}

      <div className="rounded-md border border-navy-700 bg-white p-3">
        <h4 className={H}>Layanan darurat</h4>
        <p className="mt-1 text-sm font-semibold text-ink">{EMERGENCY_LABELS[insight.emergency.service]}</p>
        {insight.emergency.reason && <p className="text-sm text-muted">{insight.emergency.reason}</p>}
        <div className="mt-2"><EmergencyActions service={insight.emergency.service} location={location} /></div>
      </div>

      <p className="flex items-start gap-1.5 text-xs text-subtle">
        <Icon name="info" size={14} className="mt-0.5" />
        AI bisa keliru. Ini hanya saran dan tidak ikut dihitung di rekap. Keputusan tetap di operator.
      </p>
    </div>
  );
}
