import { Link, useLocation } from "react-router-dom";

const TEAM_NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/intake", label: "Periksa laporan" },
];

/** Halaman pelapor: header sederhana. Halaman tim: navigasi tim + jalan kembali ke halaman pelapor. */
export function AppHeader({ team }: { team: boolean }) {
  const { pathname } = useLocation();
  return (
    <header className="glass-header">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-3 sm:px-6 lg:px-8">
        <Link to="/" aria-label="POSKOTANGGAP — halaman pelapor"><Brand team={team} /></Link>
        {team ? (
          <nav aria-label="Navigasi tim" className="flex flex-wrap items-center gap-1">
            {TEAM_NAV.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-md px-3.5 py-2.5 text-sm font-semibold ${active ? "bg-teal-accent text-white" : "text-muted hover:bg-navy-800 hover:text-ink"}`}
                >
                  {item.label}
                </Link>
              );
            })}
            <Link to="/" className="rounded-md border border-navy-600 px-3.5 py-2.5 text-sm font-semibold text-ink hover:bg-navy-800">← Pelapor</Link>
          </nav>
        ) : (
          <Link to="/dashboard" className="rounded-md border border-navy-600 px-3.5 py-2.5 text-sm font-semibold text-ink hover:bg-navy-800">Halaman tim</Link>
        )}
      </div>
    </header>
  );
}

function Brand({ team }: { team: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span aria-hidden className="grid h-9 w-9 place-items-center rounded-md bg-teal-accent text-white">
        <svg width="23" height="23" viewBox="0 0 24 24" fill="none"><path d="M12 3v18M3 12h18" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/><path d="M7 7l10 10M17 7L7 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".5"/></svg>
      </span>
      <div>
        <p className="text-sm font-bold tracking-wide">POSKO<span className="text-teal-accent">TANGGAP</span></p>
        <p className="text-xs text-muted">{team ? "Tim posko" : "Lapor kejadian"}</p>
      </div>
    </div>
  );
}
