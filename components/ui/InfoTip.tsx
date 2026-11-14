/** Penjelasan panjang disimpan di balik tombol kecil (tidak dihitung sebagai teks layar pertama). */
export function InfoTip({ children, label = "Info" }: { children: React.ReactNode; label?: string }) {
  return (
    <details className="relative inline-block align-middle">
      <summary className="inline-flex min-h-6 cursor-pointer list-none items-center rounded border border-navy-600 px-1.5 text-xs font-semibold text-muted hover:bg-navy-800">{label}</summary>
      <p className="absolute left-0 top-full z-20 mt-1 w-64 rounded-md border border-navy-700 bg-white p-3 text-xs font-normal text-ink shadow-md">{children}</p>
    </details>
  );
}
