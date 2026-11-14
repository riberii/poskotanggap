import { describe, expect, it, vi } from "vitest";
import {
  isExactExcerpt,
  parseModelResponse,
  quantityAppearsIn,
  sanitizeClientExtraction,
  toDraftExtraction,
  unitAppearsIn,
  type AiExtraction,
} from "@/lib/domain/ai-extraction";
import { MockRepository } from "@/lib/data/mock-repository";
import { ServiceError } from "@/lib/services/errors";
import { ExtractError, extractWithAi, handleExtract, type AiCaller } from "@/lib/ai/extract-handler";
import { HashCache, RateLimiter } from "@/lib/ai/common";
import { parseExtractRequest, submitReport } from "@/lib/services/reports";

/**
 * Tes Fase 3. Semua respons model di sini adalah STUB lokal (tanpa jaringan),
 * dipakai untuk menguji validasi & penanganan error secara deterministik.
 * Semua pesan adalah data SIMULASI.
 */

const MODEL = "gemini-3.8-flash";

function ai(overrides: Partial<AiExtraction> = {}): AiExtraction {
  return {
    incident_type: null,
    incident_evidence: null,
    location_text: null,
    location_evidence: null,
    occurred_at_text: null,
    needs: [],
    uncertainties: [],
    ...overrides,
  };
}

const stub = (...responses: (string | undefined)[]): AiCaller => {
  const fn = vi.fn<AiCaller>();
  for (const r of responses) fn.mockResolvedValueOnce(r);
  return fn;
};

async function expectServiceError(p: Promise<unknown>, status: number, code: string) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ServiceError);
  expect((err as ServiceError).status).toBe(status);
  expect((err as ServiceError).code).toBe(code);
  return err as ServiceError;
}

async function expectExtractError(p: Promise<unknown>, status: number, code: string) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ExtractError);
  expect((err as ExtractError).status).toBe(status);
  expect((err as ExtractError).code).toBe(code);
}

// ---------------------------------------------------------------------------
describe("validasi input /api/extract-report", () => {
  it("menolak teks kosong, terlalu pendek, dan terlalu panjang", () => {
    expect(() => parseExtractRequest({ rawText: "" })).toThrow(ServiceError);
    expect(() => parseExtractRequest({ rawText: "   ab  " })).toThrow(ServiceError);
    expect(() => parseExtractRequest({ rawText: "x".repeat(5001) })).toThrow(ServiceError);
    expect(() => parseExtractRequest({})).toThrow(ServiceError);
    expect(() => parseExtractRequest({ rawText: "Banjir di desa.", extra: 1 })).toThrow(ServiceError);
    expect(parseExtractRequest({ rawText: "  Banjir di desa.  " })).toBe("Banjir di desa.");
  });

  it("membatasi laju permintaan per klien", () => {
    const rl = new RateLimiter(60_000, 10);
    for (let i = 0; i < 10; i++) expect(rl.allow("k", 1_000)).toBe(true);
    expect(rl.allow("k", 1_000)).toBe(false);
    expect(rl.allow("k", 1_000 + 61_000)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe("validasi struktur respons model", () => {
  it("menolak respons kosong, bukan JSON, field asing, enum tidak dikenal, dan angka tidak valid", () => {
    expect(() => parseModelResponse(undefined)).toThrow(/kosong/);
    expect(() => parseModelResponse("```json {}```")).toThrow(/bukan JSON/);
    expect(() => parseModelResponse(JSON.stringify({ ...ai(), priority: "tinggi" }))).toThrow(/skema/);
    expect(() => parseModelResponse(JSON.stringify(ai({ incident_type: "tsunami" as never })))).toThrow(/skema/);
    const need = { item: "beras", quantity: -5, unit: "kg", quantity_basis: "additional", evidence_quote: null };
    expect(() => parseModelResponse(JSON.stringify(ai({ needs: [need as never] })))).toThrow(/needs/);
    expect(() =>
      parseModelResponse(JSON.stringify(ai({ needs: [{ ...need, quantity: 0 } as never] }))),
    ).toThrow(/skema/);
    expect(() =>
      parseModelResponse(JSON.stringify(ai({ needs: [{ ...need, quantity: 5, unit: "ton" } as never] }))),
    ).toThrow(/skema/);
    const { uncertainties: _omit, ...missing } = ai();
    expect(() => parseModelResponse(JSON.stringify(missing))).toThrow(/skema/);
  });

  it("menerima respons yang sesuai skema", () => {
    expect(parseModelResponse(JSON.stringify(ai()))).toEqual(ai());
  });
});

// ---------------------------------------------------------------------------
describe("helper pembuktian", () => {
  it("kutipan harus potongan persis (hanya spasi ditoleransi)", () => {
    const raw = "Banjir di Desa A.\nButuh tambahan   20 dus air.";
    expect(isExactExcerpt("Butuh tambahan 20 dus air.", raw)).toBe(true);
    expect(isExactExcerpt("butuh tambahan 20 dus air.", raw)).toBe(false);
    expect(isExactExcerpt("Butuh 20 dus air", raw)).toBe(false);
    expect(isExactExcerpt(null, raw)).toBe(false);
  });

  it("angka harus tertulis sebagai digit; tidak menyamakan 20 dengan 200 atau 2.5", () => {
    expect(quantityAppearsIn(20, "butuh 20 dus")).toBe(true);
    expect(quantityAppearsIn(1000, "butuh 1.000 botol")).toBe(true);
    expect(quantityAppearsIn(20, "butuh 200 dus")).toBe(false);
    expect(quantityAppearsIn(2, "butuh 2.5 kg")).toBe(false);
    expect(quantityAppearsIn(20, "butuh dua puluh dus")).toBe(true); // kata bilangan tegas
    expect(quantityAppearsIn(25, "butuh dua puluh dus")).toBe(false);
    expect(quantityAppearsIn(20, "butuh beberapa dus")).toBe(false); // tidak ditebak
  });

  it("satuan harus tertulis eksplisit sebagai kata utuh", () => {
    expect(unitAppearsIn("dus", "20 dus air")).toBe(true);
    expect(unitAppearsIn("kg", "50 Kg beras")).toBe(true);
    expect(unitAppearsIn("liter", "air bersih 20")).toBe(false);
    expect(unitAppearsIn("liter", "lilin 20")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe("pemeriksaan semantik → draf", () => {
  const NORMAL =
    "[SIMULASI] Banjir mulai masuk rumah warga di Desa Contoh Makmur tadi pagi. Masih butuh tambahan 20 dus air mineral dan 30 lembar selimut.";

  it("pesan normal: semua field terbukti dipertahankan", () => {
    const d = toDraftExtraction(
      ai({
        incident_type: "banjir",
        incident_evidence: "Banjir mulai masuk rumah warga",
        location_text: "Desa Contoh Makmur",
        location_evidence: "di Desa Contoh Makmur",
        occurred_at_text: "tadi pagi",
        needs: [
          {
            item: "Air Mineral",
            quantity: 20,
            unit: "dus",
            quantity_basis: "additional",
            evidence_quote: "Masih butuh tambahan 20 dus air mineral",
          },
          {
            item: "selimut",
            quantity: 30,
            unit: "lembar",
            quantity_basis: "additional",
            evidence_quote: "30 lembar selimut",
          },
        ],
      }),
      NORMAL,
      MODEL,
    );
    expect(d.source).toBe("gemini");
    expect(d.model).toBe(MODEL);
    expect(d.incidentType).toBe("banjir");
    expect(d.locationText).toBe("Desa Contoh Makmur");
    expect(d.occurredAtText).toBe("tadi pagi");
    expect(d.needs).toEqual([
      {
        item: "air mineral",
        quantity: 20,
        unit: "dus",
        quantityBasis: "additional",
        evidenceQuote: "Masih butuh tambahan 20 dus air mineral",
      },
      { item: "selimut", quantity: 30, unit: "lembar", quantityBasis: "additional", evidenceQuote: "30 lembar selimut" },
    ]);
    expect(d.warnings).toEqual([]);
  });

  it("pesan ambigu: angka dari ungkapan samar dan satuan tebakan dikosongkan, basis jadi unknown", () => {
    const raw = "[SIMULASI] Longsor di Dusun Uji Lereng. Warga butuh banyak air bersih dan beberapa terpal.";
    const d = toDraftExtraction(
      ai({
        incident_type: "tanah_longsor",
        incident_evidence: "Longsor di Dusun Uji Lereng",
        location_text: "Dusun Uji Lereng",
        location_evidence: "Longsor di Dusun Uji Lereng",
        needs: [
          {
            item: "air bersih",
            quantity: 100, // dikarang dari "banyak"
            unit: "liter", // ditebak
            quantity_basis: "additional",
            evidence_quote: "butuh banyak air bersih",
          },
          {
            item: "terpal",
            quantity: null,
            unit: null,
            quantity_basis: "unknown",
            evidence_quote: "beberapa terpal",
          },
        ],
        uncertainties: ["Jumlah air bersih tidak disebut."],
      }),
      raw,
      MODEL,
    );
    expect(d.needs[0]).toMatchObject({ item: "air bersih", quantity: null, unit: null, quantityBasis: "unknown" });
    expect(d.needs[1]).toMatchObject({ item: "terpal", quantity: null, quantityBasis: "unknown" });
    expect(d.uncertainties).toEqual(["Jumlah air bersih tidak disebut."]);
    expect(d.warnings.some((w) => w.includes("Angka 100"))).toBe(true);
    expect(d.warnings.some((w) => w.includes('Satuan "liter"'))).toBe(true);
    expect(d.warnings).toContain("Ada kebutuhan tanpa kuantitas yang jelas.");
  });

  it("pesan tidak lengkap: lokasi, waktu, dan jenis kejadian yang dikarang dikosongkan", () => {
    const raw = "[SIMULASI] Ada kebakaran rumah, warga butuh selimut dan makanan siap saji secepatnya.";
    const d = toDraftExtraction(
      ai({
        incident_type: "kebakaran",
        incident_evidence: "Kebakaran besar di pasar", // bukan kutipan persis
        location_text: "Kecamatan Fiktif", // tidak ada di pesan
        location_evidence: null,
        occurred_at_text: "kemarin malam", // tidak ada di pesan
        needs: [
          { item: "selimut", quantity: 10, unit: "lembar", quantity_basis: "additional", evidence_quote: null },
        ],
      }),
      raw,
      MODEL,
    );
    expect(d.incidentType).toBeNull();
    expect(d.incidentEvidence).toBeNull();
    expect(d.locationText).toBeNull();
    expect(d.locationEvidence).toBeNull();
    expect(d.occurredAtText).toBeNull();
    expect(d.needs).toEqual([
      { item: "selimut", quantity: null, unit: null, quantityBasis: "unknown", evidenceQuote: null },
    ]);
    expect(d.warnings).toContain("Lokasi tidak ditemukan.");
    expect(d.warnings).toContain("Jenis kejadian tidak ditemukan.");
  });

  it("jenis kejadian tanpa kutipan bukti dikosongkan", () => {
    const d = toDraftExtraction(ai({ incident_type: "banjir" }), "[SIMULASI] Warga butuh beras.", MODEL);
    expect(d.incidentType).toBeNull();
  });

  it("satuan yang tertulis tetapi tidak kompatibel dengan barang dikosongkan", () => {
    const raw = "[SIMULASI] Banjir di Desa A. Butuh 10 liter beras.";
    const d = toDraftExtraction(
      ai({
        needs: [
          { item: "beras", quantity: 10, unit: "liter", quantity_basis: "additional", evidence_quote: "10 liter beras" },
        ],
      }),
      raw,
      MODEL,
    );
    expect(d.needs[0]).toMatchObject({ quantity: 10, unit: null });
    expect(d.warnings.some((w) => w.includes("tidak kompatibel"))).toBe(true);
  });

  it("tidak pernah menghasilkan status terverifikasi", () => {
    const d = toDraftExtraction(ai(), "[SIMULASI] Banjir di desa.", MODEL) as unknown as Record<string, unknown>;
    expect(d).not.toHaveProperty("status");
    expect(d).not.toHaveProperty("verifiedAt");
  });
});

// ---------------------------------------------------------------------------
describe("extractWithAi: redaksi, retry & error (stub, tanpa jaringan)", () => {
  const RAW = "[SIMULASI] Banjir di Desa Uji Coba. Masih butuh tambahan 30 dus air mineral.";
  const valid = JSON.stringify(
    ai({
      incident_type: "banjir",
      incident_evidence: "Banjir di Desa Uji Coba",
      location_text: "Desa Uji Coba",
      location_evidence: "Banjir di Desa Uji Coba",
      needs: [
        {
          item: "air mineral",
          quantity: 30,
          unit: "dus",
          quantity_basis: "additional",
          evidence_quote: "Masih butuh tambahan 30 dus air mineral.",
        },
      ],
    }),
  );

  it("respons valid → draf", async () => {
    const caller = stub(valid);
    const { extraction } = await extractWithAi(RAW, caller);
    expect(extraction.needs[0].quantity).toBe(30);
    expect(caller).toHaveBeenCalledTimes(1);
  });

  it("telepon/NIK/email diredaksi SEBELUM sampai ke model", async () => {
    const seen: string[] = [];
    const caller: AiCaller = async (text) => {
      seen.push(text);
      return valid;
    };
    const raw = `${RAW} Hubungi 0812-3456-7890, NIK 3201234567890001, a@b.id`;
    const { redactions } = await extractWithAi(raw, caller);
    expect(seen[0]).not.toMatch(/0812|3201234567890001|a@b\.id/);
    expect(seen[0]).toContain("[TELEPON]");
    expect(redactions).toBe(3);
  });

  it("respons malformed sekali → retry sekali lalu berhasil", async () => {
    const caller = stub("bukan json", valid);
    const { extraction } = await extractWithAi(RAW, caller);
    expect(extraction.incidentType).toBe("banjir");
    expect(caller).toHaveBeenCalledTimes(2);
  });

  it("respons malformed terus-menerus → ai_invalid_response (tidak diubah jadi draf)", async () => {
    const caller = stub("{}", JSON.stringify({ ...ai(), extra: true }));
    await expectExtractError(extractWithAi(RAW, caller), 502, "ai_invalid_response");
    expect(caller).toHaveBeenCalledTimes(2);
  });

  it("error API dipetakan, log tanpa isi pesan", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    await expectExtractError(extractWithAi(RAW, () => Promise.reject({ status: 429 })), 503, "ai_rate_limited");
    await expectExtractError(extractWithAi(RAW, () => Promise.reject({ status: 500 })), 502, "ai_unavailable");
    const abort: AiCaller = () => Promise.reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    await expectExtractError(extractWithAi(RAW, abort), 504, "ai_timeout");
    for (const call of quiet.mock.calls) expect(JSON.stringify(call)).not.toContain("Desa Uji Coba");
    quiet.mockRestore();
  });

  it("handler: cache hash, batas laju, dan validasi ukuran", async () => {
    const caller = stub(valid);
    const deps = { caller, cache: new HashCache<never>(5), limiter: new RateLimiter(60_000, 1) };
    const post = (text: unknown) =>
      handleExtract(new Request("http://x/api/extract", { method: "POST", body: JSON.stringify({ text }) }), deps as never);
    const r1 = await post(RAW);
    expect(r1.status).toBe(200);
    expect((await r1.json()).cached).toBe(false);
    const r2 = await post(RAW); // cache: tidak memanggil model dan tidak memakai kuota laju
    expect((await r2.json()).cached).toBe(true);
    expect(caller).toHaveBeenCalledTimes(1);
    expect((await post(RAW + " lagi")).status).toBe(429);
    expect((await post("ab")).status).toBe(400);
    expect((await post("x".repeat(5001))).status).toBe(400);
    const bad = await handleExtract(new Request("http://x", { method: "POST", body: "{bukan json" }), deps as never);
    expect(bad.status).toBe(400);
  });

  it("handler: tanpa kunci → 503 jujur, bukan data tiruan", async () => {
    const res = await handleExtract(new Request("http://x", { method: "POST", body: JSON.stringify({ text: RAW }) }), { hasKey: () => false });
    expect(res.status).toBe(503);
  });
});

// ---------------------------------------------------------------------------
describe("draf AI saat penyimpanan & pesan duplikat", () => {
  const RAW = "[SIMULASI] Banjir di Desa Uji Coba. Masih butuh tambahan 30 dus air mineral.";
  const draft = toDraftExtraction(
    ai({
      incident_type: "banjir",
      incident_evidence: "Banjir di Desa Uji Coba",
      location_text: "Desa Uji Coba",
      location_evidence: "Banjir di Desa Uji Coba",
      needs: [
        {
          item: "air mineral",
          quantity: 30,
          unit: "dus",
          quantity_basis: "additional",
          evidence_quote: "Masih butuh tambahan 30 dus air mineral.",
        },
      ],
    }),
    RAW,
    MODEL,
  );

  it("draf hanya diterima bila semua kutipan cocok dengan teks laporan", () => {
    expect(sanitizeClientExtraction(draft, RAW)).toEqual(draft);
    expect(sanitizeClientExtraction(draft, "[SIMULASI] Teks lain sama sekali.")).toBeNull();
    expect(sanitizeClientExtraction({ ...draft, source: "simulated" }, RAW)).toBeNull();
    expect(sanitizeClientExtraction("bukan objek", RAW)).toBeNull();
  });

  it("pesan duplikat persis: ekstraksi tetap draf, tetapi penyimpanan kedua ditolak", async () => {
    const repo = new MockRepository({ reports: [], inventory: [] });
    const body = (action: "save" | "verify") => ({
      rawText: RAW,
      incidentType: draft.incidentType,
      locationText: draft.locationText,
      needs: draft.needs,
      action,
      extraction: draft,
    });
    const first = await submitReport(repo, body("save"));
    // Draf AI tidak pernah otomatis terverifikasi.
    expect(first.report.status).toBe("pending_review");
    expect(first.report.extraction?.source).toBe("gemini");

    await expectServiceError(submitReport(repo, body("verify")), 409, "exact_duplicate");
  });
});
