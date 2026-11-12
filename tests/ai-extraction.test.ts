import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@google/genai";
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
import { checkRateLimit, extractWithGemini, type GeminiCaller } from "@/lib/services/gemini-extractor";
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

const stub = (...responses: (string | undefined)[]): GeminiCaller => {
  const fn = vi.fn<GeminiCaller>();
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

  it("membatasi laju permintaan per pengguna", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 10; i++) checkRateLimit(key, 1_000);
    expect(() => checkRateLimit(key, 1_000)).toThrow(ServiceError);
    expect(() => checkRateLimit(key, 1_000 + 61_000)).not.toThrow();
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
    expect(quantityAppearsIn(20, "butuh dua puluh dus")).toBe(false);
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
describe("extractWithGemini: retry & error handling (stub, tanpa jaringan)", () => {
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
    const d = await extractWithGemini(RAW, caller);
    expect(d.needs[0].quantity).toBe(30);
    expect(caller).toHaveBeenCalledTimes(1);
    expect(vi.mocked(caller).mock.calls[0][1]).toBe(process.env.GEMINI_MODEL?.trim() || MODEL);
  });

  it("respons malformed sekali → retry sekali lalu berhasil", async () => {
    const caller = stub("bukan json", valid);
    const d = await extractWithGemini(RAW, caller);
    expect(d.incidentType).toBe("banjir");
    expect(caller).toHaveBeenCalledTimes(2);
  });

  it("respons malformed terus-menerus → error ai_invalid_response (tidak diubah jadi draf)", async () => {
    const caller = stub("{}", JSON.stringify({ ...ai(), extra: true }));
    const err = await expectServiceError(extractWithGemini(RAW, caller), 502, "ai_invalid_response");
    expect((err.details as { retryable: boolean }).retryable).toBe(true);
    expect(caller).toHaveBeenCalledTimes(2);
  });

  it("error API dipetakan ke pesan yang dapat dicoba ulang", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const rate: GeminiCaller = () => Promise.reject(new ApiError({ message: "quota", status: 429 }));
    await expectServiceError(extractWithGemini(RAW, rate), 503, "ai_rate_limited");
    const down: GeminiCaller = () => Promise.reject(new ApiError({ message: "down", status: 500 }));
    await expectServiceError(extractWithGemini(RAW, down), 502, "ai_unavailable");
    const abort: GeminiCaller = () => Promise.reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    await expectServiceError(extractWithGemini(RAW, abort), 504, "ai_timeout");
    // Log tidak memuat isi pesan laporan.
    for (const call of quiet.mock.calls) expect(JSON.stringify(call)).not.toContain("Desa Uji Coba");
    quiet.mockRestore();
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

    const again = await extractWithGemini(RAW, stub(JSON.stringify(ai())));
    expect(again.source).toBe("gemini");
    await expectServiceError(submitReport(repo, body("verify")), 409, "exact_duplicate");
  });
});
