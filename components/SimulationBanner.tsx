export function SimulationBanner() {
  return (
    <div role="note" className="border-b border-warn/40 bg-warn/10 text-warn">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-xs sm:px-6 lg:px-8">
        <span className="rounded-sm border border-warn/60 px-1.5 py-0.5 font-mono font-medium tracking-wider">
          SIMULATION DATA
        </span>
        <span className="text-ink/90">
          Semua data adalah simulasi untuk demonstrasi. Aplikasi ini tidak terhubung ke layanan
          tanggap darurat resmi.
        </span>
      </div>
    </div>
  );
}
