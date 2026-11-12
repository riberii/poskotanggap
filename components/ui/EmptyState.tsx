import { Icon, type IconName } from "./icons";

const TONE = {
  neutral: "border-navy-700 bg-navy-850 text-muted",
  ok: "border-ok/30 bg-ok/5 text-ok",
  danger: "border-danger/40 bg-danger/5 text-danger",
  warn: "border-warn/40 bg-warn/5 text-warn",
} as const;

/** Keadaan kosong / sukses / error yang selalu menjelaskan apa yang terjadi dan langkah berikutnya. */
export function EmptyState({
  icon = "info",
  title,
  body,
  action,
  tone = "neutral",
  role,
}: {
  icon?: IconName;
  title: string;
  body?: React.ReactNode;
  action?: React.ReactNode;
  tone?: keyof typeof TONE;
  role?: "alert" | "status";
}) {
  return (
    <div role={role} className={`flex gap-3 rounded-md border px-4 py-5 ${TONE[tone]}`}>
      <Icon name={icon} size={20} className="mt-0.5" />
      <div className="min-w-0 text-sm">
        <p className="font-bold text-ink">{title}</p>
        {body && <p className="mt-1 text-muted">{body}</p>}
        {action && <div className="mt-3 text-sm">{action}</div>}
      </div>
    </div>
  );
}
