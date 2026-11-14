// Bentuk data kasus untuk klien (pelapor & tim). Murni; tanpa akses database.
import {
  APPEAL_LABELS,
  ASSISTANCE_LABELS,
  CASE_STATUS_LABELS,
  canAppeal,
  CASE_PRIORITY_LABELS,
  THREAT_LABELS,
  type AppealState,
  type AssistanceStatus,
  type CasePriority,
  type CaseStatus,
  type ThreatLevel,
} from "./case";
import { categoryLabel, groupLabel, type IncidentCategory } from "./categories";

export interface CaseEventView {
  id: number;
  kind: string;
  actor: string;
  label: string;
  detail: string | null;
  visibility: "public" | "internal";
  at: string;
}

/** Yang boleh dilihat PELAPOR. Tidak memuat kontak, prioritas/ancaman internal, nama petugas, atau catatan internal. */
export interface ReporterCaseView {
  code: string;
  submittedAt: string;
  updatedAt: string;
  simulation: boolean;
  categoryLabel: string;
  groupLabel: string;
  locationText: string | null;
  excerpt: string;
  caseStatus: CaseStatus;
  caseStatusLabel: string;
  assistanceStatus: AssistanceStatus;
  assistanceLabel: string;
  assignedTeam: string | null;
  rejectionReason: string | null;
  appeal: { state: AppealState; label: string; message: string | null; decisionNote: string | null; canAppeal: boolean; blockedReason: string | null };
  canCancel: boolean;
  timeline: CaseEventView[];
}

export interface CaseRowInput {
  code: string;
  submittedAt: Date;
  updatedAt: Date;
  isSimulation: boolean;
  categoryGroup: string | null;
  category: string | null;
  customCategory: string | null;
  caseStatus: string;
  priority: string;
  threatLevel: string;
  assistanceStatus: string;
  rejectionReason: string | null;
  appealState: string;
  appealMessage: string | null;
  appealDecisionNote: string | null;
  assignedTeam: string | null;
  assignedResponder: string | null;
  archivedAt: Date | null;
  spamFlags: unknown;
  payload: unknown;
}

const asEnum = <T extends string>(v: string, labels: Record<T, string>, fallback: T): T => (v in labels ? (v as T) : fallback);
export const asCaseStatus = (v: string) => asEnum<CaseStatus>(v, CASE_STATUS_LABELS, "new");
export const asAssistance = (v: string) => asEnum<AssistanceStatus>(v, ASSISTANCE_LABELS, "none");
export const asPriority = (v: string) => asEnum<CasePriority>(v, CASE_PRIORITY_LABELS, "medium");
export const asThreat = (v: string) => asEnum<ThreatLevel>(v, THREAT_LABELS, "none");
export const asAppeal = (v: string) => asEnum<AppealState>(v, APPEAL_LABELS, "none");

export const categoryOf = (r: Pick<CaseRowInput, "categoryGroup" | "category" | "customCategory">): IncidentCategory | null =>
  r.category && r.categoryGroup ? { group: r.categoryGroup, code: r.category, custom: r.customCategory } : null;

const payloadOf = (p: unknown) => (p && typeof p === "object" ? (p as { rawText?: string; locationText?: string | null }) : {});
export const excerpt = (text: string | undefined, n = 140) => {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

export function toReporterView(r: CaseRowInput, events: CaseEventView[]): ReporterCaseView {
  const status = asCaseStatus(r.caseStatus);
  const appealState = asAppeal(r.appealState);
  const rule = canAppeal(status, appealState);
  const p = payloadOf(r.payload);
  const cat = categoryOf(r);
  return {
    code: r.code,
    submittedAt: r.submittedAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    simulation: r.isSimulation,
    categoryLabel: categoryLabel(cat),
    groupLabel: groupLabel(r.categoryGroup),
    locationText: p.locationText ?? null,
    excerpt: excerpt(p.rawText, 160),
    caseStatus: status,
    caseStatusLabel: CASE_STATUS_LABELS[status],
    assistanceStatus: asAssistance(r.assistanceStatus),
    assistanceLabel: ASSISTANCE_LABELS[asAssistance(r.assistanceStatus)],
    assignedTeam: r.assignedTeam,
    rejectionReason: status === "rejected" || appealState !== "none" ? r.rejectionReason : null,
    appeal: {
      state: appealState,
      label: APPEAL_LABELS[appealState],
      message: r.appealMessage,
      decisionNote: r.appealDecisionNote,
      canAppeal: rule.ok,
      blockedReason: rule.ok ? null : rule.message,
    },
    canCancel: ["new", "open", "under_review", "awaiting_reporter", "awaiting_team", "reopened"].includes(status),
    timeline: events.filter((e) => e.visibility === "public"),
  };
}

export interface TeamCaseRow {
  code: string;
  submittedAt: string;
  updatedAt: string;
  simulation: boolean;
  categoryLabel: string;
  groupLabel: string;
  locationText: string | null;
  excerpt: string;
  caseStatus: CaseStatus;
  priority: CasePriority;
  threatLevel: ThreatLevel;
  assistanceStatus: AssistanceStatus;
  appealState: AppealState;
  assignedTeam: string | null;
  assignedResponder: string | null;
  archived: boolean;
  spamFlags: string[];
}

export function toTeamRow(r: CaseRowInput): TeamCaseRow {
  const p = payloadOf(r.payload);
  return {
    code: r.code,
    submittedAt: r.submittedAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    simulation: r.isSimulation,
    categoryLabel: categoryLabel(categoryOf(r)),
    groupLabel: groupLabel(r.categoryGroup),
    locationText: p.locationText ?? null,
    excerpt: excerpt(p.rawText, 120),
    caseStatus: asCaseStatus(r.caseStatus),
    priority: asPriority(r.priority),
    threatLevel: asThreat(r.threatLevel),
    assistanceStatus: asAssistance(r.assistanceStatus),
    appealState: asAppeal(r.appealState),
    assignedTeam: r.assignedTeam,
    assignedResponder: r.assignedResponder,
    archived: !!r.archivedAt,
    spamFlags: Array.isArray(r.spamFlags) ? r.spamFlags.filter((x): x is string => typeof x === "string") : [],
  };
}

// --- CSV ---
/** Cegah injeksi rumus spreadsheet: sel yang diawali = + - @ diberi apostrof. */
export function csvCell(v: unknown): string {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const CSV_HEADER = ["Kode", "Waktu lapor", "Jenis data", "Kelompok", "Kategori", "Lokasi", "Status kasus", "Prioritas", "Ancaman", "Status bantuan", "Banding", "Tim", "Penanda spam", "Diarsipkan"];
export function casesToCsv(rows: TeamCaseRow[]): string {
  const lines = [CSV_HEADER.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.code, r.submittedAt, r.simulation ? "SIMULASI" : "NYATA", r.groupLabel, r.categoryLabel, r.locationText,
        CASE_STATUS_LABELS[r.caseStatus], CASE_PRIORITY_LABELS[r.priority], THREAT_LABELS[r.threatLevel],
        ASSISTANCE_LABELS[r.assistanceStatus], APPEAL_LABELS[r.appealState], r.assignedTeam, r.spamFlags.join("; "), r.archived ? "ya" : "tidak",
      ].map(csvCell).join(","),
    );
  }
  return `﻿${lines.join("\r\n")}\r\n`;
}

export const maskEmail = (e: string) => e.replace(/^(.).*(@.*)$/, "$1•••$2");
export const maskPhone = (p: string) => (p.length <= 4 ? "••••" : `${"•".repeat(Math.max(p.length - 3, 3))}${p.slice(-3)}`);
export const maskName = (n: string) => n.split(/\s+/).map((w) => `${w.slice(0, 1)}•••`).join(" ");
