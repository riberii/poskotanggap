export function Table({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <div className="-mx-4 sm:-mx-5">
      <p className="px-4 pb-2 text-xs text-muted sm:hidden">Geser tabel ke samping untuk melihat semua kolom.</p>
      <div className="overflow-x-auto" role="region" aria-label={caption} tabIndex={0}>
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          {children}
        </table>
      </div>
    </div>
  );
}

export function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      scope="col"
      className={`border-b border-navy-700 bg-navy-850 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted first:pl-4 sm:first:pl-5 ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  mono = false,
  className = "",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  mono?: boolean;
  className?: string;
}) {
  return (
    <td
      className={`border-b border-navy-700/70 px-4 py-2.5 align-top first:pl-4 sm:first:pl-5 ${align === "right" ? "text-right" : ""} ${
        mono ? "font-mono tabular-nums" : ""
      } ${className}`}
    >
      {children}
    </td>
  );
}
