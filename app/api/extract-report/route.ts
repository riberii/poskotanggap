import { isAiExtractionEnabled } from "@/lib/data";
import { handle, readJson } from "@/lib/http/handle";
import { ServiceError } from "@/lib/services/errors";
import { checkRateLimit, extractWithGemini } from "@/lib/services/gemini-extractor";
import { parseExtractRequest } from "@/lib/services/reports";

/**
 * POST /api/extract-report — ekstraksi Gemini menjadi DRAF untuk review manusia.
 * Tidak menyimpan apa pun dan tidak pernah memverifikasi laporan.
 * NONAKTIF kecuali AI_EXTRACTION_PROVIDER=gemini (lihat isAiExtractionEnabled).
 */
export async function POST(request: Request) {
  // 1. Autentikasi operator ditegakkan oleh handle() → getRequestContext() (hanya mode Supabase).
  return handle(async (ctx) => {
    if (!isAiExtractionEnabled()) {
      throw new ServiceError(
        503,
        "ai_disabled",
        "Ekstraksi AI eksternal tidak diaktifkan di server ini. Gunakan ekstraksi berbasis aturan atau isi manual.",
        { retryable: false },
      );
    }
    // 2–3. Validasi teks (kosong / terlalu panjang ditolak).
    const rawText = parseExtractRequest(await readJson(request));
    checkRateLimit(ctx.user.id);
    // 4–8. Gemini + validasi Zod + konsistensi semantik → draf.
    const draft = await extractWithGemini(rawText);
    return { extraction: draft, status: "draft" as const };
  });
}
