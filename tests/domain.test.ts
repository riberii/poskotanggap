import { describe, expect, it } from "vitest";
import { aggregateNeeds, buildDashboardSummary, computeShortages } from "@/lib/domain/aggregation";
import { findExactDuplicate, findPotentialDuplicate } from "@/lib/domain/duplicates";
import { fingerprintMessage } from "@/lib/domain/fingerprint";
import { normalizeArea, normalizeMessage } from "@/lib/domain/normalize";
import { inventoryInputSchema, needInputSchema } from "@/lib/domain/schemas";
import { simulateExtraction } from "@/lib/domain/simulated-extractor";
import type { InventoryItem, Report, ReportNeed } from "@/lib/domain/types";

let seq = 0;
function makeReport(p: Partial<Omit<Report, "needs">> & { needs?: Partial<ReportNeed>[] } = {}): Report {
  seq += 1;
  const id = p.id ?? `r-${seq}`;
  const status = p.status ?? "verified";
  return {
    id,
    rawText: p.rawText ?? `laporan ${seq}`,
    submittedAt: p.submittedAt ?? `2026-11-08T0${seq % 10}:00:00.000Z`,
    incidentType: p.incidentType === undefined ? "banjir" : p.incidentType,
    locationText: p.locationText === undefined ? "Desa Uji" : p.locationText,
    normalizedArea: p.normalizedArea === undefined ? "uji" : p.normalizedArea,
    status,
    fingerprint: p.fingerprint ?? fingerprintMessage(p.rawText ?? `laporan ${seq}`),
    duplicateOf: p.duplicateOf ?? null,
    extraction: null,
    createdAt: "2026-11-08T00:00:00.000Z",
    verifiedAt: status === "verified" ? "2026-11-08T00:00:00.000Z" : null,
    needs: (p.needs ?? []).map((n, i) => ({
      id: `${id}-n${i}`,
      reportId: id,
      item: "air mineral",
      quantity: 10,
      unit: "dus",
      quantityBasis: "additional",
      evidenceQuote: null,
      verified: status === "verified",
      ...n,
    })),
  };
}

const inv = (p: Partial<InventoryItem>): InventoryItem => ({
  id: `i-${Math.random()}`,
  item: "air mineral",
  area: "uji",
  unit: "dus",
  availableQuantity: 0,
  updatedAt: "2026-11-08T00:00:00.000Z",
  ...p,
});

describe("normalisasi & fingerprint", () => {
  it("menyamakan kapitalisasi, spasi, dan tanda baca akhir", () => {
    expect(normalizeMessage("  Banjir   di DESA Uji!!\n")).toBe("banjir di desa uji");
    expect(fingerprintMessage("Banjir di desa Uji.")).toBe(fingerprintMessage("banjir  di DESA uji"));
  });

  it("fingerprint adalah SHA-256 hex 64 karakter", () => {
    expect(fingerprintMessage("tes")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("angka berbeda menghasilkan fingerprint berbeda", () => {
    expect(fingerprintMessage("butuh 50 dus")).not.toBe(fingerprintMessage("butuh 60 dus"));
  });

  it("normalisasi area menghapus awalan administratif dan tanda baca", () => {
    expect(normalizeArea("Kel. Simulasi Barat, RW 03")).toBe("simulasi barat rw 03");
    expect(normalizeArea("Kelurahan Simulasi Barat RW 03")).toBe("simulasi barat rw 03");
    expect(normalizeArea("   ")).toBeNull();
    expect(normalizeArea(null)).toBeNull();
  });
});

describe("Kasus 1: laporan normal terverifikasi", () => {
  it("dihitung dalam total kebutuhan", () => {
    const r = makeReport({ needs: [{ quantity: 30 }, { item: "beras", quantity: 50, unit: "kg" }] });
    const { totals } = aggregateNeeds([r]);
    expect(totals).toEqual([
      expect.objectContaining({ area: "uji", item: "air mineral", unit: "dus", requested: 30, reportCount: 1 }),
      expect.objectContaining({ area: "uji", item: "beras", unit: "kg", requested: 50, reportCount: 1 }),
    ]);
  });

  it("menjumlahkan beberapa laporan terverifikasi pada area/barang/satuan sama", () => {
    const a = makeReport({ needs: [{ quantity: 30 }] });
    const b = makeReport({ needs: [{ quantity: 12.5 }] });
    expect(aggregateNeeds([a, b]).totals[0]).toMatchObject({ requested: 42.5, reportCount: 2 });
  });
});

describe("Kasus 2: duplikat persis", () => {
  it("terdeteksi lewat fingerprint", () => {
    const original = makeReport({ rawText: "Banjir di Desa Uji, butuh 30 dus air mineral." });
    const fp = fingerprintMessage("banjir di desa uji,   butuh 30 dus air mineral");
    expect(findExactDuplicate(fp, [original])).toBe(original.id);
  });

  it("tidak dihitung dua kali walau muncul dua kali di input agregasi", () => {
    const a = makeReport({ rawText: "sama", needs: [{ quantity: 30 }] });
    const b = makeReport({ rawText: "SAMA.", needs: [{ quantity: 30 }] });
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(aggregateNeeds([a, b]).totals[0].requested).toBe(30);
  });
});

describe("Kasus 3: laporan mirip perlu review manusia", () => {
  const existing = [
    makeReport({ id: "first", submittedAt: "2026-11-08T01:00:00.000Z" }),
    makeReport({ id: "second", submittedAt: "2026-11-08T02:00:00.000Z" }),
    makeReport({ id: "rejected", status: "rejected", submittedAt: "2026-11-08T00:00:00.000Z" }),
  ];

  it("ditandai mengacu ke laporan paling awal yang tidak ditolak", () => {
    expect(findPotentialDuplicate({ normalizedArea: "uji", incidentType: "banjir" }, existing)).toBe("first");
  });

  it("jenis kejadian atau area berbeda tidak ditandai", () => {
    expect(findPotentialDuplicate({ normalizedArea: "uji", incidentType: "gempa_bumi" }, existing)).toBeNull();
    expect(findPotentialDuplicate({ normalizedArea: "lain", incidentType: "banjir" }, existing)).toBeNull();
  });

  it("area atau jenis null tidak pernah dicocokkan", () => {
    expect(findPotentialDuplicate({ normalizedArea: null, incidentType: "banjir" }, existing)).toBeNull();
    expect(findPotentialDuplicate({ normalizedArea: "uji", incidentType: null }, existing)).toBeNull();
  });

  it("tidak membandingkan laporan dengan dirinya sendiri", () => {
    expect(
      findPotentialDuplicate({ id: "first", normalizedArea: "uji", incidentType: "banjir" }, existing.slice(0, 1)),
    ).toBeNull();
  });
});

describe("Kasus 4: kuantitas hilang", () => {
  it("kebutuhan tanpa kuantitas tidak dijumlahkan dan dicatat sebagai dikecualikan", () => {
    const r = makeReport({ needs: [{ quantity: null }] });
    const agg = aggregateNeeds([r]);
    expect(agg.totals).toEqual([]);
    expect(agg.excluded.missing_quantity).toBe(1);
  });

  it("ekstraksi simulasi mengembalikan null bila kuantitas tidak disebutkan", () => {
    const e = simulateExtraction("Banjir di Desa Uji Coba, warga butuh obat-obatan.");
    expect(e.needs[0]).toMatchObject({ item: "obat-obatan", quantity: null });
  });

  it("schema menerima quantity null tetapi menolak 0, negatif, NaN, dan Infinity", () => {
    const base = { item: "beras", unit: "kg", quantityBasis: "additional", evidenceQuote: null };
    expect(needInputSchema.safeParse({ ...base, quantity: null }).success).toBe(true);
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, 1.234, "10"]) {
      expect(needInputSchema.safeParse({ ...base, quantity: bad }).success).toBe(false);
    }
  });
});

describe("Kasus 5: lokasi hilang", () => {
  it("ekstraksi simulasi mengembalikan null untuk lokasi yang tidak ada", () => {
    const e = simulateExtraction("Banjir, butuh 10 dus air mineral.");
    expect(e.locationText).toBeNull();
    expect(e.locationEvidence).toBeNull();
  });

  it("kebutuhan dari laporan tanpa area tidak dijumlahkan", () => {
    const r = makeReport({ normalizedArea: null, locationText: null, needs: [{ quantity: 10 }] });
    const agg = aggregateNeeds([r]);
    expect(agg.totals).toEqual([]);
    expect(agg.excluded.missing_area).toBe(1);
  });
});

describe("Kasus 6: laporan belum terverifikasi", () => {
  it("pending_review dan rejected tidak berkontribusi ke total", () => {
    const pending = makeReport({ status: "pending_review", needs: [{ quantity: 100 }] });
    const rejected = makeReport({ status: "rejected", needs: [{ quantity: 100 }] });
    const verified = makeReport({ needs: [{ quantity: 5 }] });
    const agg = aggregateNeeds([pending, rejected, verified]);
    expect(agg.totals[0].requested).toBe(5);
    expect(agg.excluded.report_not_verified).toBe(2);
  });

  it("kebutuhan yang tidak diverifikasi di laporan terverifikasi juga dikecualikan", () => {
    const r = makeReport({ needs: [{ quantity: 10, verified: false }] });
    expect(aggregateNeeds([r]).excluded.need_not_verified).toBe(1);
  });

  it("basis total dan unknown tidak dihitung sebagai tambahan", () => {
    const r = makeReport({
      needs: [
        { quantity: 120, quantityBasis: "total" },
        { quantity: 7, quantityBasis: "unknown" },
        { quantity: 3, quantityBasis: "additional" },
      ],
    });
    const agg = aggregateNeeds([r]);
    expect(agg.totals[0].requested).toBe(3);
    expect(agg.excluded.basis_total).toBe(1);
    expect(agg.excluded.basis_unknown).toBe(1);
  });
});

describe("Kasus 7: satuan berbeda", () => {
  it("satuan berbeda tidak pernah dijumlahkan bersama", () => {
    const r = makeReport({ needs: [{ quantity: 30, unit: "dus" }, { quantity: 40, unit: "botol" }] });
    const totals = aggregateNeeds([r]).totals;
    expect(totals).toHaveLength(2);
    expect(totals.map((t) => [t.unit, t.requested])).toEqual([
      ["dus", 30],
      ["botol", 40],
    ]);
  });

  it("stok dalam satuan lain menghasilkan unit_mismatch, bukan konversi", () => {
    const { totals } = aggregateNeeds([makeReport({ needs: [{ quantity: 40, unit: "botol" }] })]);
    const [row] = computeShortages(totals, [inv({ unit: "dus", availableQuantity: 100 })]);
    expect(row).toMatchObject({ status: "unit_mismatch", available: null, shortage: null, otherStockUnits: ["dus"] });
  });

  it("satuan tidak kompatibel dengan barang katalog ditolak", () => {
    const r = needInputSchema.safeParse({
      item: "Beras",
      quantity: 10,
      unit: "liter",
      quantityBasis: "additional",
      evidenceQuote: null,
    });
    expect(r.success).toBe(false);
  });

  it("satuan di luar daftar baku ditolak", () => {
    const r = needInputSchema.safeParse({
      item: "air mineral",
      quantity: 10,
      unit: "galon",
      quantityBasis: "additional",
      evidenceQuote: null,
    });
    expect(r.success).toBe(false);
  });

  it("kuantitas tanpa satuan ditolak", () => {
    const r = needInputSchema.safeParse({
      item: "air mineral",
      quantity: 10,
      unit: null,
      quantityBasis: "additional",
      evidenceQuote: null,
    });
    expect(r.success).toBe(false);
  });
});

describe("Kasus 8: kuantitas stok negatif", () => {
  it("schema inventory menolak stok negatif", () => {
    const r = inventoryInputSchema.safeParse({ item: "beras", area: "Desa Uji", unit: "kg", availableQuantity: -1 });
    expect(r.success).toBe(false);
  });

  it("schema inventory menerima stok 0", () => {
    const r = inventoryInputSchema.safeParse({ item: "beras", area: "Desa Uji", unit: "kg", availableQuantity: 0 });
    expect(r.success).toBe(true);
  });

  it("perhitungan kekurangan menolak data stok negatif", () => {
    expect(() => computeShortages([], [inv({ availableQuantity: -5 })])).toThrow();
  });
});

describe("perhitungan kekurangan stok", () => {
  const { totals } = aggregateNeeds([makeReport({ needs: [{ quantity: 30 }] })]);

  it("kekurangan = kebutuhan − stok", () => {
    expect(computeShortages(totals, [inv({ availableQuantity: 12 })])[0]).toMatchObject({
      available: 12,
      shortage: 18,
      status: "shortage",
    });
  });

  it("kekurangan tidak pernah negatif", () => {
    expect(computeShortages(totals, [inv({ availableQuantity: 50 })])[0]).toMatchObject({
      shortage: 0,
      status: "sufficient",
    });
  });

  it("stok area lain tidak dipakai", () => {
    expect(computeShortages(totals, [inv({ area: "lain", availableQuantity: 50 })])[0]).toMatchObject({
      available: null,
      shortage: 30,
      status: "no_stock_record",
    });
  });

  it("ringkasan dashboard menghitung status laporan", () => {
    const s = buildDashboardSummary(
      [
        makeReport({}),
        makeReport({ status: "pending_review", duplicateOf: "x" }),
        makeReport({ status: "rejected", duplicateOf: "x" }),
      ],
      [],
    );
    expect(s.counts).toEqual({ verified: 1, pendingReview: 1, potentialDuplicates: 1, rejected: 1 });
  });
});
