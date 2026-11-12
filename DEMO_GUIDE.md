# Demo Guide — POSKOTANGGAP (≈4 min, all data synthetic)

Two views: **Report Intake** (`/intake`) and **Situation Dashboard** (`/dashboard`).
Before you start: open the app in a fresh tab and press **Reset data simulasi → Ya, reset** so the seed is in a known state.

## Opening (20 s)
Point at the amber **SIMULATION DATA** banner and the storage notice: "All data is fictional, stored only in this browser, not synced, not connected to any emergency service. Extraction is rule-based, not AI."

## View 1 — Report Intake (≈2 min)
1. Choose **Laporan baru (normal)** in "Isi contoh simulasi…" → **Ekstrak (berbasis aturan)**.
   Expect: badge *RuleBasedExtractor · berbasis aturan, bukan AI*, Banjir, *Desa Contoh Makmur*, three needs (air mineral 20 dus, selimut 30 lembar, popok 10 paket), each with a quoted evidence line from the original text.
2. **Edit**: clear the popok quantity (it stays unknown — not guessed). Change nothing else. Click **Verifikasi laporan** → "terverifikasi dan masuk ke rekap".
3. **Exact duplicate**: pick the same sample, extract, verify → blocked: "Laporan identik sudah tercatat… tidak dihitung dua kali."
4. **Potential duplicate**: pick **Mirip laporan lain**, extract, verify → the verify button is gated by the amber *Potensi duplikat* panel showing the earlier report. Tick the confirmation checkbox, verify.
5. **Missing data**: pick **Tanpa lokasi & kuantitas**, extract → location empty, quantities empty; **Verifikasi** is refused until a location is entered.

## View 2 — Situation Dashboard (≈1.5 min)
6. Open **Situation Dashboard**. Walk through the four status counts, then **Rekap kebutuhan vs stok**:
   - *Simulasi Barat RW 03 · air mineral · dus*: 30 + 15 = 45 requested vs 12 in stock → shortage 33 (the seeded 120-dus "total" update is still pending review, so it is not counted).
   - *Fiktif Jaya · air mineral · botol*: badge **Satuan berbeda** — stock exists only in *dus*; units are never converted.
   - *Fiktif Jaya · tenda*: **Tidak ada data stok**; the shortage is unknown, not assumed to be zero stock.
   - The grey box lists what was **not** counted and why (unverified reports, unknown/total basis, missing quantity).
7. In **Perbarui stok** enter area `Desa Contoh Makmur`, item `air mineral`, unit `dus`, `10` → a new row appears: 20 requested vs 10 in stock → shortage 10. Try `-3` → rejected.
8. Reload the page: data persists. Click **Reset data simulasi** (cancel once to show the confirmation, then confirm) to return to the seed.

## Talking points
- Humans verify everything; the extractor only drafts.
- Totals count verified, "additional" quantities only; deterministic arithmetic, no AI in the numbers.
- Limits: single-browser storage, small item catalog, prototype only.
