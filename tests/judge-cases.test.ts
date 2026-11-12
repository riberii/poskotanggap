// Kasus demo A–E dan perilaku prioritas/duplikat/unknown/unit mismatch (deterministik, tanpa AI).
import { describe, expect, it } from "vitest";
import { createLocalBackend } from "@/lib/data/local-backend";
import type { KeyValueStorage } from "@/lib/data/local-storage-repository";
import { draftFromExtraction, draftToPayload } from "@/components/intake/draft";
import { SAMPLE_REPORTS } from "@/components/intake/samples";
import { buildAttention } from "@/components/dashboard/attention";
import { describeImpact, highlightSegments, validateDraft } from "@/components/intake/validation";
import { priorityOf, sortByPriority, type DashboardSummary } from "@/lib/domain/aggregation";

function memoryStorage(): KeyValueStorage {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

const sample = (prefix: string) => SAMPLE_REPORTS.find((s) => s.label.startsWith(`${prefix} ·`))!;

async function analyze(api: ReturnType<typeof createLocalBackend>, text: string) {
  const ex = await api.extract(text);
  if (!ex.ok) throw new Error(ex.error.message);
  return { extraction: ex.data.extraction, payload: draftToPayload(draftFromExtraction(ex.data.extraction)) };
}
async function dash(api: ReturnType<typeof createLocalBackend>): Promise<DashboardSummary> {
  const d = await api.dashboard();
  if (!d.ok) throw new Error(d.error.message);
  return d.data;
}

describe("kasus demo", () => {
  it("A: laporan normal → kekurangan KRITIS dihitung dari stok 5 dus", async () => {
    const api = createLocalBackend(memoryStorage());
    const { extraction, payload } = await analyze(api, sample("A").text);
    const res = await api.submitReport(sample("A").text, payload, "verify", extraction);
    if (!res.ok) throw new Error(res.error.message);
    const d = await dash(api);
    const row = d.shortages.find((r) => r.area === "contoh makmur" && r.item === "air mineral" && r.unit === "dus")!;
    expect(row).toMatchObject({ requested: 20, available: 5, shortage: 15, status: "shortage" });
    expect(priorityOf(row)).toBe("critical");
    expect(buildAttention(d).some((i) => i.severity === "critical" && i.title.includes("kurang 15 dus") && i.detail!.includes("20 dus dibutuhkan") && i.detail!.includes("5 dus tersedia"))).toBe(true);
    expect(describeImpact(res.data.report, d).join(" ")).toContain("KURANG 15");
  });

  it("B: jumlah tidak diketahui tetap null, tidak jadi 0, dan muncul sebagai unresolved", async () => {
    const api = createLocalBackend(memoryStorage());
    const { extraction, payload } = await analyze(api, sample("B").text);
    expect(payload.needs[0]).toMatchObject({ item: "tenda", quantity: null, unit: null });
    const res = await api.submitReport(sample("B").text, payload, "verify", extraction);
    if (!res.ok) throw new Error(res.error.message);
    expect(res.data.report.needs[0].quantity).toBeNull();
    const d = await dash(api);
    expect(d.needs.unresolved.some((u) => u.item === "tenda" && u.area === "contoh makmur" && u.quantity === null)).toBe(true);
    expect(d.shortages.some((r) => r.area === "contoh makmur" && r.item === "tenda")).toBe(false);
  });

  it("C: potensi duplikat ditandai (tidak dihapus); konfirmasi → ditolak & tidak dihitung", async () => {
    const api = createLocalBackend(memoryStorage());
    const before = await dash(api);
    const { extraction, payload } = await analyze(api, sample("C").text);
    const dup = await api.findDuplicate!({ locationText: payload.locationText, incidentType: payload.incidentType });
    expect(dup.ok && dup.data.duplicateOfReport?.id).toBe("00000000-0000-4000-8000-000000000001");
    // verifikasi langsung ditolak server sampai operator memutuskan
    const blocked = await api.submitReport(sample("C").text, payload, "verify", extraction);
    expect(blocked.ok).toBe(false);
    const confirmed = await api.submitReport(sample("C").text, { ...payload, duplicateResolution: "confirmed_duplicate" }, "reject", extraction);
    if (!confirmed.ok) throw new Error(confirmed.error.message);
    expect(confirmed.data.report).toMatchObject({ status: "rejected", duplicateResolution: "confirmed_duplicate" });
    const after = await dash(api);
    expect(after.needs.totals).toEqual(before.needs.totals); // tidak double-count
    expect(after.counts.rejected).toBe(before.counts.rejected + 1);
    expect(after.totalReports).toBe(before.totalReports + 1); // data tidak dihapus
  });

  it("C: pertahankan keduanya → terverifikasi dengan resolusi keep_both", async () => {
    const api = createLocalBackend(memoryStorage());
    const { extraction, payload } = await analyze(api, sample("C").text);
    const res = await api.submitReport(sample("C").text, { ...payload, duplicateReviewed: true, duplicateResolution: "keep_both" }, "verify", extraction);
    if (!res.ok) throw new Error(res.error.message);
    expect(res.data.report).toMatchObject({ status: "verified", duplicateResolution: "keep_both" });
    const d = await dash(api);
    expect(d.counts.potentialDuplicates).toBe(1); // hanya seed #3 yang masih menunggu keputusan
  });

  it("konfirmasi duplikat tanpa acuan duplikat ditolak", async () => {
    const api = createLocalBackend(memoryStorage());
    const { payload } = await analyze(api, sample("B").text);
    const res = await api.submitReport(sample("B").text, { ...payload, duplicateResolution: "confirmed_duplicate" }, "reject", null);
    expect(res.ok).toBe(false);
  });

  it("D: 100 botol vs stok 5 dus → UNIT MISMATCH, tanpa konversi dan tanpa kekurangan", async () => {
    const api = createLocalBackend(memoryStorage());
    const { extraction, payload } = await analyze(api, sample("D").text);
    expect(payload.needs[0]).toMatchObject({ item: "air mineral", quantity: 100, unit: "botol", quantityBasis: "additional" });
    // peringatan muncul sebelum verifikasi
    const d0 = await dash(api);
    const issues = validateDraft(draftFromExtraction(extraction), { inventory: d0.inventory, hasDuplicate: false });
    expect(issues.some((i) => i.code === "unit_mismatch")).toBe(true);
    const res = await api.submitReport(sample("D").text, payload, "verify", extraction);
    if (!res.ok) throw new Error(res.error.message);
    const d = await dash(api);
    const row = d.shortages.find((r) => r.area === "contoh makmur" && r.unit === "botol")!;
    expect(row).toMatchObject({ status: "unit_mismatch", shortage: null, available: null, requested: 100 });
    expect(row.otherStock).toEqual([{ unit: "dus", quantity: 5 }]);
    expect(priorityOf(row)).toBe("warning");
  });

  it("E: laporan tidak lengkap tidak bisa diverifikasi dan validasi menandai field wajib", async () => {
    const api = createLocalBackend(memoryStorage());
    const { extraction, payload } = await analyze(api, sample("E").text);
    const issues = validateDraft(draftFromExtraction(extraction), { inventory: [], hasDuplicate: false });
    expect(issues.some((i) => i.code === "location_missing" && i.blocking)).toBe(true);
    expect(issues.some((i) => i.code === "qty_unknown")).toBe(true);
    const res = await api.submitReport(sample("E").text, payload, "verify", extraction);
    expect(res.ok).toBe(false);
  });
});

describe("prioritas & utilitas", () => {
  it("sortByPriority: critical → warning → ok", async () => {
    const api = createLocalBackend(memoryStorage());
    const d = await dash(api);
    const order = sortByPriority(d.shortages).map(priorityOf);
    const rank = { critical: 0, warning: 1, ok: 2 } as const;
    expect([...order].sort((a, b) => rank[a] - rank[b])).toEqual(order);
    expect(order[0]).toBe("critical");
  });

  it("dashboard seed: attention berurutan KRITIS → PERINGATAN → INFORMASI", async () => {
    const d = await dash(createLocalBackend(memoryStorage()));
    const sev = buildAttention(d).map((i) => i.severity);
    const rank = { critical: 0, warning: 1, info: 2 } as const;
    expect([...sev].sort((a, b) => rank[a] - rank[b])).toEqual(sev);
    expect(d.needs.unresolved.some((u) => u.item === "tenda" && u.quantity === null)).toBe(true);
  });

  it("highlightSegments menyorot kutipan persis dan menggabungkan tumpang tindih", () => {
    const segs = highlightSegments("A b c. D e f.", ["b c.", "c. D", "tidak ada"]);
    expect(segs.map((s) => s.text).join("")).toBe("A b c. D e f.");
    expect(segs.filter((s) => s.evidence).map((s) => s.text)).toEqual(["b c. D"]);
  });
});

describe("lampiran & saran AI (penasihat)", () => {
  const insight = {
    summary: "Banjir, warga butuh air minum.",
    mediaDescription: null,
    language: "Jawa",
    translation: "Banjir di desa.",
    authenticity: { level: "perlu_dicek" as const, reasons: ["Tidak ada foto."] },
    suggestions: ["Hubungi pelapor."],
    emergency: { service: "damkar" as const, reason: "Ada api." },
    model: "test",
    createdAt: new Date().toISOString(),
  };

  it("disimpan bersama laporan, tetapi tidak memengaruhi hitungan", async () => {
    const api = createLocalBackend(memoryStorage());
    const { extraction, payload } = await analyze(api, sample("A").text);
    const before = await dash(api);
    const att = { id: "a1", kind: "image" as const, name: "f.jpg", mime: "image/jpeg", size: 10, dataUrl: "data:image/jpeg;base64,AAAA" };
    const res = await api.submitReport(sample("A").text, payload, "save", extraction, { attachments: [att], aiInsight: insight });
    if (!res.ok) throw new Error(res.error.message);
    expect(res.data.report.attachments).toHaveLength(1);
    expect(res.data.report.aiInsight?.language).toBe("Jawa");
    const after = await dash(api);
    expect(after.needs.totals).toEqual(before.needs.totals);
    expect(after.shortages).toEqual(before.shortages);
    expect(buildAttention(after).some((i) => i.id.startsWith("emg-"))).toBe(true);
  });

  it("menolak lampiran yang bukan data URL", async () => {
    const api = createLocalBackend(memoryStorage());
    const { extraction, payload } = await analyze(api, sample("A").text);
    const bad = { id: "a1", kind: "image" as const, name: "f.jpg", mime: "image/jpeg", size: 10, dataUrl: "https://evil.example/x.jpg" };
    const res = await api.submitReport(sample("A").text, payload, "save", extraction, { attachments: [bad] });
    expect(res.ok).toBe(false);
  });
});
