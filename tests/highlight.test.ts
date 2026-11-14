import { describe, expect, it } from "vitest";
import { highlightSegments } from "@/components/intake/validation";

describe("highlightSegments — kutipan aktif (field ↔ kalimat)", () => {
  const raw = "Banjir di Desa A. Butuh 20 dus air mineral. Terima kasih.";
  const quotes = ["Banjir di Desa A.", "Butuh 20 dus air mineral."];

  it("tanpa kutipan aktif perilaku lama tidak berubah", () => {
    const segs = highlightSegments(raw, quotes);
    expect(segs.map((s) => s.text).join("")).toBe(raw);
    expect(segs.some((s) => s.active)).toBe(false);
  });

  it("hanya kutipan aktif yang ditandai, semua sorotan lain tetap", () => {
    const segs = highlightSegments(raw, quotes, "Butuh 20 dus air mineral.");
    expect(segs.map((s) => s.text).join("")).toBe(raw);
    expect(segs.filter((s) => s.active).map((s) => s.text)).toEqual(["Butuh 20 dus air mineral."]);
    expect(segs.filter((s) => s.evidence).map((s) => s.text).join("")).toContain("Banjir di Desa A.");
  });

  it("kutipan aktif yang tidak ada di teks diabaikan", () => {
    expect(highlightSegments(raw, quotes, "tidak ada").some((s) => s.active)).toBe(false);
  });
});
