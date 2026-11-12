import { normalizeMessage } from "./normalize";
import { sha256Hex } from "./sha256";

/** SHA-256 (hex, 64 karakter) dari pesan yang sudah dinormalisasi. Isomorfik: server & browser. */
export function fingerprintMessage(text: string): string {
  return sha256Hex(normalizeMessage(text));
}
