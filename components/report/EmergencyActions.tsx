import { Icon } from "@/components/ui/icons";
import { emergencyActions, EMERGENCY_LABELS } from "@/lib/domain/insight";
import type { EmergencyService } from "@/lib/domain/types";

/** Tombol telepon (tel:) ke nomor layanan nasional + pencarian peta layanan terdekat dari lokasi laporan. */
export function EmergencyActions({ service, location }: { service: EmergencyService; location: string | null }) {
  const actions = emergencyActions(service, location);
  if (actions.length === 0) return null;
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
      {actions.map((a) => (
        <div key={a.key} className="flex flex-col gap-1">
          <a
            href={`tel:${a.number}`}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-danger px-4 py-2 text-sm font-bold text-white hover:opacity-90"
          >
            <Icon name="phone" size={18} />
            {a.label} ({a.number})
          </a>
          <a href={a.mapsUrl} target="_blank" rel="noreferrer" className="text-center text-xs font-semibold text-teal-accent underline underline-offset-2">
            Cari {EMERGENCY_LABELS[a.key].toLowerCase()} terdekat di peta
          </a>
        </div>
      ))}
    </div>
  );
}
