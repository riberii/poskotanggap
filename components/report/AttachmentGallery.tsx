import { Icon } from "@/components/ui/icons";
import type { Attachment } from "@/lib/domain/types";

const KIND_LABEL = { image: "Foto", video: "Video", file: "Berkas" } as const;
const sizeLabel = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** Lampiran pelapor. Gambar dan bingkai video dapat dibuka penuh; berkas dapat diunduh. */
export function AttachmentGallery({ items, onRemove }: { items: Attachment[]; onRemove?: (id: string) => void }) {
  if (items.length === 0) return null;
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {items.map((a) => (
        <li key={a.id} className="overflow-hidden rounded-md border border-navy-700 bg-white">
          {a.dataUrl && a.kind !== "file" ? (
            <a href={a.dataUrl} target="_blank" rel="noreferrer" aria-label={`Buka ${KIND_LABEL[a.kind].toLowerCase()} ${a.name}`}>
              <img src={a.dataUrl} alt={`${KIND_LABEL[a.kind]}: ${a.name}`} className="h-28 w-full bg-navy-800 object-cover" />
            </a>
          ) : (
            <div className="grid h-28 place-items-center bg-navy-850 text-muted">
              <Icon name={a.kind === "video" ? "video" : "doc"} size={28} />
            </div>
          )}
          <div className="flex items-start justify-between gap-1 p-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-ink" title={a.name}>{a.name}</p>
              <p className="text-xs text-subtle">
                {KIND_LABEL[a.kind]} · {sizeLabel(a.size)}
                {a.kind === "video" && a.dataUrl ? " · pratinjau" : ""}
              </p>
              {a.kind === "file" && a.dataUrl && (
                <a href={a.dataUrl} download={a.name} className="text-xs font-semibold text-teal-accent underline underline-offset-2">Unduh</a>
              )}
              {!a.dataUrl && <p className="text-xs text-warn">Isi berkas tidak tersimpan (terlalu besar).</p>}
            </div>
            {onRemove && (
              <button
                type="button"
                onClick={() => onRemove(a.id)}
                aria-label={`Hapus ${a.name}`}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-muted hover:bg-navy-800 hover:text-danger"
              >
                <Icon name="close" size={16} />
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
