// Backend mode prototipe: menjalankan service layer yang SAMA dengan server
// (validasi Zod, fingerprint, duplikat, agregasi) di atas LocalStorageRepository.
// Catatan: di mode ini tidak ada batas kepercayaan server — data hanya milik
// browser ini. Mode Supabase menegakkan aturan yang sama di server + RLS.
import type { Api, ApiResult } from "@/lib/api-client";
import { RuleBasedExtractor } from "@/lib/domain/extractors";
import { ServiceError } from "@/lib/services/errors";
import {
  checkPotentialDuplicate,
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
  /** Baca: selalu mulai dari isi storage terbaru (tab lain mungkin sudah menulis). */
  const read = <T>(fn: () => Promise<T>) =>
    run(async () => {
      repo.sync();
      return fn();
    });
  /**
   * Tulis: sinkron dulu, lalu jalankan. Bila penulisan ke storage gagal, perubahan
   * di memori dibatalkan sehingga layar tidak menampilkan data yang sebenarnya tidak tersimpan.
   */
  const mutate = <T>(fn: () => Promise<T>) =>
    run(async () => {
      repo.sync();
      const snap = repo.snapshot();
      const data = await fn();
      if (repo.lastPersistFailed) {
        repo.restore(snap);
        throw new ServiceError(507, "storage_failed", "Perubahan tidak dapat disimpan ke localStorage browser (penyimpanan penuh atau diblokir). Tidak ada data yang berubah.");
      }
      return data;
    });
  return {
    repo,
    reset: () => repo.reset(),
    extract: extractRuleBased,
    submitReport: (rawText, payload, action, extraction, extras) =>
      mutate(() => submitReport(repo, { rawText, ...payload, action, extraction, ...extras })),
    reviewReport: (id, payload, action) => mutate(() => reviewReport(repo, id, { ...payload, action })),
    getReport: (id) => read(() => getReportDetail(repo, id)),
    reviewQueue: () => read(async () => ({ reports: await listReviewQueue(repo) })),
    dashboard: () => read(() => getDashboard(repo)),
    upsertInventory: (body) => mutate(() => upsertInventory(repo, body)),
    findDuplicate: (draft, excludeId) => read(() => checkPotentialDuplicate(repo, draft, excludeId)),
  };
}
