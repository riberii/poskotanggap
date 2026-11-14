import { createContext, useContext, useEffect, useMemo } from "react";
import { extractHybrid } from "@/lib/ai-extract-client";
import type { Api } from "@/lib/api-client";
import type { DataMode } from "@/lib/data/repository";
import { createLocalBackend, extractRuleBased, type LocalBackend } from "@/lib/data/local-backend";
import type { KeyValueStorage } from "@/lib/data/local-storage-repository";
import { flushUnsynced, syncCreated, syncStatus } from "@/lib/remote";

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
  extractHybrid: (t) => extractHybrid(t, extractRuleBased),
  submitReport: async (...a) => {
    const res = await getLocalBackend().submitReport(...a);
    if (res.ok) await syncCreated(res.data.report);
    return res;
  },
  reviewReport: async (...a) => {
    const res = await getLocalBackend().reviewReport(...a);
    if (res.ok) await syncStatus(res.data.report);
    return res;
  },
  getReport: (id) => getLocalBackend().getReport(id),
  reviewQueue: () => getLocalBackend().reviewQueue(),
  dashboard: () => getLocalBackend().dashboard(),
  upsertInventory: (b) => getLocalBackend().upsertInventory(b),
  arrangeAid: async (id, note) => {
    const res = await getLocalBackend().arrangeAid(id, note);
    if (res.ok) await syncStatus(res.data.report);
    return res;
  },
  getReportStatus: (code) => getLocalBackend().getReportStatus(code),
  findDuplicate: (d, id) => getLocalBackend().findDuplicate(d, id),
};

interface DataModeValue {
  mode: DataMode;
  /** Semua operasi data. `api.extract` = ekstraksi aturan (bukan AI). */
  api: Api;
}

const Ctx = createContext<DataModeValue | null>(null);

export function DataModeProvider({ children }: { children: React.ReactNode }) {
  const value = useMemo<DataModeValue>(() => ({ mode: "local", api: localApi }), []);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDataMode(): DataModeValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDataMode harus dipakai di dalam DataModeProvider");
  return v;
}

/** Kirim ulang perubahan yang tertunda (jaringan putus). Dipanggil saat halaman dibuka dan saat kembali online. */
export function useFlushUnsynced() {
  useEffect(() => {
    const run = () => void flushUnsynced((id) => getLocalBackend().repo.getReport(id));
    run();
    window.addEventListener("online", run);
    return () => window.removeEventListener("online", run);
  }, []);
}
