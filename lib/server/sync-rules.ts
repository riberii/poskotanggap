import { CASE_STATUS_LABELS, TERMINAL_REJECTED, type CaseStatus } from "@/lib/domain/case";

export { TERMINAL_REJECTED };
export const asCaseStatusLike = (v: string): CaseStatus => (v in CASE_STATUS_LABELS ? (v as CaseStatus) : "new");
