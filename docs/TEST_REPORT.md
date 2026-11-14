# Laporan tes

Hanya perintah yang benar-benar dijalankan. Lingkungan: Node v22, 14 Nov 2026.

## Baseline awal (kode apa adanya dari paket yang diterima)
| Perintah | Hasil |
|---|---|
| `npm ci` | berhasil, 0 vulnerabilities |
| `npm run typecheck` | bersih, tanpa error |
| `npm test` | lulus semua: 11 berkas, 129 tes (angka dihitung dari proses ini: 130 dengan satu tes sementara yang kemudian dihapus) |
| `npm run build` | berhasil; `dist/assets/index-*.js` 565,34 kB (gzip 170,96 kB), CSS 36,28 kB |

Tidak ada yang rusak, jadi tidak ada perbaikan `fix:`. `.gitignore` belum ada dan dibuat (node_modules, dist, .env, .netlify).

## Setelah semua perubahan
| Perintah | Hasil |
|---|---|
| `npm ci` | berhasil |
| `npm run typecheck` | bersih |
| `npm test` | **14 berkas, 152 tes, 0 gagal** |
| `npm run build` | berhasil; JS 575,56 kB (gzip 174,45 kB), CSS 36,88 kB. Peringatan Vite: chunk > 500 kB (sudah ada sebelumnya) |

Tes baru: `tests/injection.test.ts` (4), `tests/auth.test.ts` (13), `tests/sitrep.test.ts` (6). Satu tes lama disesuaikan (`tests/ai-extraction.test.ts`: handler menerima `authorize` agar tidak membutuhkan sesi).

## Tidak dijalankan
- `npm run eval` dengan AI: tidak ada `GEMINI_API_KEY` di lingkungan ini. Angka di `docs/EVAL.md` tidak diubah.
- Pemeriksaan visual 390 px / 1280 px (scroll horizontal) dan alur dua-perangkat di browser nyata: tidak dijalankan (tidak ada browser/server dev). Kontras dihitung dari token warna, bukan diukur di layar.
- Respons 2xx endpoint publik `/api/sync/*` (butuh Netlify Database): tidak dijalankan; tes hanya memastikan endpoint publik tidak memberi 401 dan memvalidasi kode (400).
- Alur `/demo` dan sinkron dua perangkat: tidak dijalankan end to end.
