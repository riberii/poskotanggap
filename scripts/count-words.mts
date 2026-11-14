// Menghitung kata yang TERLIHAT per layar di 1280 px (halaman penuh + layar pertama 1280x800).
// Pakai: npx vite --port 5199 &  lalu  npx tsx scripts/count-words.mts [http://127.0.0.1:5199] [label]
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://127.0.0.1:5199";
const label = process.argv[3] ?? "";

/** Jalan di browser: hitung kata dari node teks yang benar-benar tampak (bukan sr-only, bukan <details> tertutup). */
function countVisible(viewportH: number) {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let all = 0;
  let first = 0;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = (n.textContent ?? "").trim();
    const el = n.parentElement;
    if (!text || !el) continue;
    if (["SCRIPT", "STYLE", "NOSCRIPT"].includes(el.tagName)) continue;
    if (el.closest("[hidden],[aria-hidden='true'],[inert]")) continue;
    const closedDetails = el.closest("details:not([open])");
    if (closedDetails && !el.closest("summary")) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    const r = range.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const words = text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
    all += words;
    if (r.top < viewportH) first += words;
  }
  return { all, first };
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const rows: Array<[string, number, number]> = [];
const measure = async (name: string) => {
  await page.waitForTimeout(700);
  const r = await page.evaluate(countVisible, 800);
  rows.push([name, r.all, r.first]);
};

await page.goto(`${base}/dashboard`);
await page.waitForSelector("h1");
await measure("/dashboard");

await page.goto(`${base}/intake`);
await page.waitForSelector("h1");
await measure("/intake (kosong)");

await page.getByRole("button", { name: /^A ·/ }).click();
await page.waitForSelector("#location");
await measure("/intake (laporan A dianalisis)");

console.log(`\nKata terlihat @1280px ${label}`);
console.log("layar".padEnd(34), "halaman penuh".padStart(14), "layar pertama".padStart(14));
for (const [n, a, f] of rows) console.log(n.padEnd(34), String(a).padStart(14), String(f).padStart(14));
await browser.close();
