import "server-only";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ServiceError } from "@/lib/services/errors";
import type { DataMode, DataRepository } from "./repository";
import { SupabaseRepository } from "./supabase-repository";

export interface RequestContext {
  repo: DataRepository;
  user: { id: string; email: string | null };
}

/**
 * Menentukan repository untuk satu request dan MENEGAKKAN autentikasi.
 * - Mode Supabase: wajib login dan terdaftar sebagai operator (401/403 jika tidak).
 *   RLS di database tetap menjadi lapisan pertahanan kedua.
 * - Mode local (tanpa env Supabase): server TIDAK menyimpan data operasional sama sekali.
 *   Data prototipe ada di localStorage browser (lib/data/local-storage-repository.ts),
 *   sehingga route /api/* menolak permintaan data.
 */
export async function getRequestContext(): Promise<RequestContext> {
  if (!isSupabaseConfigured()) {
    throw new ServiceError(
      409,
      "local_mode",
      "Server berjalan dalam mode prototipe: data disimpan di localStorage browser, bukan di server.",
    );
  }
  const db = await createSupabaseServerClient();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) {
    throw new ServiceError(401, "unauthenticated", "Silakan login sebagai operator.");
  }
  const repo = new SupabaseRepository(db);
  if (!(await repo.isCurrentUserOperator(data.user.id))) {
    throw new ServiceError(403, "not_operator", "Akun ini belum terdaftar sebagai operator.");
  }
  return { repo, user: { id: data.user.id, email: data.user.email ?? null } };
}

export function getDataMode(): DataMode {
  return isSupabaseConfigured() ? "supabase" : "local";
}

/**
 * Ekstraksi AI eksternal NONAKTIF secara default. Aktif hanya bila
 * AI_EXTRACTION_PROVIDER=gemini di env server DAN mode Supabase (operator login).
 */
export function isAiExtractionEnabled(): boolean {
  return getDataMode() === "supabase" && process.env.AI_EXTRACTION_PROVIDER?.trim() === "gemini";
}
