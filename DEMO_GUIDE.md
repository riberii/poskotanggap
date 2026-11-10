# Demo Guide (≈3 min, all data synthetic)
1. `npm install && npm run dev` → open `/intake`. Point out the SIMULATION DATA banner and the localStorage notice.
2. "Isi contoh simulasi…" → **Laporan baru (normal)** → **Ekstrak (berbasis aturan)**. Show the RuleBasedExtractor badge and evidence quotes per field.
3. Edit a quantity, clear one quantity (stays unknown), then **Verifikasi**.
4. Choose the same sample again → extract → verify: blocked as exact duplicate.
5. Sample **Mirip laporan lain** → verify is blocked until the "potential duplicate reviewed" checkbox is ticked.
6. Sample **Tanpa lokasi & kuantitas** → fields stay empty; verification requires a location.
7. Open **Situation Dashboard**: status counts, needs vs stock (shortage), excluded items. Set stock in "Perbarui stok" and watch the shortage update.
8. Reload to show persistence; **Reset data simulasi** (with confirmation) restores the seed.
