import { Link, useLocation } from "react-router-dom";
import type { DataMode } from "@/lib/data/repository";

const NAV = [
  { href: "/intake", label: "Report Intake", hint: "Input & verifikasi" },
  { href: "/dashboard", label: "Situation Dashboard", hint: "Rekap kebutuhan & stok" },
];

export function AppHeader({ mode }: { mode: DataMode }) {
  const { pathname } = useLocation();
  return (
    <header className="border-b border-navy-700 bg-navy-900">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <Brand mode={mode} />
        <div className="flex items-center gap-2">
          <nav aria-label="Navigasi utama" className="flex gap-1 rounded-md border border-navy-700 bg-navy-950 p-1">
            {NAV.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                    active ? "bg-navy-700 text-ink" : "text-muted hover:bg-navy-800 hover:text-ink"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
}


function Brand({ mode }: { mode: DataMode }) {
  return (
    <div className="flex items-center gap-3">
      <span aria-hidden className="grid h-8 w-8 place-items-center rounded bg-teal-accent font-mono text-sm font-bold text-navy-950">
        PT
      </span>
      <div>
        <p className="text-sm font-semibold tracking-wide">POSKOTANGGAP</p>
        <p className="text-xs text-subtle">
          Prototipe konsol operator ·{" "}
          {mode === "local" ? "mode prototipe (localStorage browser)" : "mode Supabase"}
        </p>
      </div>
    </div>
  );
}
