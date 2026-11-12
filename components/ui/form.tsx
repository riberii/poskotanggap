export const inputClass =
  "w-full rounded-md border border-navy-600 bg-navy-950 px-3 py-2 text-sm text-ink placeholder:text-subtle focus:border-teal-accent focus:outline-none focus:ring-1 focus:ring-teal-accent disabled:bg-navy-800 disabled:opacity-70";

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: React.ReactNode;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-xs font-semibold text-muted">
        {label}
      </label>
      {children}
      {hint && <div className="text-xs text-subtle">{hint}</div>}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-teal-accent text-navy-950 hover:bg-teal-strong",
  secondary: "border border-navy-600 bg-navy-950 text-ink hover:bg-navy-800",
  ghost: "text-muted hover:bg-navy-800 hover:text-ink",
  danger: "border border-danger/50 text-danger hover:bg-danger/10",
};

export function Button({
  variant = "secondary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
    />
  );
}

/** Kutipan bukti dari teks asli. null ditampilkan apa adanya sebagai "tidak ditemukan". */
export function Evidence({ quote }: { quote: string | null | undefined }) {
  return (
    <p className="rounded border-l-2 border-teal-accent bg-navy-850 px-2.5 py-1.5 text-xs text-muted">
      <span className="font-semibold text-subtle">Dari kalimat: </span>
      {quote ? <q className="text-ink">{quote}</q> : <em>tidak ditemukan di teks — mohon isi manual atau biarkan kosong</em>}
    </p>
  );
}
