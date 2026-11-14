/**
 * Deteksi kata bahaya OLEH KODE (bukan AI). AI hanya boleh menambah kewaspadaan; banner tampil
 * berdasarkan hasil ini walau AI menilai laporan "wajar". Informasi nomor adalah teks statis.
 */
export type DangerKind = "api" | "terjebak" | "korban";
export type EmergencyService = "damkar" | "ambulans" | "keduanya";

export interface DangerSignal {
  kind: DangerKind;
  /** Kata persis yang ditemukan di teks. */
  match: string;
}

const RULES: Array<[DangerKind, RegExp]> = [
  ["api", /\b(api|kebakaran|terbakar|membara|asap tebal|ledakan|meledak)\b/i],
  ["terjebak", /\b(terjebak|tertimbun|tertimpa|hanyut|tenggelam|terkurung)\b/i],
  ["korban", /\b(korban luka|luka[- ]luka|terluka|luka berat|berdarah|pingsan|sesak napas|patah tulang|meninggal|tewas|korban jiwa)\b/i],
];

export const DANGER_LABELS: Record<DangerKind, string> = {
  api: "Ada api atau kebakaran",
  terjebak: "Ada orang terjebak",
  korban: "Ada korban luka atau sakit",
};

export function detectDanger(text: string): DangerSignal[] {
  const out: DangerSignal[] = [];
  for (const [kind, re] of RULES) {
    const m = re.exec(text);
    if (m) out.push({ kind, match: m[0] });
  }
  return out;
}

/** api/terjebak → Damkar (113); korban → Ambulans (119). Aturan tetap, bukan keluaran model. */
export function servicesFor(signals: DangerSignal[]): EmergencyService | null {
  const damkar = signals.some((s) => s.kind === "api" || s.kind === "terjebak");
  const ambulans = signals.some((s) => s.kind === "korban");
  if (damkar && ambulans) return "keduanya";
  return damkar ? "damkar" : ambulans ? "ambulans" : null;
}
