import { useState } from "react";
import { useDataMode } from "@/components/DataModeProvider";
import { UNITS } from "@/lib/domain/types";
import { Button, Field, inputClass } from "@/components/ui/form";

/** Menetapkan jumlah stok (bukan menambah). Validasi final di server. */
export function InventoryForm({ onSaved }: { onSaved?: () => void }) {
  const { api } = useDataMode();
  const [form, setForm] = useState({ area: "", item: "", unit: "", quantity: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = Number(form.quantity.replace(",", "."));
    if (form.quantity.trim() === "" || !Number.isFinite(q) || q < 0) {
      setMsg({ ok: false, text: "Jumlah stok harus angka ≥ 0." });
      return;
    }
    setBusy(true);
    const res = await api.upsertInventory({ area: form.area, item: form.item, unit: form.unit, availableQuantity: q });
    setBusy(false);
    if (!res.ok) {
      const details = Array.isArray(res.error.details)
        ? (res.error.details as Array<{ message: string }>).map((d) => d.message).join("; ")
        : "";
      setMsg({ ok: false, text: details ? `${res.error.message} ${details}` : res.error.message });
      return;
    }
    setMsg({ ok: true, text: "Stok diperbarui." });
    setForm({ area: "", item: "", unit: "", quantity: "" });
    onSaved?.();
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-md border border-navy-700 bg-navy-850 p-4" noValidate>
      <h3 className="text-sm font-medium">Perbarui stok</h3>
      <p className="text-xs text-subtle">Jumlah baru menggantikan stok sebelumnya untuk area, barang, dan satuan yang sama.</p>
      <Field label="Area" htmlFor="inv-area">
        <input id="inv-area" required maxLength={200} className={inputClass} value={form.area}
          onChange={(e) => setForm({ ...form, area: e.target.value })} />
      </Field>
      <Field label="Barang" htmlFor="inv-item">
        <input id="inv-item" required maxLength={80} className={inputClass} value={form.item}
          onChange={(e) => setForm({ ...form, item: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Satuan" htmlFor="inv-unit">
          <select id="inv-unit" required className={inputClass} value={form.unit}
            onChange={(e) => setForm({ ...form, unit: e.target.value })}>
            <option value="">Pilih</option>
            {UNITS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </Field>
        <Field label="Tersedia" htmlFor="inv-qty">
          <input id="inv-qty" required inputMode="decimal" className={`${inputClass} font-mono`} value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
        </Field>
      </div>
      {msg && (
        <p role="status" className={`text-xs ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</p>
      )}
      <Button type="submit" variant="primary" disabled={busy || !form.area.trim() || !form.item.trim() || !form.unit} className="w-full">
        {busy ? "Menyimpan…" : "Simpan stok"}
      </Button>
    </form>
  );
}
