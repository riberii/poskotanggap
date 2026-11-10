export function Panel({
  title,
  description,
  actions,
  children,
  className = "",
  id,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section aria-labelledby={headingId} className={`min-w-0 rounded-lg border border-navy-700 bg-navy-900 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-navy-700 px-4 py-3 sm:px-5">
        <div>
          <h2 id={headingId} className="text-sm font-semibold text-ink">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
        </div>
        {actions}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}
