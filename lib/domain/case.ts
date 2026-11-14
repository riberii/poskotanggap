// Alur kerja tiket kasus. Murni & deterministik; dipakai server (penegakan aturan) dan UI (label).
// Empat dimensi dipisah: status kasus, prioritas, tingkat ancaman, status bantuan.
import { z } from "zod";

export const CASE_STATUSES = [
  "new",
  "open",
  "under_review",
  "verified",
  "rejected",
  "awaiting_reporter",
  "awaiting_team",
  "escalated",
  "reopened",
  "duplicate",
  "resolved",
  "closed",
  "cancelled",
] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  new: "Baru",
  open: "Dibuka",
  under_review: "Sedang Ditinjau",
  verified: "Terverifikasi",
  rejected: "Ditolak",
  awaiting_reporter: "Menunggu Respons Pelapor",
  awaiting_team: "Menunggu Respons Tim",
  escalated: "Dieskalasi",
  reopened: "Dibuka Kembali",
  duplicate: "Duplikat",
  resolved: "Selesai Ditangani",
  closed: "Ditutup",
  cancelled: "Dibatalkan",
};

export const CASE_STATUS_TONE: Record<CaseStatus, "ok" | "warn" | "danger" | "neutral" | "accent" | "dup"> = {
  new: "accent",
  open: "accent",
  under_review: "warn",
  verified: "ok",
  rejected: "danger",
  awaiting_reporter: "warn",
  awaiting_team: "warn",
  escalated: "danger",
  reopened: "warn",
  duplicate: "dup",
  resolved: "ok",
  closed: "neutral",
  cancelled: "neutral",
};

/** Peralihan sah yang dilakukan TIM. Penolakan (rejected) hanya bisa keluar lewat banding yang disetujui. */
export const CASE_TRANSITIONS: Record<CaseStatus, readonly CaseStatus[]> = {
  new: ["open", "under_review", "rejected", "duplicate", "cancelled"],
  open: ["under_review", "verified", "rejected", "awaiting_reporter", "duplicate", "escalated", "cancelled"],
  under_review: ["open", "verified", "rejected", "awaiting_reporter", "duplicate", "escalated", "cancelled"],
  verified: ["awaiting_reporter", "escalated", "resolved", "closed", "cancelled"],
  rejected: [],
  awaiting_reporter: ["under_review", "open", "verified", "rejected", "closed"],
  awaiting_team: ["under_review", "open", "verified", "rejected", "awaiting_reporter"],
  escalated: ["under_review", "verified", "awaiting_reporter", "resolved", "closed"],
  reopened: ["under_review", "open", "verified", "rejected", "awaiting_reporter", "escalated", "duplicate", "cancelled"],
  duplicate: [],
  resolved: ["closed", "reopened"],
  closed: ["reopened"],
  cancelled: [],
};

export const TERMINAL_REJECTED: readonly CaseStatus[] = ["rejected", "duplicate", "cancelled"];
/** Status tempat laporan dianggap sudah lolos verifikasi (bantuan boleh diatur). */
export const ASSISTANCE_ELIGIBLE: readonly CaseStatus[] = ["verified", "escalated", "awaiting_reporter", "awaiting_team", "reopened"];
/** Status yang membuat laporan tidak lagi aktif. */
export const INACTIVE_STATUSES: readonly CaseStatus[] = ["rejected", "duplicate", "cancelled", "resolved", "closed"];

export const canTransition = (from: CaseStatus, to: CaseStatus): boolean => CASE_TRANSITIONS[from].includes(to);

/** Alasan wajib diisi saat menolak; ditampilkan ke pelapor. */
export const REASON_REQUIRED: readonly CaseStatus[] = ["rejected"];
export const REASON_MIN = 10;
export const REASON_MAX = 500;

/** Status inti (dipakai agregasi kebutuhan) yang sesuai dengan status kasus. */
export function coreStatusFor(s: CaseStatus, current: "pending_review" | "verified" | "rejected"): "pending_review" | "verified" | "rejected" {
  if (s === "rejected" || s === "duplicate" || s === "cancelled") return "rejected";
  if (s === "verified") return "verified";
  if (s === "reopened" || s === "new") return "pending_review";
  return current;
}

// --- Prioritas, ancaman, bantuan ---
export const CASE_PRIORITIES = ["low", "medium", "high", "critical"] as const;
export type CasePriority = (typeof CASE_PRIORITIES)[number];
export const CASE_PRIORITY_LABELS: Record<CasePriority, string> = { low: "Rendah", medium: "Sedang", high: "Tinggi", critical: "Kritis" };
export const CASE_PRIORITY_RANK: Record<CasePriority, number> = { low: 0, medium: 1, high: 2, critical: 3 };

export const THREAT_LEVELS = ["none", "low", "moderate", "high", "extreme"] as const;
export type ThreatLevel = (typeof THREAT_LEVELS)[number];
export const THREAT_LABELS: Record<ThreatLevel, string> = {
  none: "Belum dinilai",
  low: "Ancaman Rendah",
  moderate: "Ancaman Sedang",
  high: "Ancaman Tinggi",
  extreme: "Ancaman Ekstrem",
};
export const THREAT_RANK: Record<ThreatLevel, number> = { none: 0, low: 1, moderate: 2, high: 3, extreme: 4 };

export const ASSISTANCE_STATUSES = [
  "none",
  "awaiting_help",
  "waitlisted",
  "postponed",
  "capacity_full",
  "assigned",
  "en_route",
  "on_scene",
  "in_progress",
  "completed",
] as const;
export type AssistanceStatus = (typeof ASSISTANCE_STATUSES)[number];
export const ASSISTANCE_LABELS: Record<AssistanceStatus, string> = {
  none: "Belum Ada Bantuan",
  awaiting_help: "Menunggu Bantuan Tersedia",
  waitlisted: "Daftar Tunggu",
  postponed: "Ditunda",
  capacity_full: "Kapasitas Bantuan Penuh",
  assigned: "Ditugaskan",
  en_route: "Bantuan Menuju Lokasi",
  on_scene: "Di Lokasi",
  in_progress: "Bantuan Sedang Berlangsung",
  completed: "Bantuan Selesai",
};
const WAITING: AssistanceStatus[] = ["awaiting_help", "waitlisted", "postponed", "capacity_full"];
export const ASSISTANCE_TRANSITIONS: Record<AssistanceStatus, readonly AssistanceStatus[]> = {
  none: [...WAITING, "assigned"],
  awaiting_help: ["waitlisted", "postponed", "capacity_full", "assigned"],
  waitlisted: ["awaiting_help", "postponed", "capacity_full", "assigned"],
  postponed: ["awaiting_help", "waitlisted", "capacity_full", "assigned"],
  capacity_full: ["awaiting_help", "waitlisted", "postponed", "assigned"],
  assigned: ["en_route", "awaiting_help", "postponed"],
  en_route: ["on_scene", "assigned"],
  on_scene: ["in_progress", "en_route"],
  in_progress: ["completed", "on_scene"],
  completed: [],
};

export const ASSIST_NEEDS_TEAM: readonly AssistanceStatus[] = ["assigned", "en_route", "on_scene", "in_progress", "completed"];

export type RuleResult = { ok: true } | { ok: false; code: string; message: string };
const bad = (code: string, message: string): RuleResult => ({ ok: false, code, message });

export function checkCaseTransition(from: CaseStatus, to: CaseStatus, reason: string | null | undefined): RuleResult {
  if (from === to) return bad("same_status", "Status kasus sudah sama.");
  if (from === "rejected") return bad("rejected_locked", "Kasus yang ditolak hanya dapat dibuka kembali lewat banding pelapor.");
  if (!canTransition(from, to)) return bad("invalid_transition", `Kasus berstatus “${CASE_STATUS_LABELS[from]}” tidak dapat langsung menjadi “${CASE_STATUS_LABELS[to]}”.`);
  if (REASON_REQUIRED.includes(to) && (reason ?? "").trim().length < REASON_MIN) return bad("reason_required", `Alasan penolakan wajib diisi (minimal ${REASON_MIN} karakter).`);
  return { ok: true };
}

export function checkAssistanceChange(
  caseStatus: CaseStatus,
  from: AssistanceStatus,
  to: AssistanceStatus,
  assignedTeam: string | null | undefined,
): RuleResult {
  if (from === to) return bad("same_status", "Status bantuan sudah sama.");
  if (!ASSISTANCE_ELIGIBLE.includes(caseStatus)) return bad("not_verified", "Status bantuan hanya dapat diatur setelah kasus terverifikasi.");
  if (!ASSISTANCE_TRANSITIONS[from].includes(to)) return bad("invalid_transition", `Status bantuan “${ASSISTANCE_LABELS[from]}” tidak dapat langsung menjadi “${ASSISTANCE_LABELS[to]}”.`);
  if (ASSIST_NEEDS_TEAM.includes(to) && !(assignedTeam ?? "").trim()) return bad("team_required", "Tetapkan tim yang bertugas sebelum menugaskan bantuan.");
  return { ok: true };
}

// --- Banding (tepat satu kali) ---
export const APPEAL_STATES = ["none", "pending", "approved", "rejected"] as const;
export type AppealState = (typeof APPEAL_STATES)[number];
export const APPEAL_LABELS: Record<AppealState, string> = {
  none: "Belum ada banding",
  pending: "Banding menunggu keputusan tim",
  approved: "Banding disetujui",
  rejected: "Banding ditolak (final)",
};
export const APPEAL_MESSAGE_MIN = 20;
export const APPEAL_MESSAGE_MAX = 1000;

/** Banding hanya sah untuk kasus ditolak yang belum pernah dibanding. */
export function canAppeal(caseStatus: CaseStatus, appeal: AppealState): RuleResult {
  if (caseStatus !== "rejected") return bad("not_rejected", "Banding hanya untuk laporan yang ditolak.");
  if (appeal !== "none") return bad("appeal_used", appeal === "pending" ? "Banding Anda sedang diproses." : "Kesempatan banding sudah dipakai dan tidak dapat diulang.");
  return { ok: true };
}

export const appealSchema = z.object({ message: z.string().trim().min(APPEAL_MESSAGE_MIN, `Pesan banding minimal ${APPEAL_MESSAGE_MIN} karakter`).max(APPEAL_MESSAGE_MAX) }).strict();
export const appealDecisionSchema = z
  .object({ decision: z.enum(["approve", "reject"]), note: z.string().trim().min(REASON_MIN, `Catatan minimal ${REASON_MIN} karakter`).max(REASON_MAX) })
  .strict();

// --- Peran & izin ---
export const ROLES = ["operator", "admin"] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABELS: Record<Role, string> = { operator: "Operator", admin: "Administrator" };
export const PERMISSIONS = [
  "case.read",
  "case.update",
  "case.note",
  "case.message",
  "export",
  "announcement.manage",
  "announcement.official",
  "moderation.block_temporary",
  "moderation.block_permanent",
  "moderation.unblock",
  "moderation.read",
  "audit.read",
] as const;
export type Permission = (typeof PERMISSIONS)[number];
const OPERATOR_PERMS: Permission[] = ["case.read", "case.update", "case.note", "case.message", "export", "announcement.manage", "moderation.block_temporary", "moderation.read"];
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  operator: OPERATOR_PERMS,
  admin: [...PERMISSIONS],
};
export const can = (role: Role | null | undefined, perm: Permission): boolean => !!role && ROLE_PERMISSIONS[role].includes(perm);

// --- Skema permintaan tim ---
const text = (max: number) => z.string().trim().max(max);
export const caseUpdateSchema = z
  .object({
    caseStatus: z.enum(CASE_STATUSES).optional(),
    reason: text(REASON_MAX).nullish(),
    priority: z.enum(CASE_PRIORITIES).optional(),
    threatLevel: z.enum(THREAT_LEVELS).optional(),
    assistanceStatus: z.enum(ASSISTANCE_STATUSES).optional(),
    assignedTeam: text(80).nullish(),
    assignedResponder: text(80).nullish(),
    archived: z.boolean().optional(),
    isSimulation: z.boolean().optional(),
    note: text(500).nullish(),
  })
  .strict();
export type CaseUpdate = z.infer<typeof caseUpdateSchema>;
export const caseNoteSchema = z.object({ note: z.string().trim().min(2).max(1000) }).strict();
