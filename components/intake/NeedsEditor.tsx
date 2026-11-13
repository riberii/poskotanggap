"use client";

import { BASIS_LABELS, QUANTITY_BASES, UNITS, type QuantityBasis, type Unit } from "@/lib/domain/types";
import { Badge } from "@/components/ui/Badge";
import { Button, Evidence, inputClass } from "@/components/ui/form";
import { newKey, type DraftNeed } from "./draft";

export function NeedsEditor({
  needs,
  onChange,
  errors,
  disabled,
  onActive,
}: {
  needs: DraftNeed[];
  onActive?: (quote: string | null) => void;
  onChange: (needs: DraftNeed[]) => void;
  errors: Record<string, string>;
  disabled?: boolean;
}) {
  const update = (key: string, patch: Partial<DraftNeed>) =>
    onChange(needs.map((n) => (n.key === key ? { ...n, ...patch } : n)));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-ink">Kebutuhan <span className="font-normal text-muted">({needs.length})</span></h3>
        <Button
          variant="ghost"
          disabled={disabled}
          onClick={() =>
            onChange([
              ...needs,
              { key: newKey(), item: "", quantity: "", unit: "", quantityBasis: "unknown", evidenceQuote: null },
            ])
          }
          className="px-2 py-1 text-xs"
        >
          + Tambah
        </Button>
      </div>

      {needs.length === 0 && (
        <p className="rounded-md border border-dashed border-navy-600 px-3 py-4 text-center text-sm text-muted">
          Tidak ada kebutuhan dikenali. Tambah manual.
        </p>
      )}

      <ul className="space-y-3">
        {needs.map((n, i) => {
          const id = `need-${n.key}`;
          return (
            <li
              key={n.key}
              className="rounded-md border border-navy-700 bg-navy-850 p-3.5"
              onMouseEnter={() => onActive?.(n.evidenceQuote)}
              onMouseLeave={() => onActive?.(null)}
              onFocus={() => onActive?.(n.evidenceQuote)}
              onBlur={() => onActive?.(null)}
            >
              <div className="grid grid-cols-2 gap-3 md:grid-cols-12">
                <div className="col-span-2 md:col-span-4">
                  <label htmlFor={`${id}-item`} className="mb-1 block text-xs text-muted">
                    Barang
                  </label>
                  <input
                    id={`${id}-item`}
                    className={inputClass}
                    value={n.item}
                    disabled={disabled}
                    maxLength={80}
                    onChange={(e) => update(n.key, { item: e.target.value })}
                    aria-invalid={!!errors[`needs.${i}.item`]}
                  />
                  <FieldError msg={errors[`needs.${i}.item`]} />
                </div>
                <div className="md:col-span-2">
                  <label htmlFor={`${id}-qty`} className="mb-1 block text-xs text-muted">
                    Jumlah
                  </label>
                  <input
                    id={`${id}-qty`}
                    className={`${inputClass} font-mono`}
                    inputMode="decimal"
                    placeholder="tidak diketahui"
                    value={n.quantity}
                    disabled={disabled}
                    onChange={(e) => update(n.key, { quantity: e.target.value })}
                    aria-invalid={!!errors[`needs.${i}.quantity`]}
                  />
                  <FieldError msg={errors[`needs.${i}.quantity`]} />
                </div>
                <div className="md:col-span-2">
                  <label htmlFor={`${id}-unit`} className="mb-1 block text-xs text-muted">
                    Satuan
                  </label>
                  <select
                    id={`${id}-unit`}
                    className={inputClass}
                    value={n.unit}
                    disabled={disabled}
                    onChange={(e) => update(n.key, { unit: e.target.value as Unit | "" })}
                    aria-invalid={!!errors[`needs.${i}.unit`]}
                  >
                    <option value="">— tidak diketahui —</option>
                    {UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                  <FieldError msg={errors[`needs.${i}.unit`]} />
                </div>
                <div className="md:col-span-3">
                  <label htmlFor={`${id}-basis`} className="mb-1 block text-xs text-muted">
                    Jenis jumlah
                  </label>
                  <select
                    id={`${id}-basis`}
                    className={inputClass}
                    value={n.quantityBasis}
                    disabled={disabled}
                    onChange={(e) => update(n.key, { quantityBasis: e.target.value as QuantityBasis })}
                  >
                    {QUANTITY_BASES.map((b) => (
                      <option key={b} value={b}>
                        {BASIS_LABELS[b]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end md:col-span-1">
                  <Button
                    variant="ghost"
                    disabled={disabled}
                    onClick={() => onChange(needs.filter((x) => x.key !== n.key))}
                    className="w-full px-2 text-xs"
                    aria-label={`Hapus kebutuhan ${n.item || i + 1}`}
                  >
                    Hapus
                  </Button>
                </div>
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                {n.quantity.trim() === "" && <Badge tone="warn" icon="unknown">Jumlah: tidak diketahui</Badge>}
                {n.unit === "" && <Badge tone="neutral" icon="unknown">Satuan: tidak diketahui</Badge>}
                {n.quantityBasis !== "additional" && <Badge tone="warn" icon="warning">Tidak dihitung: {BASIS_LABELS[n.quantityBasis]}</Badge>}
              </div>
              <div className="mt-2">
                <Evidence quote={n.evidenceQuote} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function FieldError({ msg }: { msg?: string }) {
  return msg ? (
    <p role="alert" className="mt-1 text-xs text-danger">
      {msg}
    </p>
  ) : null;
}
