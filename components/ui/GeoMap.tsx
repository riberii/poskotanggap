import { formatCoords, mapsEmbedUrl, mapsOpenUrl, type GeoPoint } from "@/lib/domain/geo";
import { Icon } from "./icons";

/** Peta Google Maps tersemat (pin merah) + koordinat + tautan buka di Google Maps. Tanpa API key. */
export function GeoMap({ geo, height = 220 }: { geo: GeoPoint; height?: number }) {
  const coords = formatCoords(geo);
  return (
    <div className="overflow-hidden rounded-md border border-navy-700 bg-white">
      <iframe
        title={`Peta Google Maps di ${coords}`}
        src={mapsEmbedUrl(geo)}
        loading="lazy"
        referrerPolicy="no-referrer"
        style={{ height }}
        className="block w-full border-0"
      />
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-navy-700 px-3 py-2 text-sm">
        <span>
          <span className="font-mono font-semibold">{coords}</span>
          {geo.accuracyM !== null && <span className="ml-2 text-muted">akurasi ±{geo.accuracyM} m</span>}
        </span>
        <a
          href={mapsOpenUrl(geo)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-9 items-center gap-1.5 font-semibold text-teal-accent underline underline-offset-2"
        >
          <Icon name="pin" size={16} />Buka di Google Maps
        </a>
      </div>
    </div>
  );
}
