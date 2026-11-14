// Server API lokal untuk `npm run dev`: memakai modul handler yang SAMA dengan Netlify Function.
// Vite meneruskan /api/* ke sini (lihat vite.config.mts). Muat .env bila ada (tanpa dependensi).
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { handleAnalyze } from "../lib/ai/analyze-handler";
import { handleExtract } from "../lib/ai/extract-handler";

if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && m[2] && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const routes: Record<string, (r: Request) => Promise<Response>> = {
  "/api/extract": handleExtract,
  "/api/analyze-report": handleAnalyze,
};
const port = Number(process.env.API_PORT ?? 8788);

createServer(async (req, res) => {
  const handler = routes[(req.url ?? "").split("?")[0]];
  if (!handler) {
    res.writeHead(404).end();
    return;
  }
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const request = new Request(`http://localhost${req.url}`, {
    method: req.method,
    headers: req.headers as Record<string, string>,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : Buffer.concat(chunks),
  });
  const out = await handler(request);
  res.writeHead(out.status, Object.fromEntries(out.headers));
  res.end(Buffer.from(await out.arrayBuffer()));
}).listen(port, "127.0.0.1", () => console.log(`[dev-api] http://127.0.0.1:${port} (AI ${process.env.GEMINI_API_KEY || process.env.NETLIFY_AI_GATEWAY_KEY ? "aktif" : "NONAKTIF: tidak ada kunci"})`));
