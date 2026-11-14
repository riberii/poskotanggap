import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabasePublicConfig } from "./config";

/**
 * Client Supabase untuk Route Handler / Server Component.
 * Memakai anon key + cookie sesi user, sehingga RLS SELALU berlaku.
 * Service-role key sengaja TIDAK dipakai di aplikasi.
 */
export async function createSupabaseServerClient() {
  const config = getSupabasePublicConfig();
  if (!config) throw new Error("Supabase belum dikonfigurasi");
  const cookieStore = await cookies();
  return createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Dipanggil dari Server Component: cookie tidak bisa ditulis, proxy yang menyegarkan sesi.
        }
      },
    },
  });
}
