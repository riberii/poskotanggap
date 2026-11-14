// Evaluasi ekstraksi: aturan vs AI vs hibrida pada eval/cases.jsonl. Hasil NYATA ditulis ke docs/EVAL.md
// (bagian di bawah penanda CATATAN dipertahankan). AI hanya dijalankan bila ada kredensial di env.
//   npm run eval            -> aturan + AI + hibrida (bila kredensial ada)
//   npm run eval -- --no-ai -> hanya aturan
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { extractWithAi } from "../lib/ai/extract-handler";
import { hasAiCredentials, getModel } from "../lib/ai/common";
import { enforceEvidence } from "../lib/domain/extractors";
import { revalidateDraft, quantityAppearsIn } from "../lib/domain/ai-extraction";
import { detectDanger } from "../lib/domain/danger";
import { mergeReaders } from "../lib/domain/hybrid";
import { normalizeArea, normalizeItem } from "../lib/domain/normalize";
import { simulateExtraction } from "../lib/domain/simulated-extractor";
import type { ExtractionResult } from "../lib/domain/types";

interface Case {
  id: string;
  tags: string[];
  text: string;
  expect: { incident: string | null; location: string | null; needs: Array<{ item: string; quantity: number | null; unit: string | null; basis: string }>; danger: boolean };
}
const cases: Case[] = readFileSync("eval/cases.jsonl", "utf8").trim().split("\n").map((l) => JSON.parse(l));
const NO_AI = process.argv.includes("--no-ai");
const aiAvailable = !NO_AI && hasAiCredentials();

type SystemName = "aturan" | "ai" | "hibrida";
type Pred = ExtractionResult | null; // null = pembaca gagal untuk kasus ini

const preds: Record<SystemName, Pred[]> = { aturan: [], ai: [], hibrida: [] };
const aiErrors: string[] = [];

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

const rulesAll = cases.map((c) => enforceEvidence(simulateExtraction(c.text), c.text));
preds.aturan = rulesAll;
if (aiAvailable) {
  const quiet = console.error;
  console.error = () => {};
  const aiRaw = await pool(cases, 3, async (c) => {
    try {
      return revalidateDraft((await extractWithAi(c.text)).extraction, c.text);
    } catch (e) {
      aiErrors.push(`${c.id}: ${(e as { code?: string }).code ?? (e as Error).message}`);
      return null;
    }
  });
  console.error = quiet;
  preds.ai = aiRaw;
  preds.hibrida = aiRaw.map((a, i) => (a ? mergeReaders(rulesAll[i], a) : null));
}

const pct = (a: number, b: number) => (b === 0 ? "n/a" : `${((100 * a) / b).toFixed(1)}% (${a}/${b})`);
const norm = (s: string | null) => (s === null ? null : normalizeArea(s));
const textHasLocation = (loc: string, text: string) => text.toLowerCase().replace(/\s+/g, " ").includes(loc.toLowerCase().replace(/\s+/g, " "));

function score(name: SystemName) {
  const P = preds[name];
  const m = { n: 0, incident: 0, location: 0, expItems: 0, itemHit: 0, predItems: 0, qty: 0, unit: 0, basis: 0, qtyWrongFilled: 0, qtyFilled: 0, halluNum: 0, halluLoc: 0, checks: 0, injOk: 0, injN: 0 };
  const failures: string[] = [];
  cases.forEach((c, i) => {
    const p = P[i];
    if (!p) return;
    m.n++;
    const okInc = p.incidentType === c.expect.incident;
    const okLoc = norm(p.locationText) === norm(c.expect.location);
    if (okInc) m.incident++; else failures.push(`${c.id} kejadian: ${p.incidentType} ≠ ${c.expect.incident}`);
    if (okLoc) m.location++; else failures.push(`${c.id} lokasi: ${p.locationText} ≠ ${c.expect.location}`);
    m.predItems += p.needs.length;
    m.checks += p.checks?.length ?? 0;
    let wrongFilled = false;
    for (const e of c.expect.needs) {
      m.expItems++;
      const q = p.needs.find((n) => normalizeItem(n.item) === normalizeItem(e.item));
      if (!q) { failures.push(`${c.id} barang hilang: ${e.item}`); continue; }
      m.itemHit++;
      if (q.quantity === e.quantity) m.qty++; else failures.push(`${c.id} jumlah ${e.item}: ${q.quantity} ≠ ${e.quantity}`);
      if (q.unit === e.unit) m.unit++; else failures.push(`${c.id} satuan ${e.item}: ${q.unit} ≠ ${e.unit}`);
      if (q.quantityBasis === e.basis) m.basis++; else failures.push(`${c.id} basis ${e.item}: ${q.quantityBasis} ≠ ${e.basis}`);
    }
    for (const q of p.needs) {
      if (q.quantity !== null) {
        m.qtyFilled++;
        const exp = c.expect.needs.find((e) => normalizeItem(e.item) === normalizeItem(q.item));
        if (!exp || exp.quantity !== q.quantity) { m.qtyWrongFilled++; wrongFilled = true; failures.push(`${c.id} ANGKA SALAH TERISI ${q.item}: ${q.quantity} (label: ${exp ? exp.quantity : "barang tidak dilabeli"})`); }
        if (!quantityAppearsIn(q.quantity, c.text)) m.halluNum++;
      }
    }
    if (p.locationText && !textHasLocation(p.locationText, c.text)) m.halluLoc++;
    if (c.tags.includes("injeksi")) { m.injN++; if (!wrongFilled && okInc && okLoc) m.injOk++; }
  });
  return { m, failures };
}

const names: SystemName[] = aiAvailable ? ["aturan", "ai", "hibrida"] : ["aturan"];
const S = Object.fromEntries(names.map((n) => [n, score(n)])) as Record<SystemName, ReturnType<typeof score>>;
const dangerOk = cases.filter((c) => (detectDanger(c.text).length > 0) === c.expect.danger).length;

const row = (label: string, f: (n: SystemName) => string) => `| ${label} | ${names.map(f).join(" | ")} |`;
const table = [
  `| Metrik | ${names.join(" | ")} |`,
  `|---|${names.map(() => "---").join("|")}|`,
  row("Kasus yang dinilai", (n) => String(S[n].m.n)),
  row("Jenis kejadian benar", (n) => pct(S[n].m.incident, S[n].m.n)),
  row("Lokasi benar", (n) => pct(S[n].m.location, S[n].m.n)),
  row("Barang ditemukan (recall)", (n) => pct(S[n].m.itemHit, S[n].m.expItems)),
  row("Jumlah benar (termasuk null yang benar)", (n) => pct(S[n].m.qty, S[n].m.expItems)),
  row("Satuan benar", (n) => pct(S[n].m.unit, S[n].m.expItems)),
  row("Basis (tambahan/total/unknown) benar", (n) => pct(S[n].m.basis, S[n].m.expItems)),
  row("Jumlah TERISI tetapi salah", (n) => `${S[n].m.qtyWrongFilled} dari ${S[n].m.qtyFilled} terisi`),
  row("Halusinasi angka (tidak ada di teks)", (n) => String(S[n].m.halluNum)),
  row("Halusinasi lokasi (tidak ada di teks)", (n) => String(S[n].m.halluLoc)),
  row("Tanda “periksa” untuk operator", (n) => String(S[n].m.checks)),
  row("Kasus injeksi lolos", (n) => pct(S[n].m.injOk, S[n].m.injN)),
].join("\n");

const model = getModel();
const stamp = new Date().toISOString();
const head = `# Evaluasi ekstraksi

Dibuat otomatis oleh \`npm run eval\` pada ${stamp}. ${cases.length} pesan fiktif berlabel manual di \`eval/cases.jsonl\`.
Pembaca: **aturan** (regex, tanpa AI), **ai** (${aiAvailable ? `Gemini \`${model}\`` : "BELUM DIJALANKAN: tidak ada kredensial AI di lingkungan ini"}), **hibrida** (penggabung dua pembaca; nilai yang berbeda dikosongkan dan ditandai “periksa”).

Metode: satu panggilan per pesan, suhu 0, teks diredaksi sebelum ke model, draf AI divalidasi ulang terhadap teks asli (kutipan harus persis). "Halusinasi angka" = angka terisi yang tidak tertulis di pesan (digit maupun kata bilangan). Label dibuat oleh tim, bukan pihak independen, dan 46 kasus terlalu sedikit untuk klaim statistik.

## Hasil

${table}

Deteksi kata bahaya (kode, bukan AI): ${pct(dangerOk, cases.length)} kasus cocok dengan label.
${aiErrors.length ? `\nKasus yang gagal dipanggil ke AI (dikeluarkan dari penilaian AI/hibrida): ${aiErrors.length}\n${aiErrors.map((e) => `- ${e}`).join("\n")}\n` : ""}
## Kesalahan per kasus

${names.map((n) => `### ${n}\n${S[n].failures.length ? S[n].failures.map((f) => `- ${f}`).join("\n") : "- (tidak ada)"}`).join("\n\n")}

`;
const MARK = "<!-- CATATAN -->";
let tail = `${MARK}\n\n## Catatan\n\n(belum ditulis)\n`;
if (existsSync("docs/EVAL.md")) {
  const old = readFileSync("docs/EVAL.md", "utf8");
  const i = old.indexOf(MARK);
  if (i !== -1) tail = old.slice(i);
}
writeFileSync("docs/EVAL.md", head + tail);
writeFileSync("eval/results.json", JSON.stringify({ stamp, model: aiAvailable ? model : null, metrics: Object.fromEntries(names.map((n) => [n, S[n].m])), aiErrors }, null, 2) + "\n");
console.log(table);
console.log(`\nDanger: ${pct(dangerOk, cases.length)}; AI ${aiAvailable ? "dijalankan" : "TIDAK dijalankan"}; ditulis ke docs/EVAL.md`);
