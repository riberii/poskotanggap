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
    <section aria-labelledby={headingId} className={`glass-panel min-w-0 rounded-2xl ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 px-5 py-4 sm:px-6">
        <div>
          <h2 id={headingId} className="text-base font-semibold text-ink">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
        </div>
        {actions}
      </div>
      <div className="p-5 sm:p-6">{children}</div>
    </section>
  );
}
