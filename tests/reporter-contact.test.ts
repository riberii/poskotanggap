// Kontak pelapor: opsional, divalidasi, tersimpan untuk tim, dan tidak memengaruhi hitungan.
import { describe, expect, it } from "vitest";
import { SAMPLE_REPORTS } from "@/components/intake/samples";
import { draftFromExtraction, draftToPayload } from "@/components/intake/draft";
import { createLocalBackend } from "@/lib/data/local-backend";
import { type KeyValueStorage } from "@/lib/data/local-storage-repository";
import { reporterContactSchema } from "@/lib/domain/reporter";
import { sanitizeIncoming } from "@/lib/server/sync-core";

const mem = (): KeyValueStorage => {
  const d = new Map<string, string>();
  return { getItem: (k) => d.get(k) ?? null, setItem: (k, v) => void d.set(k, v), removeItem: (k) => void d.delete(k) };
};

describe("kontak pelapor", () => {
  it("menerima kosong, menormalkan string kosong ke null, menolak format salah", () => {
    expect(reporterContactSchema.parse({ name: "", email: " ", phone: "" })).toEqual({ name: null, email: null, phone: null });
    expect(reporterContactSchema.parse({ name: "Siti Aminah", email: "siti@contoh.id", phone: "0812 3456 7890" }).phone).toBe("0812 3456 7890");
    expect(reporterContactSchema.safeParse({ name: "S", email: null, phone: null }).success).toBe(false);
    expect(reporterContactSchema.safeParse({ name: null, email: "bukan-email", phone: null }).success).toBe(false);
    expect(reporterContactSchema.safeParse({ name: null, email: null, phone: "abc" }).success).toBe(false);
  });

  it("tersimpan pada laporan dan tidak ada bila semua kosong", async () => {
    const api = createLocalBackend(mem());
    const text = SAMPLE_REPORTS[0].text;
    const ex = await api.extract(text);
    if (!ex.ok) throw new Error("extract");
    const payload = draftToPayload(draftFromExtraction(ex.data.extraction));
    const res = await api.submitReport(text, payload, "save", ex.data.extraction, { reporter: { name: "Siti Aminah", email: null, phone: "081234567890" } });
    if (!res.ok) throw new Error(res.error.message);
    expect(res.data.report.reporter).toEqual({ name: "Siti Aminah", email: null, phone: "081234567890" });

    const api2 = createLocalBackend(mem());
    const text2 = SAMPLE_REPORTS[3].text;
    const ex2 = await api2.extract(text2);
    if (!ex2.ok) throw new Error("extract");
    const r2 = await api2.submitReport(text2, draftToPayload(draftFromExtraction(ex2.data.extraction)), "save", ex2.data.extraction, { reporter: { name: null, email: null, phone: null } });
    if (!r2.ok) throw new Error(r2.error.message);
    expect(r2.data.report.reporter).toBeNull();
  });

  it("lolos sanitasi server (tetap dibawa ke antrean tim)", () => {
    const base = {
      id: crypto.randomUUID(), rawText: "Banjir, butuh air", submittedAt: new Date().toISOString(), incidentType: null, locationText: null,
      normalizedArea: null, status: "pending_review", fingerprint: "a".repeat(64), duplicateOf: null, extraction: null,
      createdAt: new Date().toISOString(), verifiedAt: null, needs: [],
    };
    const ok = sanitizeIncoming({ ...base, reporter: { name: "Budi", email: "b@x.id", phone: null } });
    expect(ok.ok && ok.report.reporter?.email).toBe("b@x.id");
    expect(sanitizeIncoming({ ...base, reporter: { name: "Budi", email: "salah", phone: null } }).ok).toBe(false);
  });
});
