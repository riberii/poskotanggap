// Status tindak lanjut (received → verified → arranged): hanya informasi untuk pelapor,
// tidak boleh memengaruhi perhitungan kebutuhan/kekurangan.
import { describe, expect, it } from "vitest";
import { SAMPLE_REPORTS } from "@/components/intake/samples";
import { draftFromExtraction, draftToPayload } from "@/components/intake/draft";
import { createLocalBackend, type LocalBackend } from "@/lib/data/local-backend";
import { type KeyValueStorage } from "@/lib/data/local-storage-repository";
import { followUpStage, reportCode } from "@/lib/domain/follow-up";

const memoryStorage = (): KeyValueStorage => {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
};

async function submit(api: LocalBackend, text: string, action: "save" | "verify") {
  const ex = await api.extract(text);
  if (!ex.ok) throw new Error(ex.error.message);
  const res = await api.submitReport(text, draftToPayload(draftFromExtraction(ex.data.extraction)), action, ex.data.extraction);
  if (!res.ok) throw new Error(res.error.message);
  return res.data.report;
}

describe("tahap tindak lanjut", () => {
  it("menurunkan tahap dari status + penanda operator", () => {
    expect(followUpStage({ status: "pending_review" })).toBe("received");
    expect(followUpStage({ status: "verified" })).toBe("verified");
    expect(followUpStage({ status: "verified", followUp: { arrangedAt: "2026-01-01T00:00:00.000Z", note: null } })).toBe("arranged");
    expect(followUpStage({ status: "rejected" })).toBe("closed");
    // Tanda lama tidak berlaku bila laporan tidak lagi terverifikasi.
    expect(followUpStage({ status: "pending_review", followUp: { arrangedAt: "2026-01-01T00:00:00.000Z", note: "x" } })).toBe("received");
  });

  it("menandai bantuan diatur TIDAK mengubah satu angka pun di dashboard", async () => {
    const api = createLocalBackend(memoryStorage());
    const report = await submit(api, SAMPLE_REPORTS[0].text, "verify");
    const before = await api.dashboard();
    const arranged = await api.arrangeAid("diabaikan" as never, null); // id tidak valid ditolak
    expect(arranged.ok).toBe(false);

    const res = await api.arrangeAid(report.id, "Tim menuju lokasi, perkiraan 45 menit");
    expect(res.ok && res.data.report.followUp?.note).toBe("Tim menuju lokasi, perkiraan 45 menit");
    const after = await api.dashboard();
    if (!before.ok || !after.ok) throw new Error("dashboard gagal");
    // Seluruh ringkasan (total, kekurangan, hitungan) identik, kecuali objek laporan yang membawa followUp.
    const strip = (s: typeof before.data) => ({ ...s, recentReports: undefined, pendingReports: undefined });
    expect(strip(after.data)).toEqual(strip(before.data));
    expect(after.data.shortages).toEqual(before.data.shortages);
    expect(after.data.needs).toEqual(before.data.needs);
  });

  it("hanya laporan terverifikasi yang boleh ditandai diatur", async () => {
    const api = createLocalBackend(memoryStorage());
    const pending = await submit(api, SAMPLE_REPORTS[0].text, "save");
    const res = await api.arrangeAid(pending.id, "catatan");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("not_verified");
  });

  it("catatan terlalu panjang ditolak; kembali ke pending menghapus penanda", async () => {
    const api = createLocalBackend(memoryStorage());
    const report = await submit(api, SAMPLE_REPORTS[0].text, "verify");
    expect((await api.arrangeAid(report.id, "x".repeat(201))).ok).toBe(false);
    expect((await api.arrangeAid(report.id, "Tim menuju lokasi")).ok).toBe(true);

    const ex = await api.extract(report.rawText);
    if (!ex.ok) throw new Error("x");
    const back = await api.reviewReport(report.id, draftToPayload(draftFromExtraction(ex.data.extraction)), "save");
    expect(back.ok && back.data.report.followUp).toBeNull();
  });

  it("status untuk pelapor lewat kode: tahap + catatan, tanpa membuka teks laporan", async () => {
    const api = createLocalBackend(memoryStorage());
    const report = await submit(api, "Gempa bumi di Desa Lain Sentosa. Butuh 5 dus air mineral.", "save");
    const code = reportCode(report.id);

    const received = await api.getReportStatus(code.toLowerCase());
    expect(received.ok && received.data.stage).toBe("received");

    const verified = await submit(api, SAMPLE_REPORTS[0].text + " Mohon cepat.", "verify");
    await api.arrangeAid(verified.id, "Tim menuju lokasi");
    const s = await api.getReportStatus(reportCode(verified.id));
    expect(s.ok && s.data.stage).toBe("arranged");
    expect(s.ok && s.data.note).toBe("Tim menuju lokasi");
    expect(JSON.stringify(s)).not.toContain(verified.rawText.slice(0, 20));

    expect((await api.getReportStatus("ZZZZZZZZ")).ok).toBe(false);
    expect((await api.getReportStatus("abc")).ok).toBe(false);
  });
});
