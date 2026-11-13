export function SimulationBanner() {
  return (
    <div role="note" className="border-b border-warn/30 bg-warn/10 text-warn">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-xs sm:px-6 lg:px-8">
        <span className="font-bold tracking-wide">DATA SIMULASI</span>
        <span className="text-ink">Prototipe demo — bukan layanan darurat resmi. Jangan masukkan data korban sungguhan.</span>
      </div>
    </div>
  );
}
