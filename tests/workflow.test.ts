// Uji alur end-to-end mode prototipe: backend localStorage yang sama dengan yang dipakai UI Vite.
import { describe, expect, it } from "vitest";
import { createLocalBackend } from "@/lib/data/local-backend";
import { STORAGE_KEY, type KeyValueStorage } from "@/lib/data/local-storage-repository";
import { draftFromExtraction, draftToPayload } from "@/components/intake/draft";
import { SAMPLE_REPORTS } from "@/components/intake/samples";

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const NEW_TEXT = SAMPLE_REPORTS[0].text;
const findRow = (rows: Array<{ item: string; unit: string; area: string }>, item: string) =>
  rows.find((r) => r.item === item);

describe("alur intake → verifikasi → dashboard (localStorage)", () => {
  it("menjalankan seluruh alur dan data bertahan setelah muat ulang", async () => {
    const storage = memoryStorage();
    const api = createLocalBackend(storage);
    const before = await api.dashboard();
    if (!before.ok) throw new Error(before.error.message);

    // 1–3. Ekstraksi berbasis aturan, setiap nilai disertai kutipan bukti dari teks asli.
    const ex = await api.extract(NEW_TEXT);
    if (!ex.ok) throw new Error(ex.error.message);
    expect(ex.data.status).toBe("draft");
    expect(ex.data.extraction.source).toBe("simulated_rules");
    expect(ex.data.extraction.needs.length).toBeGreaterThan(0);
    for (const n of ex.data.extraction.needs) {
      if (n.evidenceQuote) expect(NEW_TEXT).toContain(n.evidenceQuote);
    }

    // 4. Simpan sebagai pending (belum terverifikasi) → tidak masuk total.
    const draft = draftFromExtraction(ex.data.extraction);
    const saved = await api.submitReport(NEW_TEXT, draftToPayload(draft), "save", ex.data.extraction);
    if (!saved.ok) throw new Error(saved.error.message);
    expect(saved.data.report.status).toBe("pending_review");
    const mid = await api.dashboard();
    if (!mid.ok) throw new Error(mid.error.message);
    expect(mid.data.needs.totals).toEqual(before.data.needs.totals);
    expect(mid.data.counts.pendingReview).toBe(before.data.counts.pendingReview + 1);

    // 5. Edit: ubah kuantitas, hapus kuantitas satu kebutuhan (harus tetap unknown/null).
    const payload = draftToPayload(draft);
    const water = payload.needs.find((n) => /air/.test(n.item))!;
    water.quantity = 22;
    const diaper = payload.needs.find((n) => /popok/.test(n.item));
    if (diaper) diaper.quantity = null;
    const verified = await api.reviewReport(saved.data.report.id, { ...payload, duplicateReviewed: true }, "verify");
    if (!verified.ok) throw new Error(verified.error.message);
    expect(verified.data.report.status).toBe("verified");
    expect(verified.data.report.verifiedAt).not.toBeNull();
    if (diaper) expect(verified.data.report.needs.find((n) => /popok/.test(n.item))!.quantity).toBeNull();

    const after = await api.dashboard();
    if (!after.ok) throw new Error(after.error.message);
    const area = verified.data.report.normalizedArea!;
    const waterRow = after.data.shortages.find((r) => r.area === area && /air/.test(r.item));
    expect(waterRow?.requested).toBe(22);
    if (diaper) expect(after.data.needs.excluded.missing_quantity).toBeGreaterThan(before.data.needs.excluded.missing_quantity);

    // 6. Duplikat persis ditolak, tidak dihitung dua kali.
    const dup = await api.submitReport(NEW_TEXT, payload, "verify", null);
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.error.code).toBe("exact_duplicate");

    // 7. Potensi duplikat (area & jenis sama) wajib ditinjau manusia sebelum verifikasi.
    const similar = NEW_TEXT.replace("20 dus", "5 dus").replace("[SIMULASI]", "[SIMULASI] Update:");
    const simEx = await api.extract(similar);
    if (!simEx.ok) throw new Error(simEx.error.message);
    const simPayload = draftToPayload(draftFromExtraction(simEx.data.extraction));
    const blocked = await api.submitReport(similar, simPayload, "verify", null);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error.code).toBe("duplicate_review_required");
    const flagged = await api.submitReport(similar, simPayload, "save", null);
    if (!flagged.ok) throw new Error(flagged.error.message);
    expect(flagged.data.report.duplicateOf).toBe(saved.data.report.id);

    // 9–10. Stok: perbandingan hanya pada satuan persis; stok negatif ditolak.
    const neg = await api.upsertInventory({ item: "air mineral", area: verified.data.report.locationText!, unit: waterRow!.unit, availableQuantity: -1 });
    expect(neg.ok).toBe(false);
    const inv = await api.upsertInventory({ item: "air mineral", area: verified.data.report.locationText!, unit: waterRow!.unit, availableQuantity: 10 });
    if (!inv.ok) throw new Error(inv.error.message);
    const withStock = await api.dashboard();
    if (!withStock.ok) throw new Error(withStock.error.message);
    const row = withStock.data.shortages.find((r) => r.key === waterRow!.key)!;
    expect(row.available).toBe(10);
    expect(row.shortage).toBe(12);
    expect(row.status).toBe("shortage");

    // Muat ulang: state dibaca utuh dari storage.
    const reloaded = createLocalBackend(storage);
    expect(reloaded.repo.loadOutcome).toBe("loaded");
    const again = await reloaded.dashboard();
    if (!again.ok) throw new Error(again.error.message);
    expect(again.data).toEqual(withStock.data);

    // Reset kembali ke data simulasi awal.
    reloaded.reset();
    const resetDash = await createLocalBackend(storage).dashboard();
    if (!resetDash.ok) throw new Error(resetDash.error.message);
    expect(resetDash.data.counts).toEqual(before.data.counts);
    expect(resetDash.data.needs.totals).toEqual(before.data.needs.totals);
  });

  it("data storage rusak tidak membuat aplikasi crash dan dipulihkan ke seed", async () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, "{not json");
    const api = createLocalBackend(storage);
    expect(api.repo.loadOutcome).toBe("recovered_from_corruption");
    expect((await api.dashboard()).ok).toBe(true);
    expect(createLocalBackend(storage).repo.loadOutcome).toBe("loaded");
  });

  it("teks tanpa lokasi/kuantitas: field tetap null dan tidak bisa diverifikasi", async () => {
    const api = createLocalBackend(memoryStorage());
    const text = SAMPLE_REPORTS[3].text;
    const ex = await api.extract(text);
    if (!ex.ok) throw new Error(ex.error.message);
    expect(ex.data.extraction.locationText).toBeNull();
    for (const n of ex.data.extraction.needs) expect(n.quantity).toBeNull();
    const res = await api.submitReport(text, draftToPayload(draftFromExtraction(ex.data.extraction)), "verify", null);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("verification_incomplete");
  });
});
