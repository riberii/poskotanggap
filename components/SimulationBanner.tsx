export function SimulationBanner() {
  return (
    <div role="note" className="border-b border-warn/20 bg-warn/10 text-warn">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-xs sm:px-6 lg:px-8">
        <span className="font-bold tracking-wide">MODE SIMULASI</span>
        <span className="text-ink/80">Bukan layanan darurat resmi. Gunakan data simulasi saja.</span>
      </div>
    </div>
  );
}
