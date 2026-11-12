import { Link } from "react-router-dom";
import { Icon, type IconName } from "@/components/ui/icons";
import type { AttentionItem, Severity } from "./attention";

const STYLE: Record<Severity, { label: string; icon: IconName; box: string; tag: string }> = {
  critical: { label: "KRITIS", icon: "critical", box: "border-danger/40 bg-danger/5", tag: "bg-danger text-white" },
  warning: { label: "PERINGATAN", icon: "warning", box: "border-warn/40 bg-warn/5", tag: "bg-warn text-white" },
  info: { label: "INFORMASI", icon: "info", box: "border-navy-700 bg-navy-850", tag: "bg-navy-700 text-ink" },
};

function Action({ item }: { item: AttentionItem }) {
  if (!item.href || !item.actionLabel) return null;
  const cls = "inline-flex shrink-0 items-center gap-1 rounded-md border border-navy-600 bg-white px-3 py-1.5 text-xs font-semibold text-ink hover:bg-navy-800";
  const inner = (
    <>
      {item.actionLabel}
      <Icon name="arrow" size={12} />
    </>
  );
  return item.href.startsWith("#") ? (
    <a href={item.href} className={cls}>{inner}</a>
  ) : (
    <Link to={item.href} className={cls}>{inner}</Link>
  );
}

/** "Apa yang paling butuh perhatian sekarang?" — dikelompokkan KRITIS → PERINGATAN → INFORMASI. */
export function AttentionPanel({ items }: { items: AttentionItem[] }) {
  const order: Severity[] = ["critical", "warning", "info"];
  return (
    <section aria-labelledby="attention-title" className="rounded-lg border border-navy-700 bg-white">
      <div className="border-b border-navy-700 px-5 py-3.5 sm:px-6">
        <h2 id="attention-title" className="text-base font-bold">Perlu perhatian sekarang</h2>
        <p className="mt-0.5 text-sm text-muted">Diurutkan dari yang paling mendesak. Dihitung hanya dari data terverifikasi.</p>
      </div>
      <div className="space-y-5 p-5 sm:p-6">
        {order.map((sev) => {
          const group = items.filter((i) => i.severity === sev);
          if (group.length === 0) return null;
          const st = STYLE[sev];
          return (
            <div key={sev}>
              <h3 className="mb-2 flex items-center gap-2 text-xs font-bold tracking-wider text-muted">
                <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${st.tag}`}>
                  <Icon name={st.icon} size={12} />
                  {st.label}
                </span>
                <span>{group.length}</span>
              </h3>
              <ul className="space-y-2">
                {group.map((i) => (
                  <li key={i.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3 ${st.box}`}>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">{i.title}</p>
                      {i.detail && <p className="mt-0.5 text-sm text-muted">{i.detail}</p>}
                    </div>
                    <Action item={i} />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
