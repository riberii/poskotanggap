import { z } from "zod";

/** Titik GPS dari perangkat pelapor. Hanya informasi lokasi: tidak dibaca oleh agregasi kebutuhan. */
export interface GeoPoint {
  lat: number;
  lng: number;
  /** Radius akurasi dari browser, meter. null bila tidak dilaporkan. */
  accuracyM: number | null;
  capturedAt: string;
}

export const geoSchema = z
  .object({
    lat: z.number().finite().min(-90).max(90),
    lng: z.number().finite().min(-180).max(180),
    accuracyM: z.number().finite().min(0).max(1_000_000).nullable(),
    capturedAt: z.string().datetime({ offset: true }),
  })
  .strict();

/** Bulatkan ke 6 desimal (~0,1 m); lebih presisi dari itu hanya noise. */
export const roundCoord = (n: number) => Math.round(n * 1e6) / 1e6;

/** "-6.200000, 106.816666" — titik desimal, selalu sama di semua locale. */
export const formatCoords = (g: Pick<GeoPoint, "lat" | "lng">) => `${g.lat.toFixed(6)}, ${g.lng.toFixed(6)}`;

/** Tautan resmi Google Maps URLs (tanpa API key): membuka Google Maps dengan pin di titik tsb. */
export const mapsOpenUrl = (g: Pick<GeoPoint, "lat" | "lng">) =>
  `https://www.google.com/maps/search/?api=1&query=${g.lat.toFixed(6)}%2C${g.lng.toFixed(6)}`;

/** Peta tersemat tanpa API key; Google menampilkan pin merah di titik query. */
export const mapsEmbedUrl = (g: Pick<GeoPoint, "lat" | "lng">, zoom = 16) =>
  `https://maps.google.com/maps?q=${g.lat.toFixed(6)},${g.lng.toFixed(6)}&z=${zoom}&output=embed`;

export function makeGeoPoint(lat: number, lng: number, accuracy: number | null | undefined, now: Date = new Date()): GeoPoint {
  return {
    lat: roundCoord(lat),
    lng: roundCoord(lng),
    accuracyM: typeof accuracy === "number" && Number.isFinite(accuracy) ? Math.round(accuracy) : null,
    capturedAt: now.toISOString(),
  };
}
