// Regresi dari audit akhir: akurasi ekstraktor, ketahanan localStorage, determinisme.
import { describe, expect, it } from "vitest";
import { createLocalBackend } from "@/lib/data/local-backend";
import { STORAGE_KEY, type KeyValueStorage } from "@/lib/data/local-storage-repository";
import { RuleBasedExtractor } from "@/lib/domain/extractors";
import { buildSeed } from "@/lib/data/seed-data";
import { aggregateNeeds, computeShortages } from "@/lib/domain/aggregation";
import { SAMPLE_REPORTS } from "@/components/intake/samples";
import { draftFromExtraction, draftToPayload } from "@/components/intake/draft";

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

async function submit(api: ReturnType<typeof createLocalBackend>, text: string, action: "save" | "verify" = "save") {
  const ex = await api.extract(text);
  if (!ex.ok) throw new Error(ex.error.message);
  return api.submitReport(text, draftToPayload(draftFromExtraction(ex.data.extraction)), action, ex.data.extraction);
}

describe("RuleBasedExtractor: akurasi (tidak boleh menebak)", () => {
  it("angka dengan pemisah ribuan Indonesia tidak dipotong menjadi angka lain", async () => {
    const r = await RuleBasedExtractor.extract("Banjir di Desa Contoh Makmur. Butuh tambahan 2.500 kg beras.");
    const beras = r.needs.find((n) => n.item === "beras");
    expect(beras?.quantity).toBe(2500);
    expect(beras?.unit).toBe("kg");
  });
  it("desimal dengan koma tetap terbaca", async () => {
    const r = await RuleBasedExtractor.extract("Butuh tambahan 1,5 kg beras.");
    expect(r.needs.find((n) => n.item === "beras")?.quantity).toBe(1.5);
  });
  it("angka milik hal lain (jumlah orang) tidak dijadikan kuantitas barang", async () => {
    const r = await RuleBasedExtractor.extract("Banjir di Desa Contoh Makmur, 40 pengungsi air mineral habis.");
    expect(r.needs.find((n) => n.item === "air mineral")?.quantity).toBeNull();
  });
  it("kata biasa setelah 'desa' bukan lokasi", async () => {
    const r = await RuleBasedExtractor.extract("Di desa kami sedang banjir besar, butuh selimut.");
    expect(r.locationText).toBeNull();
  });
  it("pesan multibaris (gaya WhatsApp) tetap menghasilkan kutipan bukti yang valid", async () => {
    const text = "Banjir di Desa Contoh Makmur\nMasih butuh tambahan\n20 dus air mineral.";
    const r = await RuleBasedExtractor.extract(text);
    expect(r.needs[0].quantity).toBe(20);
    expect(r.needs[0].evidenceQuote).not.toBeNull();
    expect(r.warnings.some((w) => w.includes("dikosongkan"))).toBe(false);
  });
  it("semua sampel demo menghasilkan hasil yang konsisten dengan teksnya", async () => {
    const out = [];
    for (const s of SAMPLE_REPORTS) out.push(await RuleBasedExtractor.extract(s.text));
    expect(out[0].locationText).toBe("Desa Contoh Makmur");
    expect(out[0].needs.map((n) => [n.item, n.quantity, n.unit])).toEqual(
      expect.any(Array),
    );
    expect(out[3].locationText).toBeNull();
    expect(out[3].needs.every((n) => n.quantity === null)).toBe(true);
  });
});

describe("localStorage: ketahanan", () => {
  it("dua tab pada storage yang sama tidak saling menimpa data", async () => {
    const storage = memoryStorage();
    const tabA = createLocalBackend(storage);
    const tabB = createLocalBackend(storage);
    const a = await submit(tabA, "Banjir di Desa Alfa Satu. Butuh tambahan 5 dus air mineral.", "verify");
    expect(a.ok).toBe(true);
    const b = await submit(tabB, "Longsor di Desa Beta Dua. Butuh tambahan 6 lembar selimut.", "verify");
    expect(b.ok).toBe(true);
    const fresh = createLocalBackend(storage);
    const dash = await fresh.dashboard();
    if (!dash.ok) throw new Error("dash");
    const texts = dash.data.recentReports.map((r) => r.rawText).join("|");
    expect(texts).toContain("Alfa Satu");
    expect(texts).toContain("Beta Dua");
  });
  it("tab lama melihat perubahan tab lain tanpa muat ulang (duplikat persis lintas tab tetap terdeteksi)", async () => {
    const storage = memoryStorage();
    const tabA = createLocalBackend(storage);
    const tabB = createLocalBackend(storage);
    const text = "Banjir di Desa Alfa Satu. Butuh tambahan 5 dus air mineral.";
    expect((await submit(tabA, text, "verify")).ok).toBe(true);
    const again = await submit(tabB, text, "verify");
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe("exact_duplicate");
  });
  it("gagal menulis storage: operasi ditolak dan tidak muncul di dashboard", async () => {
    const storage = memoryStorage();
    const api = createLocalBackend(storage);
    const realSet = storage.setItem;
    storage.setItem = () => { throw new Error("quota"); };
    const res = await submit(api, "Banjir di Desa Alfa Satu. Butuh tambahan 5 dus air mineral.", "verify");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("storage_failed");
    const dash = await api.dashboard();
    if (!dash.ok) throw new Error("dash");
    expect(dash.data.recentReports.some((r) => r.rawText.includes("Alfa Satu"))).toBe(false);
    storage.setItem = realSet;
  });
  it("storage tidak bisa dibaca (diblokir) tidak menghapus state yang sedang berjalan", async () => {
    const data = new Map<string, string>();
    let blocked = false;
    const storage: KeyValueStorage = {
      getItem: (k) => { if (blocked) throw new Error("blocked"); return data.get(k) ?? null; },
      setItem: (k, v) => void data.set(k, v),
      removeItem: (k) => void data.delete(k),
    };
    const api = createLocalBackend(storage);
    await submit(api, "Banjir di Desa Alfa Satu. Butuh tambahan 5 dus air mineral.", "verify");
    blocked = true;
    const dash = await api.dashboard();
    if (!dash.ok) throw new Error("dash");
    expect(dash.data.recentReports.some((r) => r.rawText.includes("Alfa Satu"))).toBe(true);
  });
  it("reset mengembalikan seed dan tidak merusak storage", async () => {
    const storage = memoryStorage();
    const api = createLocalBackend(storage);
    await submit(api, "Banjir di Desa Alfa Satu. Butuh tambahan 5 dus air mineral.", "verify");
    api.reset();
    const seedCount = buildSeed().reports.length;
    const parsed = JSON.parse(storage.data.get(STORAGE_KEY)!);
    expect(parsed.reports).toHaveLength(seedCount);
    const dash = await createLocalBackend(storage).dashboard();
    if (!dash.ok) throw new Error("dash");
    expect(dash.data.counts.verified).toBe(buildSeed().reports.filter((r) => r.status === "verified").length);
  });
});

describe("determinisme & akurasi total", () => {
  it("urutan laporan input tidak mengubah total maupun kekurangan", () => {
    const seed = buildSeed();
    const a = computeShortages(aggregateNeeds(seed.reports).totals, seed.inventory);
    const b = computeShortages(aggregateNeeds([...seed.reports].reverse()).totals, [...seed.inventory].reverse());
    expect(a).toEqual(b);
  });
  it("seed: kekurangan sesuai hitungan manual", () => {
    const seed = buildSeed();
    const rows = computeShortages(aggregateNeeds(seed.reports).totals, seed.inventory);
    const get = (area: string, item: string, unit: string) => rows.find((r) => r.area === area && r.item === item && r.unit === unit);
    expect(get("simulasi barat rw 03", "air mineral", "dus")).toMatchObject({ requested: 30, available: 12, shortage: 18, status: "shortage" });
    expect(get("simulasi barat rw 03", "beras", "kg")).toMatchObject({ requested: 50, available: 75, shortage: 0, status: "sufficient" });
    expect(get("fiktif jaya", "selimut", "lembar")).toMatchObject({ requested: 20, available: 8, shortage: 12 });
    expect(get("fiktif jaya", "tenda", "unit")).toMatchObject({ status: "no_stock_record", shortage: null });
    expect(get("fiktif jaya", "air mineral", "botol")).toMatchObject({ status: "unit_mismatch", shortage: null });
  });
  it("duplikat persis beda kapitalisasi/spasi ditolak lewat backend", async () => {
    const api = createLocalBackend(memoryStorage());
    const t = SAMPLE_REPORTS[0].text;
    expect((await submit(api, t, "verify")).ok).toBe(true);
    const r = await submit(api, "  " + t.toUpperCase().replace(/ /g, "  ") + "  ", "verify");
    expect(r.ok).toBe(false);
  });
  it("menyimpan stok negatif ditolak dan stok tidak berubah", async () => {
    const api = createLocalBackend(memoryStorage());
    const r = await api.upsertInventory({ area: "Desa Fiktif Jaya", item: "selimut", unit: "lembar", availableQuantity: -1 });
    expect(r.ok).toBe(false);
    const d = await api.dashboard();
    if (!d.ok) throw new Error("dash");
    expect(d.data.inventory.every((i) => i.availableQuantity >= 0)).toBe(true);
  });
});
