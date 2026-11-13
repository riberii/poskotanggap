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
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2Z",
  camera: "M4 8h3l1.5-2h7L17 8h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z",
  video: "M3 7h12v10H3zM15 11l6-3v8l-6-3",
  clip: "M20 11.5 12 19.5a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4L14 8",
  close: "M6 6l12 12M18 6 6 18",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z",
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
