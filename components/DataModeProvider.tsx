"use client";

import { createContext, useContext, useMemo } from "react";
import { httpApi, type Api, type ApiResult } from "@/lib/api-client";
import type { DataMode } from "@/lib/data/repository";
import { createLocalBackend, extractRuleBased, type LocalBackend } from "@/lib/data/local-backend";
import type { KeyValueStorage } from "@/lib/data/local-storage-repository";
import type { ExtractionResult } from "@/lib/domain/types";

/** Memori satu backend localStorage per tab; dibuat malas agar tidak menyentuh storage saat SSR. */
let localBackend: LocalBackend | null = null;
export function getLocalBackend(): LocalBackend {
  if (typeof window === "undefined") throw new Error("Backend localStorage hanya tersedia di browser.");
  localBackend ??= createLocalBackend(browserStorage());
  return localBackend;
}

/** localStorage bila bisa diakses; bila diblokir browser, penulisan akan gagal dan dilaporkan ke operator. */
function browserStorage(): KeyValueStorage {
  try {
    return window.localStorage;
  } catch {
    const fail = () => {
      throw new Error("localStorage tidak tersedia");
    };
    return { getItem: () => null, setItem: fail, removeItem: fail };
  }
}

/** Api yang meneruskan setiap panggilan ke backend localStorage saat dipanggil (bukan saat render). */
const localApi: Api = {
  extract: extractRuleBased,
  submitReport: (...a) => getLocalBackend().submitReport(...a),
  reviewReport: (...a) => getLocalBackend().reviewReport(...a),
  getReport: (id) => getLocalBackend().getReport(id),
  reviewQueue: () => getLocalBackend().reviewQueue(),
  dashboard: () => getLocalBackend().dashboard(),
  upsertInventory: (b) => getLocalBackend().upsertInventory(b),
  findDuplicate: (d, id) => getLocalBackend().findDuplicate!(d, id),
};

type ExtractFn = (rawText: string) => Promise<ApiResult<{ extraction: ExtractionResult; status: "draft" }>>;

interface DataModeValue {
  mode: DataMode;
  /** Semua operasi data. `api.extract` = RuleBasedExtractor (bukan AI) di kedua mode. */
  api: Api;
  /** Ekstraksi AI server-side; null bila tidak diaktifkan di server. */
  extractAi: ExtractFn | null;
}

const Ctx = createContext<DataModeValue | null>(null);

export function DataModeProvider({
  mode,
  aiEnabled,
  children,
}: {
  mode: DataMode;
  aiEnabled: boolean;
  children: React.ReactNode;
}) {
  const value = useMemo<DataModeValue>(() => {
    if (mode === "local") return { mode, api: localApi, extractAi: null };
    // Mode Supabase: data via server; ekstraksi berbasis aturan tetap dihitung lokal (fungsi murni),
    // server memvalidasi ulang semua nilai saat laporan disimpan.
    return {
      mode,
      api: { ...httpApi, extract: extractRuleBased },
      extractAi: aiEnabled ? httpApi.extract : null,
    };
  }, [mode, aiEnabled]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDataMode(): DataModeValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDataMode harus dipakai di dalam DataModeProvider");
  return v;
}
