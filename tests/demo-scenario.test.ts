import { describe, expect, it } from "vitest";
import { DEMO_REPORT_LOCATION, DEMO_REPORT_TEXT } from "@/components/demo/scenario";
import { draftFromExtraction, draftFromReport, draftToPayload } from "@/components/intake/draft";
import { createLocalBackend, type LocalBackend } from "@/lib/data/local-backend";
import { followUpStage, reportCode } from "@/lib/domain/follow-up";

function memoryStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}
const ok = <T>(r: { ok: true; data: T } | { ok: false; error: { message: string } }): T => {
  if (!r.ok) throw new Error(r.error.message);
  return r.data;
};

/** Menjalankan persis jalur yang dipakai halaman pelapor & operator pada /demo. */
async function sendAsReporter(b: LocalBackend) {
  const text = `Lokasi: ${DEMO_REPORT_LOCATION}. ${DEMO_REPORT_TEXT}`;
  const { extraction } = ok(await b.extract(text));
  const res = ok(await b.submitReport(text, draftToPayload(draftFromExtraction(extraction)), "save", extraction, { attachments: [], aiInsight: null }));
  return { report: res.report, extraction };
}

describe("skenario /demo", () => {
  it("laporan contoh diekstraksi dengan bukti persis dari teks (tanpa tebakan)", async () => {
    const b = createLocalBackend(memoryStorage());
    const { extraction } = ok(await b.extract(`Lokasi: ${DEMO_REPORT_LOCATION}. ${DEMO_REPORT_TEXT}`));
    expect(extraction.source).toBe("simulated_rules");
    expect(extraction.incidentType).toBe("banjir");
    expect(extraction.locationText).toBeTruthy();
    const byItem = Object.fromEntries(extraction.needs.map((n) => [n.item, n]));
    expect(byItem["air mineral"]).toMatchObject({ quantity: 20, unit: "dus", quantityBasis: "additional" });
    expect(byItem["selimut"]).toMatchObject({ quantity: 30, unit: "lembar", quantityBasis: "additional" });
    for (const n of extraction.needs) expect(DEMO_REPORT_TEXT.replace(/\s+/g, " ")).toContain(n.evidenceQuote!);
  });

  it("kirim → antre → verifikasi → bantuan diatur → status pelapor berubah", async () => {
    const b = createLocalBackend(memoryStorage());
    b.reset();
    const { report } = await sendAsReporter(b);
    const code = reportCode(report.id);
    expect(report.status).not.toBe("verified");
    expect(report.duplicateOf).toBeNull(); // data demo tidak boleh memicu potensi duplikat
    expect(ok(await b.reviewQueue()).reports.map((r) => r.id)).toContain(report.id);
    expect(ok(await b.getReportStatus(code)).stage).toBe("received");

    const full = ok(await b.getReport(report.id)).report;
    ok(await b.reviewReport(report.id, draftToPayload(draftFromReport(full)), "verify"));
    expect(ok(await b.getReportStatus(code)).stage).toBe("verified");
    expect(ok(await b.reviewQueue()).reports.map((r) => r.id)).not.toContain(report.id);

    const arranged = ok(await b.arrangeAid(report.id, "[SIMULASI] Tim menuju lokasi"));
    expect(followUpStage(arranged.report)).toBe("arranged");
    expect(ok(await b.getReportStatus(code)).stage).toBe("arranged");
  });

  it("skenario bisa diulang setelah reset (tidak terblokir duplikat persis)", async () => {
    const b = createLocalBackend(memoryStorage());
    for (let i = 0; i < 2; i++) {
      b.reset();
      const { report } = await sendAsReporter(b);
      expect(report.id).toBeTruthy();
    }
  });
});
