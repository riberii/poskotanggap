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

/** "Apa yang paling butuh perhatian sekarang?" Maks 3 kartu di layar pertama; sisanya dilipat. */
export function AttentionPanel({ items }: { items: AttentionItem[] }) {
  const order: Severity[] = ["critical", "warning", "info"];
  const sorted = order.flatMap((sev) => items.filter((i) => i.severity === sev));
  const top = sorted.slice(0, 3);
  const rest = sorted.slice(3);
  const Card = ({ i }: { i: AttentionItem }) => {
    const st = STYLE[i.severity];
    return (
      <li className={`${i.severity === "critical" ? "pulse-once" : ""} rounded-md border px-3 py-2.5 ${st.box}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="min-w-0 text-sm font-semibold text-ink">
            <span className={`mr-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-bold ${st.tag}`}><Icon name={st.icon} size={12} />{st.label}</span>
            {i.title}
          </p>
          <Action item={i} />
        </div>
        {i.detail && (
          <details className="mt-1"><summary className="cursor-pointer text-xs text-muted">Rincian</summary><p className="mt-1 text-sm text-muted">{i.detail}</p></details>
        )}
      </li>
    );
  };
  return (
    <section aria-labelledby="attention-title">
      <h2 id="attention-title" className="mb-2 text-base font-bold">Perlu perhatian sekarang</h2>
      <ul className="space-y-2">{top.map((i) => <Card key={i.id} i={i} />)}</ul>
      {rest.length > 0 && (
        <details className="mt-2"><summary className="cursor-pointer text-sm font-semibold text-teal-accent">Lainnya ({rest.length})</summary>
          <ul className="mt-2 space-y-2">{rest.map((i) => <Card key={i.id} i={i} />)}</ul>
        </details>
      )}
    </section>
  );
}
