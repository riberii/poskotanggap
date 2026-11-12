import { Link, useLocation } from "react-router-dom";
import type { DataMode } from "@/lib/data/repository";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/intake", label: "Laporan & verifikasi" },
];

export function AppHeader({ mode }: { mode: DataMode }) {
  const { pathname } = useLocation();
  return (
    <header className="glass-header">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <Brand mode={mode} />
        <div className="flex items-center gap-2">
          <nav aria-label="Navigasi utama" className="flex gap-1 rounded-md border border-navy-700 bg-navy-900 p-1">
            {NAV.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded px-4 py-2 text-sm font-semibold transition-colors ${
                    active ? "bg-teal-accent text-white" : "text-muted hover:bg-navy-800 hover:text-ink"
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
      <span aria-hidden className="grid h-9 w-9 place-items-center rounded-md bg-teal-accent text-white">
        <svg width="23" height="23" viewBox="0 0 24 24" fill="none"><path d="M12 3v18M3 12h18" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/><path d="M7 7l10 10M17 7L7 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".5"/></svg>
      </span>
      <div>
        <p className="text-sm font-bold tracking-wide">POSKO<span className="text-teal-accent">TANGGAP</span></p>
        <p className="text-xs text-muted">Laporan → verifikasi → kebutuhan vs stok</p>
      </div>
    </div>
  );
}
