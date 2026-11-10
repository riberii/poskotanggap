import { createHash } from "node:crypto";
import { normalizeMessage } from "./normalize";

/** SHA-256 (hex, 64 karakter) dari pesan yang sudah dinormalisasi. Server-side saja. */
export function fingerprintMessage(text: string): string {
  return createHash("sha256").update(normalizeMessage(text), "utf8").digest("hex");
}
