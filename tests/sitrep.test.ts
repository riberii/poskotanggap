import { describe, expect, it } from "vitest";
import { buildDashboardSummary, type DashboardSummary, type ShortageRow } from "@/lib/domain/aggregation";
import { buildNeedsCsv, buildSitrep, csvCell, formatWib, SITREP_DISCLAIMER } from "@/lib/domain/sitrep";

const row = (o: Partial<ShortageRow>): ShortageRow => ({
  key: "k", area: "desa a", item: "beras", unit: "kg", requested: 100, reportCount: 1, available: 20, shortage: 80, status: "shortage", otherStockUnits: [], otherStock: [], ...o,
});
const summary = (shortages: ShortageRow[], unresolved: DashboardSummary["needs"]["unresolved"] = []): DashboardSummary => ({
  ...buildDashboardSummary([], []),
  counts: { verified: 4, pendingReview: 2, potentialDuplicates: 1, rejected: 0 },
  shortages,
  needs: { totals: [], excluded: {} as never, unresolved },
});
const NOW = new Date("2026-11-14T02:30:00Z");

describe("sitrep", () => {
  it("waktu dalam WIB dan format dasar", () => {
    expect(formatWib(NOW)).toBe("14 Nov 2026 09.30 WIB");
    const t = buildSitrep(summary([row({})]), NOW);
    expect(t).toContain("Waktu: 14 Nov 2026 09.30 WIB");
    expect(t).toContain("4 terverifikasi, 2 menunggu verifikasi, 1 potensi duplikat");
    expect(t).toContain("1. beras — desa a: butuh 100 kg, stok 20 kg, kurang 80 kg");
    expect(t.trim().endsWith(SITREP_DISCLAIMER)).toBe(true);
  });
  it("urutan prioritas: rasio kekurangan terbesar dulu, maksimal 5, peringatan/cukup tidak masuk kritis", () => {
    const rows = [
      row({ item: "a", requested: 100, shortage: 10, available: 90 }),
      row({ item: "b", requested: 100, shortage: 90, available: 10 }),
      row({ item: "cukup", status: "sufficient", shortage: 0, available: 500 }),
      row({ item: "c", requested: 10, shortage: 5, available: 5 }),
      ...["d", "e", "f", "g"].map((i) => row({ item: i, requested: 100, shortage: 1, available: 99 })),
    ];
    const t = buildSitrep(summary(rows), NOW);
    const lines = t.split("\n").filter((l) => /^\d\. /.test(l));
    expect(lines).toHaveLength(5);
    expect(lines[0]).toContain("b —");
    expect(lines[1]).toContain("c —");
    expect(t).not.toContain("cukup —");
    expect(t).toContain("5 teratas dari 7");
  });
  it("null tidak menjadi 0; satuan tidak cocok dan tanpa jumlah pasti dilaporkan", () => {
    const t = buildSitrep(
      summary(
        [
          row({ item: "air", status: "unit_mismatch", available: null, shortage: null, unit: "botol", otherStock: [{ unit: "dus", quantity: 5 }], otherStockUnits: ["dus"] }),
          row({ item: "tikar", status: "no_stock_record", available: null, shortage: null, unit: "lembar" }),
        ],
        [{ reportId: "r", area: "desa b", item: "selimut", quantity: null, unit: null, reason: "missing_quantity" }],
      ),
      NOW,
    );
    expect(t).toContain("SATUAN TIDAK COCOK (1)");
    expect(t).toContain("air — desa a: butuh 100 botol; stok tercatat dalam 5 dus");
    expect(t).toContain("KEBUTUHAN TANPA JUMLAH PASTI (2)");
    expect(t).toContain("tikar — desa a: butuh 100 lembar; stok belum tercatat (tidak diketahui)");
    expect(t).toContain("selimut — desa b: jumlah tidak diketahui, satuan tidak diketahui");
    expect(t).not.toMatch(/stok 0|kurang 0|jumlah 0/);
  });
});

describe("CSV", () => {
  it("kutip, koma, dan kutip ganda", () => {
    expect(csvCell('desa "A", RW 1')).toBe('"desa ""A"", RW 1"');
    expect(csvCell("biasa")).toBe("biasa");
    expect(csvCell("baris\nbaru")).toBe('"baris\nbaru"');
  });
  it("sel berawalan = + - @ dinetralkan", () => {
    for (const c of ["=1+1", "+62812", "-5", "@SUM(A1)", "\t=x"]) expect(csvCell(c).replace(/^"/, "")).toMatch(/^'/);
    expect(csvCell("=HYPERLINK(\"x\",\"y\")")).toBe('"\'=HYPERLINK(""x"",""y"")"');
  });
  it("angka tetap angka, null menjadi sel kosong (bukan 0), urutan prioritas", () => {
    const csv = buildNeedsCsv(summary([
      row({ item: "cukup", status: "sufficient", shortage: 0, available: 500 }),
      row({ item: "=cmd", area: "a,b", status: "no_stock_record", available: null, shortage: null }),
      row({ item: "beras" }),
    ]));
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe("area,barang,satuan,kebutuhan,stok,kurang,status");
    expect(lines[1]).toBe("desa a,beras,kg,100,20,80,Kurang");
    expect(lines[2]).toBe('"a,b",\'=cmd,kg,100,,,Stok belum tercatat');
    expect(lines[3]).toContain("cukup,kg,100,500,0,Cukup");
  });
});
