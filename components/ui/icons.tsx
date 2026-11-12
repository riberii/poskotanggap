// Ikon sederhana (stroke). Dipakai agar status tidak hanya dibedakan lewat warna.
const PATHS = {
  critical: "M12 3 2.5 20h19L12 3Zm0 6v5m0 3v.01", // segitiga seru (tegas)
  warning: "M12 8v5m0 3.5v.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z",
  ok: "M5 12.5l4.5 4.5L19 7.5",
  duplicate: "M8 8h11v11H8zM5 15V5h10",
  unknown: "M9.5 9a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1.9-1.1 1.8M12 17v.01",
  unit: "M4 8h6m-3-3 3 3-3 3M20 16h-6m3 3-3-3 3-3",
  info: "M12 11v6m0-9.5v.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z",
  arrow: "M5 12h14m-6-6 6 6-6 6",
  plus: "M12 5v14M5 12h14",
  doc: "M7 3h7l4 4v14H7zM14 3v5h5M9.5 13h6M9.5 17h6",
  box: "M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5zM3.5 7.5 12 12l8.5-4.5M12 12v9",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16, className = "" }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
