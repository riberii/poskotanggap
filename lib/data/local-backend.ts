// Backend mode prototipe: menjalankan service layer yang SAMA dengan server
// (validasi Zod, fingerprint, duplikat, agregasi) di atas LocalStorageRepository.
// Catatan: di mode ini tidak ada batas kepercayaan server — data hanya milik
// browser ini. Mode Supabase menegakkan aturan yang sama di server + RLS.
import type { Api, ApiResult } from "@/lib/api-client";
import { RuleBasedExtractor } from "@/lib/domain/extractors";
import { ServiceError } from "@/lib/services/errors";
import {
  getDashboard,
  getReportDetail,
  listReviewQueue,
  parseExtractRequest,
  reviewReport,
  submitReport,
  upsertInventory,
} from "@/lib/services/reports";
import { LocalStorageRepository, type KeyValueStorage } from "./local-storage-repository";

async function run<T>(fn: () => Promise<T>): Promise<ApiResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (err instanceof ServiceError) {
      return { ok: false, error: { status: err.status, code: err.code, message: err.message, details: err.details ?? null } };
    }
    console.error("[local] unexpected error", err);
    return { ok: false, error: { status: 500, code: "internal_error", message: "Terjadi kesalahan di browser.", details: null } };
  }
}

/** Ekstraksi berbasis aturan (bukan AI); murni, tidak menyentuh storage. */
export function extractRuleBased(rawText: string) {
  return run(async () => {
    const text = parseExtractRequest({ rawText }); // kosong / > 5000 karakter ditolak
    return { extraction: await RuleBasedExtractor.extract(text), status: "draft" as const };
  });
}

export interface LocalBackend extends Api {
  repo: LocalStorageRepository;
  reset(): void;
}

export function createLocalBackend(storage: KeyValueStorage): LocalBackend {
  const repo = new LocalStorageRepository(storage);
  const guardPersist = <T>(data: T): T => {
    if (repo.lastPersistFailed) {
      throw new ServiceError(507, "storage_failed", "Perubahan tidak dapat disimpan ke localStorage browser (penyimpanan penuh atau diblokir).");
    }
    return data;
  };
  return {
    repo,
    reset: () => repo.reset(),
    extract: extractRuleBased,
    submitReport: (rawText, payload, action, extraction) =>
      run(async () => guardPersist(await submitReport(repo, { rawText, ...payload, action, extraction }))),
    reviewReport: (id, payload, action) => run(async () => guardPersist(await reviewReport(repo, id, { ...payload, action }))),
    getReport: (id) => run(() => getReportDetail(repo, id)),
    reviewQueue: () => run(async () => ({ reports: await listReviewQueue(repo) })),
    dashboard: () => run(() => getDashboard(repo)),
    upsertInventory: (body) => run(async () => guardPersist(await upsertInventory(repo, body))),
  };
}
