import "server-only";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ServiceError } from "@/lib/services/errors";
import { MockRepository } from "./mock-repository";
import type { DataRepository } from "./repository";
import { SupabaseRepository } from "./supabase-repository";

const globalForMock = globalThis as unknown as { __poskoMockRepo?: MockRepository };

function getMockRepository(): MockRepository {
  globalForMock.__poskoMockRepo ??= new MockRepository();
  return globalForMock.__poskoMockRepo;
}

export interface RequestContext {
  repo: DataRepository;
  user: { id: string; email: string | null } | null;
}

/**
 * Menentukan repository untuk satu request dan MENEGAKKAN autentikasi.
 * - Mode Supabase: wajib login dan terdaftar sebagai operator (401/403 jika tidak).
 *   RLS di database tetap menjadi lapisan pertahanan kedua.
 * - Mode mock: tanpa login, hanya data simulasi in-memory.
 */
export async function getRequestContext(): Promise<RequestContext> {
  if (!isSupabaseConfigured()) {
    return { repo: getMockRepository(), user: null };
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

export function getDataMode(): DataRepository["mode"] {
  return isSupabaseConfigured() ? "supabase" : "mock";
}
