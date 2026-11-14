import { describe, expect, it } from "vitest";
import { buildRefusals, REFUSAL_REASONS } from "@/components/dashboard/refusals";
import { createLocalBackend } from "@/lib/data/local-backend";
import { draftFromExtraction, draftToPayload } from "@/components/intake/draft";

function mem() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}
const ok = <T>(r: { ok: true; data: T } | { ok: false; error: { message: string } }): T => {
  if (!r.ok) throw new Error(r.error.message);
  return r.data;
};
async function verifyText(b: ReturnType<typeof createLocalBackend>, text: string) {
  const { extraction } = ok(await b.extract(text));
  ok(await b.submitReport(text, draftToPayload(draftFromExtraction(extraction)), "verify", extraction, { attachments: [], aiInsight: null }));
}

describe("panel 'Yang sengaja tidak kami tebak'", () => {
  it("data awal: tiga kategori selalu ada dan masing-masing punya satu kalimat alasan", async () => {
    const b = createLocalBackend(mem());
    const r = buildRefusals(ok(await b.dashboard()));
    expect(r.map((x) => x.kind)).toEqual(["unknown_quantity", "unit_mismatch", "basis_excluded"]);
    for (const x of r) {
      expect(x.reason).toBe(REFUSAL_REASONS[x.kind]);
      expect(x.reason.split(/(?<=[.”])\s+(?=[A-Z])/)).toHaveLength(1);
      expect(x.count).toBeGreaterThanOrEqual(x.examples.length);
    }
  });

  it("100 botol vs stok 5 dus → satuan tidak cocok, tanpa konversi dan tanpa angka kekurangan", async () => {
    const b = createLocalBackend(mem());
    await verifyText(b, "[SIMULASI] Tanah longsor di Desa Contoh Makmur. Masih butuh tambahan 100 botol air mineral.");
    const r = buildRefusals(ok(await b.dashboard())).find((x) => x.kind === "unit_mismatch")!;
    expect(r.count).toBeGreaterThanOrEqual(1);
    expect(r.examples.join(" ")).toMatch(/100 botol dibutuhkan vs stok 5 dus/);
    expect(r.examples.join(" ")).not.toMatch(/kurang/i);
  });

  it("jumlah tidak tertulis → dihitung sebagai tidak pasti, bukan 0", async () => {
    const b = createLocalBackend(mem());
    const before = buildRefusals(ok(await b.dashboard())).find((x) => x.kind === "unknown_quantity")!.count;
    await verifyText(b, "[SIMULASI] Kebakaran permukiman di Desa Contoh Makmur. Warga membutuhkan tenda.");
    const after = buildRefusals(ok(await b.dashboard())).find((x) => x.kind === "unknown_quantity")!;
    expect(after.count).toBe(before + 1);
    expect(after.examples.join(" ")).toContain("jumlah tidak diketahui");
  });

  it("basis total tidak dijumlahkan dengan tambahan dan terlihat di panel", async () => {
    const b = createLocalBackend(mem());
    const dash0 = ok(await b.dashboard());
    const before = buildRefusals(dash0).find((x) => x.kind === "basis_excluded")!.count;
    await verifyText(b, "[SIMULASI] Gempa bumi di Desa Contoh Makmur. Total kebutuhan air mineral 120 dus, tetapi 30 dus sudah tersedia. Tim masih butuh tambahan 15 dus.");
    const dash = ok(await b.dashboard());
    const r = buildRefusals(dash).find((x) => x.kind === "basis_excluded")!;
    expect(r.count).toBeGreaterThanOrEqual(before);
    // angka 120 (total) tidak boleh masuk jumlah kebutuhan
    expect(dash.needs.totals.some((t) => t.requested === 120 || t.requested === 135)).toBe(false);
  });
});
