import { describe, expect, it } from "vitest";
import { detectDanger, servicesFor } from "@/lib/domain/danger";
import { mergeReaders } from "@/lib/domain/hybrid";
import { numbersFromWords, parseIdNumber } from "@/lib/domain/number-words";
import { redactPii } from "@/lib/domain/redact";
import { simulateExtraction } from "@/lib/domain/simulated-extractor";
import type { ExtractionResult } from "@/lib/domain/types";

const need = (text: string, item: string) => simulateExtraction(text).needs.find((n) => n.item === item);

describe("angka kata", () => {
  it("mengonversi bentuk tegas", () => {
    expect(parseIdNumber("dua puluh lima")).toBe(25);
    expect(parseIdNumber("seratus dua puluh")).toBe(120);
    expect(parseIdNumber("sebelas")).toBe(11);
    expect(parseIdNumber("dua belas")).toBe(12);
    expect(parseIdNumber("tiga ratus lima puluh")).toBe(350);
    expect(parseIdNumber("dua ribu lima ratus")).toBe(2500);
    expect(parseIdNumber("seribu")).toBe(1000);
  });
  it("menolak susunan tidak sah", () => {
    expect(parseIdNumber("lima lima")).toBeNull();
    expect(parseIdNumber("puluh")).toBeNull();
    expect(numbersFromWords("butuh beberapa dus")).toEqual([]);
  });
});

describe("ekstraktor aturan: angka setelah barang & angka kata", () => {
  it("angka setelah nama barang", () => {
    expect(need("Banjir di Desa Sukamaju. Butuh air mineral 40 botol dan beras: 50 kg.", "air mineral")).toMatchObject({ quantity: 40, unit: "botol" });
    expect(need("Banjir di Desa Sukamaju. Butuh air mineral 40 botol dan beras: 50 kg.", "beras")).toMatchObject({ quantity: 50, unit: "kg" });
  });
  it("angka sebelum nama barang tetap terbaca", () => {
    expect(need("Butuh tambahan 50 dus air mineral.", "air mineral")).toMatchObject({ quantity: 50, unit: "dus", quantityBasis: "additional" });
    expect(need("Butuh 2.500 lembar selimut.", "selimut")).toMatchObject({ quantity: 2500, unit: "lembar" });
  });
  it("angka berupa kata", () => {
    expect(need("Butuh dua puluh lima dus air mineral.", "air mineral")).toMatchObject({ quantity: 25, unit: "dus" });
    expect(need("Butuh beras dua puluh kg.", "beras")).toMatchObject({ quantity: 20, unit: "kg" });
  });
  it("angka bukan milik barang tetap null", () => {
    expect(need("Ada 40 pengungsi, butuh air mineral.", "air mineral")?.quantity).toBeNull();
    expect(need("Butuh beras untuk 50 orang.", "beras")?.quantity).toBeNull();
    expect(need("Butuh beberapa dus air mineral.", "air mineral")?.quantity).toBeNull();
  });
  it("satu angka tidak dipakai dua barang", () => {
    const r = simulateExtraction("Butuh beras 50 selimut 20 lembar.");
    expect(r.needs.find((n) => n.item === "beras")?.quantity).toBeNull();
    expect(r.needs.find((n) => n.item === "selimut")).toMatchObject({ quantity: 20, unit: "lembar" });
    const q = simulateExtraction("Butuh 30 dus air mineral dan beras.").needs.find((n) => n.item === "beras");
    expect(q?.quantity).toBeNull();
  });
});

describe("redaksi data pribadi", () => {
  it("meredaksi telepon, NIK, dan email; angka kebutuhan tidak ikut", () => {
    const r = redactPii("Butuh 50 dus air. Hubungi 0812-3456-7890 / +62 811 2233 4455, NIK 3201234567890001, a.b@mail.co.id. RT 03, 120 jiwa.");
    expect(r.text).not.toMatch(/0812|3456|3201234567890001|mail\.co/);
    expect(r.text).toContain("50 dus");
    expect(r.text).toContain("120 jiwa");
    expect(r.counts).toEqual({ email: 1, nik: 1, telepon: 2 });
  });
});

describe("kata bahaya oleh kode", () => {
  it("mendeteksi dan memetakan layanan secara tetap", () => {
    expect(servicesFor(detectDanger("Ada api di dapur"))).toBe("damkar");
    expect(servicesFor(detectDanger("Dua orang terluka"))).toBe("ambulans");
    expect(servicesFor(detectDanger("Rumah terbakar, ada korban luka"))).toBe("keduanya");
    expect(servicesFor(detectDanger("Banjir, butuh beras"))).toBeNull();
    expect(detectDanger("Kami terjebak di atap")[0].kind).toBe("terjebak");
  });
});

describe("penggabung dua pembaca", () => {
  const base = (o: Partial<ExtractionResult>): ExtractionResult => ({
    source: "simulated_rules", model: null, incidentType: null, incidentEvidence: null, locationText: null,
    locationEvidence: null, occurredAtText: null, needs: [], uncertainties: [], warnings: [], ...o,
  });
  const n = (quantity: number | null, unit: "dus" | "botol" | null = "dus", basis: "additional" | "total" | "unknown" = "additional") => ({
    item: "air mineral", quantity, unit, quantityBasis: basis, evidenceQuote: "x",
  });

  it("sepakat → dipertahankan tanpa catatan", () => {
    const m = mergeReaders(base({ incidentType: "banjir", incidentEvidence: "a", needs: [n(30)] }), base({ source: "gemini", model: "m", incidentType: "banjir", incidentEvidence: "a", needs: [n(30)] }));
    expect(m.source).toBe("hybrid");
    expect(m.incidentType).toBe("banjir");
    expect(m.needs[0].quantity).toBe(30);
    expect(m.checks).toEqual([]);
  });
  it("berbeda → dikosongkan dan ditandai periksa; tidak memilih diam-diam", () => {
    const m = mergeReaders(
      base({ locationText: "Desa A", locationEvidence: "e", needs: [n(30)] }),
      base({ source: "gemini", locationText: "Desa B", locationEvidence: "e", needs: [n(300)] }),
    );
    expect(m.locationText).toBeNull();
    expect(m.needs[0]).toMatchObject({ quantity: null, unit: "dus", quantityBasis: "unknown" });
    expect(m.checks!.map((c) => c.field)).toEqual(["location", "need:air mineral"]);
    expect(m.checks![0]).toMatchObject({ rules: "Desa A", ai: "Desa B" });
  });
  it("hanya satu pembaca menemukan → dipertahankan dengan catatan", () => {
    const m = mergeReaders(base({}), base({ source: "gemini", needs: [n(10, "botol")] }));
    expect(m.needs).toHaveLength(1);
    expect(m.checks![0].message).toContain("hanya AI");
  });
});

describe("penggabung: satu pembaca kosong bukan pertentangan", () => {
  const mk = (q: number | null, unit: "kg" | null, basis: "additional" | "unknown", quote: string, source: "gemini" | "simulated_rules"): ExtractionResult => ({
    source, model: null, incidentType: null, incidentEvidence: null, locationText: null, locationEvidence: null,
    occurredAtText: null, uncertainties: [], warnings: [],
    needs: [{ item: "beras", quantity: q, unit, quantityBasis: basis, evidenceQuote: quote }],
  });
  it("nilai pembaca yang mengisi dipertahankan dan ditandai periksa, bukan dikosongkan", () => {
    const m = mergeReaders(mk(null, null, "unknown", "beras kurang", "simulated_rules"), mk(75, "kg", "additional", "kurang 75 kg beras", "gemini"));
    expect(m.needs[0]).toMatchObject({ quantity: 75, unit: "kg", quantityBasis: "additional", evidenceQuote: "kurang 75 kg beras" });
    expect(m.checks).toHaveLength(1);
    expect(m.checks![0].message).toContain("hanya satu pembaca");
  });
});

describe("batas kalimat & lokasi RW", () => {
  it("titik ribuan tidak memotong kalimat sehingga 'kurang' tetap terbaca (basis tambahan)", () => {
    expect(need("Banjir di Desa Baru. Masih kurang 2.500 lembar selimut.", "selimut")).toMatchObject({ quantity: 2500, quantityBasis: "additional" });
  });
  it("lokasi dengan RW tidak terpotong", () => {
    expect(simulateExtraction("Banjir di Kelurahan Melati RW 05. 45 KK terdampak.").locationText).toBe("Kelurahan Melati RW 05");
  });
});
