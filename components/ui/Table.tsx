export function Table({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <div className="-mx-4 overflow-x-auto sm:-mx-5">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
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
