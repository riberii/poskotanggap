import { handle, readJson } from "@/lib/http/handle";
import { ServiceError } from "@/lib/services/errors";
import { checkRateLimit, extractWithGemini } from "@/lib/services/gemini-extractor";
import { parseExtractRequest } from "@/lib/services/reports";

/**
 * POST /api/extract-report — ekstraksi Gemini menjadi DRAF untuk review manusia.
 * Tidak menyimpan apa pun dan tidak pernah memverifikasi laporan.
 */
export async function POST(request: Request) {
  return handle(async (ctx) => {
    // 1. Autentikasi operator ditegakkan oleh handle() → getRequestContext() (mode Supabase).
    //    Mode mock tidak punya login, sehingga AI dimatikan kecuali diizinkan eksplisit di server.
    if (!ctx.user && process.env.AI_EXTRACTION_ALLOW_MOCK_MODE !== "true") {
      throw new ServiceError(
        403,
        "ai_requires_login",
        "Ekstraksi AI hanya untuk operator yang login. Aplikasi berjalan dalam mode mock tanpa login, sehingga ekstraksi AI dinonaktifkan. Isi field secara manual.",
      );
    }
    const clientKey =
      ctx.user?.id ?? request.headers.get("x-nf-client-connection-ip") ?? request.headers.get("x-forwarded-for") ?? "anon";
    // 2–3. Validasi teks (kosong / terlalu panjang ditolak).
    const rawText = parseExtractRequest(await readJson(request));
    checkRateLimit(clientKey);
    // 4–8. Gemini + validasi Zod + konsistensi semantik → draf.
    const draft = await extractWithGemini(rawText);
    return { extraction: draft, status: "draft" as const };
  });
}
