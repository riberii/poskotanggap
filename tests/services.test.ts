import { beforeEach, describe, expect, it } from "vitest";
import { MockRepository } from "@/lib/data/mock-repository";
import { ServiceError } from "@/lib/services/errors";
import { getDashboard, reviewReport, submitReport, upsertInventory } from "@/lib/services/reports";

/** Alur end-to-end service di atas repository mock kosong (tanpa seed). */

const NOW = new Date("2026-11-10T08:00:00.000Z");

function body(overrides: Record<string, unknown> = {}) {
  return {
    rawText: "Banjir di Desa Uji Coba. Masih butuh tambahan 30 dus air mineral.",
    incidentType: "banjir",
    locationText: "Desa Uji Coba",
    needs: [
      {
        item: "air mineral",
        quantity: 30,
        unit: "dus",
        quantityBasis: "additional",
        evidenceQuote: "Masih butuh tambahan 30 dus air mineral.",
      },
    ],
    action: "verify",
    ...overrides,
  };
}

async function expectServiceError(p: Promise<unknown>, status: number, code: string) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ServiceError);
  expect(err).toMatchObject({ status, code });
  return err as ServiceError;
}

let repo: MockRepository;
beforeEach(() => {
  repo = new MockRepository({ reports: [], inventory: [] });
});

describe("service: submit & verifikasi", () => {
  it("Kasus 1: laporan normal terverifikasi masuk ke total dashboard", async () => {
    const { report } = await submitReport(repo, body(), NOW);
    expect(report).toMatchObject({ status: "verified", normalizedArea: "uji coba", duplicateOf: null });
    expect(report.verifiedAt).toBe(NOW.toISOString());
    expect(report.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    const d = await getDashboard(repo);
    expect(d.needs.totals).toEqual([expect.objectContaining({ item: "air mineral", unit: "dus", requested: 30 })]);
  });

  it("Kasus 2: duplikat persis ditolak dan tidak menambah total", async () => {
    await submitReport(repo, body(), NOW);
    const err = await expectServiceError(
      submitReport(repo, body({ rawText: "  banjir di desa uji coba.   masih butuh tambahan 30 dus air mineral!! " }), NOW),
      409,
      "exact_duplicate",
    );
    expect(err.details).toMatchObject({ existingId: expect.any(String) });
    expect((await repo.listReports()).length).toBe(1);
    expect((await getDashboard(repo)).needs.totals[0].requested).toBe(30);
  });

  it("Kasus 3: laporan mirip ditandai, tetap disimpan, dan butuh konfirmasi manusia", async () => {
    const first = await submitReport(repo, body(), NOW);
    const similar = body({ rawText: "Update: banjir Desa Uji Coba makin tinggi, butuh tambahan 10 dus air mineral." });

    await expectServiceError(submitReport(repo, similar, NOW), 409, "duplicate_review_required");
    expect((await repo.listReports()).length).toBe(1);

    const saved = await submitReport(repo, { ...similar, action: "save" }, NOW);
    expect(saved.report).toMatchObject({ status: "pending_review", duplicateOf: first.report.id });
    expect((await repo.listReports()).length).toBe(2); // tidak dihapus / digabung

    const verified = await reviewReport(
      repo,
      saved.report.id,
      { incidentType: "banjir", locationText: "Desa Uji Coba", needs: similar.needs, action: "verify", duplicateReviewed: true },
      NOW,
    );
    expect(verified.report.status).toBe("verified");
    expect(verified.report.duplicateOf).toBe(first.report.id);
  });

  it("Kasus 4: kebutuhan tanpa kuantitas boleh diverifikasi tetapi tidak dijumlahkan", async () => {
    await submitReport(
      repo,
      body({ needs: [{ item: "obat-obatan", quantity: null, unit: null, quantityBasis: "unknown", evidenceQuote: null }] }),
      NOW,
    );
    const d = await getDashboard(repo);
    expect(d.needs.totals).toEqual([]);
    expect(d.needs.excluded.basis_unknown).toBe(1);
  });

  it("Kasus 5: laporan tanpa lokasi boleh disimpan tetapi tidak bisa diverifikasi", async () => {
    await expectServiceError(submitReport(repo, body({ locationText: null }), NOW), 422, "verification_incomplete");
    const { report } = await submitReport(repo, body({ locationText: null, action: "save" }), NOW);
    expect(report).toMatchObject({ status: "pending_review", locationText: null, normalizedArea: null });
  });

  it("Kasus 6: laporan belum terverifikasi tidak berkontribusi ke total", async () => {
    await submitReport(repo, body({ action: "save" }), NOW);
    const d = await getDashboard(repo);
    expect(d.counts.pendingReview).toBe(1);
    expect(d.needs.totals).toEqual([]);
    expect(d.needs.excluded.report_not_verified).toBe(1);
  });

  it("Kasus 7: satuan tidak kompatibel ditolak server", async () => {
    await expectServiceError(
      submitReport(
        repo,
        body({ needs: [{ item: "beras", quantity: 10, unit: "liter", quantityBasis: "additional", evidenceQuote: null }] }),
        NOW,
      ),
      400,
      "invalid_input",
    );
  });

  it("menolak field turunan yang dikirim browser (status, fingerprint, dll.)", async () => {
    await expectServiceError(submitReport(repo, body({ status: "verified", fingerprint: "0".repeat(64) }), NOW), 400, "invalid_input");
  });

  it("laporan yang ditolak tidak dihitung dan tidak bisa diubah lagi", async () => {
    const { report } = await submitReport(repo, body({ action: "save" }), NOW);
    const rejected = await reviewReport(repo, report.id, { incidentType: "banjir", locationText: "Desa Uji Coba", needs: [], action: "reject" }, NOW);
    expect(rejected.report.status).toBe("rejected");
    await expectServiceError(
      reviewReport(repo, report.id, { incidentType: "banjir", locationText: "Desa Uji Coba", needs: [], action: "verify" }, NOW),
      409,
      "already_rejected",
    );
  });
});

describe("service: inventory", () => {
  it("Kasus 8: stok negatif ditolak", async () => {
    await expectServiceError(
      upsertInventory(repo, { item: "air mineral", area: "Desa Uji Coba", unit: "dus", availableQuantity: -10 }, NOW),
      400,
      "invalid_input",
    );
    expect(await repo.listInventory()).toEqual([]);
  });

  it("stok dicocokkan per area+barang+satuan untuk menghitung kekurangan", async () => {
    await submitReport(repo, body(), NOW);
    await upsertInventory(repo, { item: "Air Mineral", area: "Desa Uji Coba", unit: "dus", availableQuantity: 12 }, NOW);
    await upsertInventory(repo, { item: "air mineral", area: "Desa Uji Coba", unit: "botol", availableQuantity: 500 }, NOW);
    const d = await getDashboard(repo);
    expect(d.shortages).toEqual([
      expect.objectContaining({ area: "uji coba", item: "air mineral", unit: "dus", requested: 30, available: 12, shortage: 18 }),
    ]);
  });

  it("upsert memperbarui baris yang sama, bukan menambah duplikat", async () => {
    await upsertInventory(repo, { item: "beras", area: "Desa Uji Coba", unit: "kg", availableQuantity: 10 }, NOW);
    await upsertInventory(repo, { item: "beras", area: "Kel. Uji Coba", unit: "kg", availableQuantity: 25 }, NOW);
    const items = await repo.listInventory();
    expect(items).toHaveLength(1);
    expect(items[0].availableQuantity).toBe(25);
  });
});
