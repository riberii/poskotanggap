"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Client browser — hanya untuk login/logout. Data operasional diakses lewat /api/*. */
export function createSupabaseBrowserClient(url: string, anonKey: string) {
  return createBrowserClient(url, anonKey);
}
